import { Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Globe, LogOut } from 'lucide-react';
import { Logo } from '@/components/brand/Logo';
import { useAuth } from '@/hooks/useAuth';
import { setLanguage } from '@/lib/i18n';

/** شكل بسيط للحلاق: حجوزاته بس، من غير قوايم ولا مالية */
export function StaffShell() {
  const { i18n } = useTranslation();
  const { signOut } = useAuth();
  const isAr = i18n.language?.startsWith('ar');
  return (
    <div className="min-h-dvh bg-cream font-arabic">
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-2 border-b border-white/5 bg-espresso px-4 text-cream">
        <div className="flex min-w-0 items-center gap-3">
          <Logo mark height={30} />
          <span className="truncate text-sm font-semibold">{isAr ? 'جدول حجوزاتي' : 'My schedule'}</span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => setLanguage(isAr ? 'en' : 'ar')}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-btn px-3 text-sm hover:bg-white/10"
            aria-label="Language"
          >
            <Globe className="size-4" />
            {isAr ? 'EN' : 'عربي'}
          </button>
          <button
            type="button"
            onClick={() => void signOut()}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-btn px-3 text-sm hover:bg-white/10"
          >
            <LogOut className="size-4" />
            <span className="hidden sm:inline">{isAr ? 'خروج' : 'Sign out'}</span>
          </button>
        </div>
      </header>
      <main className="mx-auto w-full min-w-0 max-w-content p-4 lg:p-6">
        <Outlet />
      </main>
    </div>
  );
}
