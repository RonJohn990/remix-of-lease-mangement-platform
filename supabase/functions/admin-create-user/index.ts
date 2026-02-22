import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { z } from 'https://esm.sh/zod@3.23.8'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const createUserSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8).max(72),
  full_name: z.string().min(1).max(255),
  role: z.enum(['admin', 'lease_creator', 'viewer']).optional(),
})

function safeErrorMessage(error: unknown): string {
  const msg = error instanceof Error ? error.message : String(error)
  console.error('admin-create-user error:', msg)
  if (msg.includes('already') || msg.includes('exists')) return 'A user with this email already exists'
  if (msg.includes('Unauthorized') || msg.includes('admin')) return 'Unauthorized'
  return 'An error occurred processing your request'
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('Unauthorized')

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // Verify caller is admin
    const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user: caller } } = await userClient.auth.getUser()
    if (!caller) throw new Error('Unauthorized')

    const adminClient = createClient(supabaseUrl, serviceRoleKey)
    const { data: callerRoles } = await adminClient
      .from('user_roles')
      .select('role')
      .eq('user_id', caller.id)
      .eq('role', 'admin')
    
    if (!callerRoles || callerRoles.length === 0) {
      throw new Error('Only admins can create users')
    }

    // Validate input
    const body = await req.json()
    const parsed = createUserSchema.safeParse(body)
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: 'Invalid input: ' + parsed.error.issues.map(i => i.message).join(', ') }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { email, password, full_name, role } = parsed.data

    // Create user with service role
    const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name },
    })
    if (createError) throw createError

    // Assign role
    if (role && newUser.user) {
      await adminClient.from('user_roles').insert({
        user_id: newUser.user.id,
        role,
      })
    }

    return new Response(JSON.stringify({ success: true, user_id: newUser.user?.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error: any) {
    return new Response(JSON.stringify({ error: safeErrorMessage(error) }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
