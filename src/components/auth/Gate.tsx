import { useTranslation } from 'react-i18next';
import { ShieldX } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/Button';
import { Logo } from '@/components/brand/Logo';
import { Skeleton } from '@/components/ui/Skeleton';

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { state, signInWithGoogle } = useAuth();
  const { t } = useTranslation();

  if (state === 'loading') {
    return (
      <div className="relative flex min-h-dvh flex-col items-center justify-center gap-4 overflow-hidden bg-espresso p-4">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.06]"
          aria-hidden
          style={{
            backgroundImage:
              'repeating-linear-gradient(-32deg, transparent, transparent 6px, rgba(204,149,66,0.5) 6px, rgba(204,149,66,0.5) 7px)',
          }}
        />
        <Logo className="relative h-8 w-auto opacity-60" />
        <Skeleton className="relative h-4 w-32 bg-bark/40" />
      </div>
    );
  }

  if (state === 'denied') {
    return (
      <div className="relative flex min-h-dvh flex-col items-center justify-center gap-4 overflow-hidden bg-espresso p-6 text-center text-cream">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.06]"
          aria-hidden
          style={{
            backgroundImage:
              'repeating-linear-gradient(-32deg, transparent, transparent 6px, rgba(204,149,66,0.5) 6px, rgba(204,149,66,0.5) 7px)',
          }}
        />
        <ShieldX className="relative size-16 text-danger" />
        <h1 className="relative text-xl font-semibold">{t('app.accessDenied')}</h1>
        <p className="relative max-w-sm text-cream/70">{t('app.accessDeniedHint')}</p>
      </div>
    );
  }

  if (state === 'unauthenticated') {
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
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.05]"
          aria-hidden
          style={{
            backgroundImage:
              'repeating-linear-gradient(-32deg, transparent, transparent 6px, rgba(204,149,66,0.6) 6px, rgba(204,149,66,0.6) 7px)',
          }}
        />
        <div className="relative flex w-full max-w-sm flex-col items-center gap-8 text-center">
          <Logo className="h-12 w-auto" />
          <div>
            <h1 className="text-2xl font-bold text-cream">{t('app.adminWelcome')}</h1>
            <p className="mt-2 text-cream/70">{t('app.title')}</p>
          </div>
          <Button
            variant="primary"
            size="lg"
            className="w-full max-w-xs"
            onClick={() => void signInWithGoogle()}
          >
            {t('app.signIn')}
          </Button>
          <p className="text-xs text-cream/40">{t('app.adminSecure')}</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
