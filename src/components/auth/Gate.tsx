import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ShieldX, Globe } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Logo } from '@/components/brand/Logo';
import { Skeleton } from '@/components/ui/Skeleton';
import { setLanguage } from '@/lib/i18n';

function AuthBackdrop({ children }: { children: React.ReactNode }) {
  const { t, i18n } = useTranslation();

  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-espresso px-6">
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden
        style={{
          background:
            'radial-gradient(ellipse 70% 50% at 50% 30%, rgba(204,149,66,0.18), transparent 60%)',
        }}
      />
      <button
        type="button"
        className="absolute end-4 top-4 z-10 inline-flex items-center gap-2 rounded-btn border border-cream/15 bg-espresso/60 px-3 py-2 text-sm text-cream/80 backdrop-blur"
        onClick={() => setLanguage(i18n.language === 'ar' ? 'en' : 'ar')}
      >
        <Globe className="size-4" />
        {t('app.language')}
      </button>
      <div className="relative flex w-full max-w-sm flex-col items-center gap-6">{children}</div>
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
      <AuthBackdrop>
        <Logo mark height={48} className="opacity-70" />
        <Skeleton className="h-4 w-32 bg-bark/40" />
      </AuthBackdrop>
    );
  }

  if (state === 'denied') {
    return (
      <AuthBackdrop>
        <div className="flex flex-col items-center gap-4 text-center text-cream">
          <ShieldX className="size-16 text-danger" />
          <h1 className="text-xl font-semibold">{t('app.accessDenied')}</h1>
          <p className="max-w-sm text-cream/70">{t('app.accessDeniedHint')}</p>
          <Button variant="ghost" size="sm" className="text-cream/70" onClick={() => void signOut()}>
            {t('app.signOut')}
          </Button>
        </div>
      </AuthBackdrop>
    );
  }

  if (state === 'unauthenticated') {
    return (
      <AuthBackdrop>
        <Logo mark height={56} />
        <div className="text-center text-cream">
          <h1 className="text-2xl font-bold">{t('app.adminWelcome')}</h1>
          <p className="mt-2 text-cream/70">{t('app.title')}</p>
        </div>
        <form
          onSubmit={(e) => void handleSubmit(e)}
          className="w-full space-y-3 rounded-card bg-cream p-5 text-espresso shadow-warm-lg"
        >
          <Input
            label={t('app.email')}
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            dir="ltr"
            className="font-latin"
          />
          <Input
            label={t('app.password')}
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            dir="ltr"
            className="font-latin"
          />
          <Button type="submit" variant="primary" size="lg" className="w-full" loading={loading}>
            {t('app.signIn')}
          </Button>
        </form>
        <p className="text-center text-xs text-cream/40">{t('app.adminSecure')}</p>
      </AuthBackdrop>
    );
  }

  return <>{children}</>;
}
