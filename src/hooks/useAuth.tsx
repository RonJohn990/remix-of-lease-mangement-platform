import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { api, setToken, clearToken } from '@/lib/api';
import type { AuthUser } from '@/lib/api';

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  isAdmin: boolean;
  roles: string[];
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  isAdmin: false,
  roles: [],
  signOut: async () => {},
});

const AuthSetContext = createContext<((u: AuthUser | null) => void) | null>(null);

export function AuthProviderWithSetter({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('auth_token');
    if (!token) {
      setLoading(false);
      return;
    }
    api.get<{ user: AuthUser }>('/auth/me')
      .then(({ user: u }) => setUser(u))
      .catch(() => {
        clearToken();
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const signOut = async () => {
    try { await api.post('/auth/logout'); } catch { /* ignore */ }
    clearToken();
    setUser(null);
  };

  const roles = user?.roles ?? [];
  const isAdmin = roles.includes('admin');

  return (
    <AuthSetContext.Provider value={setUser}>
      <AuthContext.Provider value={{ user, loading, isAdmin, roles, signOut }}>
        {children}
      </AuthContext.Provider>
    </AuthSetContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
export const useSetAuth = () => useContext(AuthSetContext);
