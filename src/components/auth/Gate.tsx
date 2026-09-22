import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ShieldX, Globe, Lock, Mail } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/Button';
import { Logo } from '@/components/brand/Logo';
import { Skeleton } from '@/components/ui/Skeleton';
import { setLanguage } from '@/lib/i18n';
import { cn } from '@/lib/cn';

function AuthShell({ children }: { children: React.ReactNode }) {
  const { t, i18n } = useTranslation();

  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-espresso px-4 py-10">
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden
        style={{
          background:
            'radial-gradient(ellipse 80% 55% at 50% 0%, rgba(204,149,66,0.22), transparent 55%), #341A0E',
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.04]"
        aria-hidden
        style={{
          backgroundImage:
            'repeating-linear-gradient(-28deg, transparent, transparent 8px, rgba(204,149,66,0.7) 8px, rgba(204,149,66,0.7) 9px)',
        }}
      />

      <button
        type="button"
        className="absolute end-4 top-4 z-20 inline-flex items-center gap-2 rounded-btn border border-cream/15 bg-black/20 px-3 py-2 text-sm text-cream/85 backdrop-blur"
        onClick={() => setLanguage(i18n.language === 'ar' ? 'en' : 'ar')}
      >
        <Globe className="size-4" />
        {t('app.language')}
      </button>

      <div className="relative z-10 w-full max-w-md">{children}</div>
    </div>
  );
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { state, signInWithPassword, signOut } = useAuth();
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      toast.error(t('app.loginRequired'));
      return;
    }
    setLoading(true);
    try {
      await signInWithPassword(email, password);
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('app.loginFailed');
      toast.error(t('app.loginFailed'), { description: msg });
    } finally {
      setLoading(false);
    }
  };

  if (state === 'loading') {
    return (
      <AuthShell>
        <div className="flex flex-col items-center gap-4 py-16">
          <Logo mark height={52} className="opacity-80" />
          <Skeleton className="h-4 w-36 bg-bark/50" />
        </div>
      </AuthShell>
    );
  }

  if (state === 'denied') {
    return (
      <AuthShell>
        <div className="rounded-card border border-cream/10 bg-cream p-8 text-center text-espresso shadow-warm-lg">
          <ShieldX className="mx-auto size-14 text-danger" />
          <h1 className="mt-4 text-xl font-bold">{t('app.accessDenied')}</h1>
          <p className="mt-2 text-sm text-ink-70">{t('app.accessDeniedHint')}</p>
          <Button className="mt-6 w-full" variant="secondary" onClick={() => void signOut()}>
            {t('app.signOut')}
          </Button>
        </div>
      </AuthShell>
    );
  }

  if (state === 'unauthenticated') {
    return (
      <AuthShell>
        <div className="overflow-hidden rounded-card border border-cream/10 bg-cream text-espresso shadow-warm-lg">
          <div className="flex flex-col items-center gap-3 bg-espresso px-6 py-8 text-center">
            <Logo mark height={56} />
            <p className="text-lg font-bold tracking-wide text-gold font-latin">tito</p>
            <h1 className="text-xl font-bold text-cream">{t('app.adminWelcome')}</h1>
            <p className="text-sm text-cream/65">{t('app.loginSubtitle')}</p>
          </div>

          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4 px-6 py-6">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="admin-email" className="text-sm font-medium text-espresso">
                {t('app.email')}
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-ink-70" />
                <input
                  id="admin-email"
                  type="email"
                  autoComplete="username"
                  inputMode="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  dir="ltr"
                  placeholder="admin@tito.app"
                  className={cn(
                    'min-h-12 w-full rounded-btn border border-bark/20 bg-white pe-3 ps-10 text-base font-latin',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold',
                  )}
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="admin-password" className="text-sm font-medium text-espresso">
                {t('app.password')}
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-ink-70" />
                <input
                  id="admin-password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  dir="ltr"
                  placeholder="••••••••"
                  className={cn(
                    'min-h-12 w-full rounded-btn border border-bark/20 bg-white pe-3 ps-10 text-base font-latin',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold',
                  )}
                />
              </div>
            </div>

            <Button type="submit" variant="primary" size="lg" className="w-full" loading={loading}>
              {t('app.signIn')}
            </Button>

            <p className="text-center text-xs text-ink-70">{t('app.adminSecure')}</p>
          </form>
        </div>
      </AuthShell>
    );
  }

  return <>{children}</>;
}
