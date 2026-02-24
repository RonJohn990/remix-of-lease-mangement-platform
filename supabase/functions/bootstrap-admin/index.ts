import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { z } from 'https://esm.sh/zod@3.23.8'

const allowedOrigins = (Deno.env.get('ALLOWED_ORIGINS') || '').split(',').map(s => s.trim()).filter(Boolean)

function getCorsHeaders(req: Request) {
  const origin = req.headers.get('Origin') || ''
  const allowed = allowedOrigins.length === 0 || allowedOrigins.includes(origin)
  return {
    'Access-Control-Allow-Origin': allowed ? origin : allowedOrigins[0] || '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  }
}

const bootstrapSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8).max(72),
  full_name: z.string().min(1).max(255),
  check_only: z.literal(undefined).or(z.literal(false)).optional(),
})

const checkOnlySchema = z.object({
  check_only: z.literal(true),
})

function safeErrorMessage(error: unknown): string {
  const msg = error instanceof Error ? error.message : String(error)
  console.error('bootstrap-admin error:', msg)
  if (msg.includes('already exists')) return 'Admin already exists. Use the login page.'
  return 'An error occurred processing your request'
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const adminClient = createClient(supabaseUrl, serviceRoleKey)

    const body = await req.json()

    // Check if any admin exists
    const { data: existingAdmins } = await adminClient
      .from('user_roles')
      .select('id')
      .eq('role', 'admin')
      .limit(1)

    const adminExists = existingAdmins && existingAdmins.length > 0

    // If check_only, return setup status
    const checkParsed = checkOnlySchema.safeParse(body)
    if (checkParsed.success) {
      return new Response(JSON.stringify({ needs_setup: !adminExists }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Block if admin exists
    if (adminExists) {
      return new Response(JSON.stringify({ error: 'Admin already exists. Use the login page.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Validate input
    const parsed = bootstrapSchema.safeParse(body)
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: 'Invalid input: ' + parsed.error.issues.map(i => i.message).join(', ') }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { email, password, full_name } = parsed.data

    // Use advisory lock to prevent race condition during bootstrap
    const { data: lockResult } = await adminClient.rpc('pg_try_advisory_lock' as any, { key: 1 } as any).maybeSingle()

    // Double-check admin doesn't exist after acquiring lock
    const { data: recheck } = await adminClient
      .from('user_roles')
      .select('id')
      .eq('role', 'admin')
      .limit(1)

    if (recheck && recheck.length > 0) {
      return new Response(JSON.stringify({ error: 'Admin already exists. Use the login page.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name },
    })
    if (createError) throw createError

    if (newUser.user) {
      await adminClient.from('user_roles').insert({
        user_id: newUser.user.id,
        role: 'admin',
      })
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error: any) {
    return new Response(JSON.stringify({ error: safeErrorMessage(error) }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
