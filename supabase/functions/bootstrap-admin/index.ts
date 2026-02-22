import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const adminClient = createClient(supabaseUrl, serviceRoleKey)

    // Check if any admin exists FIRST
    const { data: existingAdmins } = await adminClient
      .from('user_roles')
      .select('id')
      .eq('role', 'admin')
      .limit(1)

    if (existingAdmins && existingAdmins.length > 0) {
      return new Response(JSON.stringify({ error: 'Admin already exists. Use the login page.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const body = await req.json()

    // If check_only, just report that no admin exists yet
    if (body.check_only) {
      return new Response(JSON.stringify({ needs_setup: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { email, password, full_name } = body
    if (!email || !password) throw new Error('Email and password required')

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
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
