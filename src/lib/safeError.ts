/**
 * Sanitize error messages before displaying to users.
 * Maps technical database/API errors to safe, user-friendly messages.
 */
export function safeErrorMessage(error: unknown, fallback = 'An error occurred. Please try again.'): string {
  const msg = error instanceof Error ? error.message : typeof error === 'string' ? error : '';

  // Already safe user-facing messages from edge functions
  if (msg.includes('already exists') || msg.includes('A user with this email')) return msg;
  if (msg === 'Unauthorized' || msg === 'Only admins can create users') return msg;

  // Auth errors – safe to show
  if (msg.includes('Invalid login credentials')) return 'Invalid email or password';
  if (msg.includes('Email not confirmed')) return 'Please verify your email before signing in';

  // Database constraint / RLS errors – hide details
  if (msg.includes('violates') || msg.includes('constraint') || msg.includes('row-level security')) {
    return 'Operation not permitted or data conflict. Please check your input.';
  }

  // Network / fetch errors
  if (msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('network')) {
    return 'Network error. Please check your connection and try again.';
  }

  // Generic Supabase/Postgres errors containing internal details
  if (msg.includes('relation') || msg.includes('column') || msg.includes('schema') || msg.includes('permission denied')) {
    return fallback;
  }

  // If message is short and doesn't look technical, it's probably safe
  if (msg.length > 0 && msg.length < 100 && !msg.includes('pg_') && !msg.includes('supabase')) {
    return msg;
  }

  return fallback;
}
