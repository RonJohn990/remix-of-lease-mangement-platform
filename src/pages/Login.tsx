import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Building, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const [setupMode, setSetupMode] = useState(false);
  const [checkingSetup, setCheckingSetup] = useState(true);

  useEffect(() => {
    // Check if any admin exists
    supabase.functions.invoke('bootstrap-admin', { body: { email: '', password: '' } })
      .then(({ data }) => {
        // If error says "Admin already exists" -> normal login
        // If error is about missing fields -> no admin yet, show setup
        if (data?.error === 'Admin already exists. Use the login page.') {
          setSetupMode(false);
        } else {
          setSetupMode(true);
        }
      })
      .catch(() => setSetupMode(false))
      .finally(() => setCheckingSetup(false));
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) toast.error(error.message);
    setLoading(false);
  };

  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password || !fullName) { toast.error('All fields required'); return; }
    setLoading(true);
    const { data, error } = await supabase.functions.invoke('bootstrap-admin', {
      body: { email, password, full_name: fullName },
    });
    if (error || data?.error) {
      toast.error(data?.error || error?.message || 'Setup failed');
    } else {
      toast.success('Admin created! Signing in...');
      await supabase.auth.signInWithPassword({ email, password });
    }
    setLoading(false);
  };

  if (checkingSetup) return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
    </div>
  );

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-sm mx-auto">
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center mb-4">
            <Building className="w-6 h-6 text-primary-foreground" />
          </div>
          <h1 className="text-xl font-bold text-foreground">IFRS 16 Lease Manager</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {setupMode ? 'Create your admin account to get started' : 'Sign in to continue'}
          </p>
        </div>

        <form onSubmit={setupMode ? handleSetup : handleLogin} className="bg-card border rounded-lg p-6 space-y-4 shadow-sm">
          {setupMode && (
            <div>
              <label className="text-sm font-medium text-foreground">Full Name</label>
              <Input value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Admin Name" required className="mt-1" />
            </div>
          )}
          <div>
            <label className="text-sm font-medium text-foreground">Email</label>
            <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" required className="mt-1" />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground">Password</label>
            <Input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required className="mt-1" />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            {setupMode ? 'Create Admin & Sign In' : 'Sign In'}
          </Button>
        </form>

        <p className="text-xs text-muted-foreground text-center mt-4">
          {setupMode ? 'This is a one-time setup for the first admin' : 'Contact your administrator to get access'}
        </p>
      </div>
    </div>
  );
}
