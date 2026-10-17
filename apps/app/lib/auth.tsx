import { useQueryClient } from '@tanstack/react-query';
import type { Session, User } from '@supabase/supabase-js';
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { supabase } from './supabase';
import type { AppRole } from '@nama/shared';

type AuthState = {
  ready: boolean;
  session: Session | null;
  user: User | null;
  role: AppRole | null;
  displayName: string | null;
  mustChangePassword: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (input: {
    email: string;
    password: string;
    fullName: string;
    phone?: string;
    intendedRole: 'client' | 'specialist';
    locale: string;
  }) => Promise<void>;
  signOut: () => Promise<void>;
  changePassword: (newPassword: string) => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

async function loadIdentity(userId: string): Promise<{
  role: AppRole | null;
  displayName: string | null;
  mustChangePassword: boolean;
}> {
  const [{ data: roleRow }, { data: profile }] = await Promise.all([
    supabase.from('user_roles').select('role').eq('user_id', userId).maybeSingle(),
    supabase
      .from('profiles')
      .select('display_name, must_change_password')
      .eq('id', userId)
      .maybeSingle(),
  ]);

  return {
    role: (roleRow?.role as AppRole) ?? null,
    displayName: profile?.display_name ?? null,
    mustChangePassword: profile?.must_change_password ?? false,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const loadedFor = useRef<string | null>(null);

  const hydrate = async (next: Session | null) => {
    setSession(next);
    if (!next?.user) {
      loadedFor.current = null;
      setRole(null);
      setDisplayName(null);
      setMustChangePassword(false);
      return;
    }
    if (loadedFor.current === next.user.id) return;
    loadedFor.current = next.user.id;
    const identity = await loadIdentity(next.user.id);
    setRole(identity.role);
    setDisplayName(identity.displayName);
    setMustChangePassword(identity.mustChangePassword);
  };

  useEffect(() => {
    let active = true;

    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      void hydrate(data.session).finally(() => {
        if (active) setReady(true);
      });
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      void hydrate(next);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      ready,
      session,
      user: session?.user ?? null,
      role,
      displayName,
      mustChangePassword,
      async signIn(email, password) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      },
      async signUp(input) {
        const { error } = await supabase.auth.signUp({
          email: input.email,
          password: input.password,
          options: {
            data: {
              full_name: input.fullName,
              phone: input.phone ?? null,
              intended_role: input.intendedRole,
              locale: input.locale,
            },
          },
        });
        if (error) throw error;
      },
      async signOut() {
        await supabase.auth.signOut();
        queryClient.clear();
      },
      async changePassword(newPassword) {
        const { error } = await supabase.auth.updateUser({ password: newPassword });
        if (error) throw error;
        await supabase.rpc('mark_password_changed');
        setMustChangePassword(false);
      },
      async refresh() {
        if (session?.user) {
          loadedFor.current = null;
          await hydrate(session);
        }
      },
    }),
    [ready, session, role, displayName, mustChangePassword, queryClient]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
