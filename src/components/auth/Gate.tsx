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
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-espresso p-4">
        <Logo className="h-8 w-auto opacity-50" />
        <Skeleton className="h-4 w-32 bg-bark/40" />
      </div>
    );
  }

  if (state === 'denied') {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-espresso p-6 text-center text-cream">
        <ShieldX className="size-16 text-danger" />
        <h1 className="text-xl font-semibold">{t('app.accessDenied')}</h1>
        <p className="text-cream/70 max-w-sm">{t('app.accessDeniedHint')}</p>
      </div>
    );
  }

  if (state === 'unauthenticated') {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-espresso p-6">
        <Logo className="h-10 w-auto" />
        <p className="text-cream/80 text-center">{t('app.title')}</p>
        <Button variant="primary" size="lg" onClick={() => void signInWithGoogle()}>
          {t('app.signIn')}
        </Button>
      </div>
    );
  }

  return <>{children}</>;
}
