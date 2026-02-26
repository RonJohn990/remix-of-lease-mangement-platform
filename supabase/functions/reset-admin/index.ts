import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const allowedOrigins = (Deno.env.get('ALLOWED_ORIGINS') || '').split(',').map(s => s.trim()).filter(Boolean)

function getCorsHeaders(req: Request) {
  const origin = req.headers.get('Origin') || ''
  const allowed = allowedOrigins.length === 0 || allowedOrigins.includes(origin)
  return {
    'Access-Control-Allow-Origin': allowed ? origin : allowedOrigins[0] || '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-reset-token',
  }
}

function safeErrorMessage(error: unknown): string {
  const msg = error instanceof Error ? error.message : String(error)
  console.error('reset-admin error:', msg)
  return 'An error occurred processing your request'
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const resetToken = Deno.env.get('RESET_TOKEN')
    if (!resetToken) {
      return new Response(JSON.stringify({ error: 'Reset token not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const providedToken = req.headers.get('X-Reset-Token')
    if (!providedToken || providedToken !== resetToken) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(JSON.stringify({ error: 'Supabase configuration missing' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const adminClient = createClient(supabaseUrl, serviceRoleKey)

    const { error: deleteError } = await adminClient
      .from('user_roles')
      .delete()
      .eq('role', 'admin')

    if (deleteError) throw deleteError

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error: unknown) {
    return new Response(JSON.stringify({ error: safeErrorMessage(error) }), {
      status: 500,
