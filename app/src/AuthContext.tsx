import type { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';

import { supabase } from './supabase';

type AuthState = {
  // False until the saved session has been read.
  ready: boolean;
  // The signed-in account's email; null when signed out, a guest, or on the
  // sample closet.
  email: string | null;
  // The account whose closet to show (a guest's too). Null when signed out.
  userId: string | null;
  // True when the app needs an account: the backend is set up and nobody, or
  // only a guest from before login existed, is signed in.
  needsSignIn: boolean;
  // A guest from before login existed: creating an account keeps their closet.
  isGuest: boolean;
  signIn(email: string, password: string): Promise<void>;
  // Resolves to true when the account still needs its email confirmed.
  signUp(email: string, password: string): Promise<boolean>;
  signOut(): Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(!supabase);
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  const state = useMemo<AuthState>(() => {
    const user = session?.user ?? null;
    const isGuest = user?.is_anonymous === true;
    return {
      ready,
      email: isGuest ? null : (user?.email ?? null),
      userId: user?.id ?? null,
      needsSignIn: supabase !== null && (!user || isGuest),
      isGuest,

      async signIn(email, password) {
        if (!supabase) return;
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
      },

      async signUp(email, password) {
        if (!supabase) return false;
        if (isGuest) {
          // Turn the guest into an account, so its closet stays.
          const { data, error } = await supabase.auth.updateUser({ email: email.trim(), password });
          if (error) throw error;
          if (data.user.new_email) return true;
          // The new token says the account isn't a guest any more.
          await supabase.auth.refreshSession();
          return false;
        }
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
        if (error) throw error;
        return data.session === null;
      },

      async signOut() {
        if (!supabase) return;
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
      },
    };
  }, [ready, session]);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const state = useContext(AuthContext);
  if (!state) throw new Error('useAuth must be used inside AuthProvider');
  return state;
}
