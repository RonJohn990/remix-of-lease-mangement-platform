import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, setToken } from '@/lib/api';
import type { AuthUser } from '@/lib/api';
import { useSetAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Building, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { safeErrorMessage } from '@/lib/safeError';

export default function Login() {
  const navigate = useNavigate();
  const setAuth = useSetAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const [setupMode, setSetupMode] = useState(false);
  const [checkingSetup, setCheckingSetup] = useState(true);

  useEffect(() => {
    api.post<{ needs_setup: boolean }>('/auth/bootstrap', { check_only: true })
      .then(data => setSetupMode(data.needs_setup))
      .catch(() => setSetupMode(false))
      .finally(() => setCheckingSetup(false));
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { token, user } = await api.post<{ token: string; user: AuthUser }>('/auth/login', { email, password });
      setToken(token);
      setAuth?.(user);
      navigate('/');
    } catch (e: any) {
      toast.error(safeErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password || !fullName) { toast.error('All fields required'); return; }
    setLoading(true);
    try {
      await api.post('/auth/bootstrap', { email, password, full_name: fullName });
      toast.success('Admin created! Signing in...');
      const { token, user } = await api.post<{ token: string; user: AuthUser }>('/auth/login', { email, password });
      setToken(token);
      setAuth?.(user);
      navigate('/');
    } catch (e: any) {
      toast.error(safeErrorMessage(e, 'Setup failed'));
    } finally {
      setLoading(false);
    }
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
          <h1 className="text-xl font-bold text-foreground">Lease Management Solution</h1>
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
