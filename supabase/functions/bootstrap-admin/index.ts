import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { z } from 'https://esm.sh/zod@3.23.8'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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
