import { createContext, use, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, connected, getAccessToken, setAccessToken, type UserRole } from '../services';
import { supabase } from './supabase';

export interface SessionState {
  ready: boolean;
  authenticated: boolean;
  userId: string | null;
  email: string;
  role: UserRole;
  signOut: () => Promise<void>;
  syncToken: (token: string | null) => void;
}

const Ctx = createContext<SessionState>({
  ready: true,
  authenticated: false,
  userId: null,
  email: '',
  role: 'student',
  signOut: async () => {},
  syncToken: () => {},
});

export const useAuth = () => use(Ctx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(!supabase);
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<UserRole>('student');
  const [token, setToken] = useState<string | null>(getAccessToken());

  const syncToken = useCallback((next: string | null) => {
    setAccessToken(next);
    setToken(next);
  }, []);

  useEffect(() => {
    if (!supabase) return;
    let live = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!live) return;
      const s = data.session;
      syncToken(s?.access_token ?? null);
      setUserId(s?.user?.id ?? null);
      setEmail(s?.user?.email ?? '');
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      syncToken(session?.access_token ?? null);
      setUserId(session?.user?.id ?? null);
      setEmail(session?.user?.email ?? '');
      setReady(true);
    });
    return () => {
      live = false;
      sub.subscription.unsubscribe();
    };
  }, [syncToken]);

  const signOut = useCallback(async () => {
    await api.logout();
    syncToken(null);
    setUserId(null);
    setEmail('');
    setRole('student');
  }, [syncToken]);

  const value = useMemo<SessionState>(
    () => ({
      ready,
      authenticated: Boolean(connected && token),
      userId,
      email,
      role,
      signOut,
      syncToken,
    }),
    [ready, token, userId, email, role, signOut, syncToken],
  );

  return <Ctx value={value}>{children}</Ctx>;
}
