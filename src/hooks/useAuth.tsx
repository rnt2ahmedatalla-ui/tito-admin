import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';

type AuthState = 'loading' | 'unauthenticated' | 'denied' | 'authenticated';

interface AuthContextValue {
  state: AuthState;
  user: User | null;
  session: Session | null;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  resetIdleTimer: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const IDLE_TIMEOUT_MS = 30 * 60 * 1000;
const IDLE_WARNING_MS = 28 * 60 * 1000;

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const [state, setState] = useState<AuthState>('loading');
  const [session, setSession] = useState<Session | null>(null);
  const [showIdleWarning, setShowIdleWarning] = useState(false);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const warningTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const clearTimers = useCallback(() => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
  }, []);

  const signOut = useCallback(async () => {
    clearTimers();
    setShowIdleWarning(false);
    await supabase.auth.signOut();
    queryClient.clear();
    setSession(null);
    setState('unauthenticated');
  }, [clearTimers, queryClient]);

  const checkAdmin = useCallback(
    async (sess: Session | null) => {
      if (!sess) {
        setState('unauthenticated');
        return;
      }

      const { data, error } = await supabase.rpc('is_admin');
      if (error || !data) {
        await signOut();
        setState('denied');
        return;
      }

      setSession(sess);
      setState('authenticated');
    },
    [signOut],
  );

  const resetIdleTimer = useCallback(() => {
    if (state !== 'authenticated') return;
    clearTimers();
    setShowIdleWarning(false);

    warningTimerRef.current = setTimeout(() => {
      setShowIdleWarning(true);
    }, IDLE_WARNING_MS);

    idleTimerRef.current = setTimeout(() => {
      void signOut();
    }, IDLE_TIMEOUT_MS);
  }, [clearTimers, signOut, state]);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      void checkAdmin(data.session);
    });

    const { data: sub } = supabase.auth.onAuthStateChange(async (event, sess) => {
      if (event === 'SIGNED_OUT' || (event === 'TOKEN_REFRESHED' && !sess)) {
        queryClient.clear();
        setSession(null);
        setState(sess ? 'loading' : 'unauthenticated');
        return;
      }
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        await checkAdmin(sess);
      }
    });

    return () => sub.subscription.unsubscribe();
  }, [checkAdmin, queryClient]);

  useEffect(() => {
    if (state !== 'authenticated') return;

    const events = ['mousedown', 'keydown', 'touchstart', 'scroll'] as const;
    const handler = () => resetIdleTimer();
    events.forEach((e) => window.addEventListener(e, handler, { passive: true }));
    resetIdleTimer();

    return () => {
      events.forEach((e) => window.removeEventListener(e, handler));
      clearTimers();
    };
  }, [state, resetIdleTimer, clearTimers]);

  const signInWithGoogle = useCallback(async () => {
    const redirectTo = `${window.location.origin}${import.meta.env.BASE_URL}`;
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo },
    });
  }, []);

  const value = useMemo(
    () => ({
      state,
      user: session?.user ?? null,
      session,
      signInWithGoogle,
      signOut,
      resetIdleTimer,
    }),
    [state, session, signInWithGoogle, signOut, resetIdleTimer],
  );

  return (
    <AuthContext.Provider value={value}>
      {showIdleWarning && state === 'authenticated' ? (
        <div
          className="fixed inset-x-4 top-4 z-[70] mx-auto max-w-md rounded-card border border-warning/30 bg-white p-4 shadow-warm-lg"
          role="alertdialog"
          aria-label={t('app.idleWarning')}
        >
          <p className="font-medium">{t('app.idleWarning')}</p>
          <button
            type="button"
            className="mt-2 text-gold font-semibold underline"
            onClick={resetIdleTimer}
          >
            {t('app.stayConnected')}
          </button>
        </div>
      ) : null}
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
