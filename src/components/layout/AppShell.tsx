import { createPortal } from 'react-dom';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Calendar,
  ClipboardCheck,
  UserPlus,
  Wallet,
  MoreHorizontal,
  Globe,
  LogOut,
} from 'lucide-react';
import { Logo } from '@/components/brand/Logo';
import { NotificationsBell } from '@/components/layout/NotificationsBell';
import { navGroups } from '@/components/layout/navConfig';
import { CountBadge } from '@/components/ui/Badge';
import { useAuth } from '@/hooks/useAuth';
import { useWaitlistCount } from '@/features/extras/useWaitlistCount';
import { usePaymentsCount } from '@/hooks/usePaymentsCount';
import { setLanguage } from '@/lib/i18n';
import { cn } from '@/lib/cn';
import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { rpcUntyped } from '@/features/staff/staffLogin';
import { useUnreadBookingCount } from '@/hooks/useBookingLog';
import { useGlobalShortcuts } from '@/hooks/useKeyboardShortcuts';

// شريط الموبايل: 5 أماكن بس، والباقي في "المزيد"
const mainTabs = [
  { to: '/', icon: Calendar, labelKey: 'nav.today' },
  { to: '/routine', icon: ClipboardCheck, labelKey: 'nav.routineShort', badge: 'routine' as const },
  { to: '/more/walk-in', icon: UserPlus, labelKey: 'nav.walkIn' },
  { to: '/more/finance', icon: Wallet, labelKey: 'nav.finance' },
  { to: '/more', icon: MoreHorizontal, labelKey: 'nav.more' },
];

function SidebarAction({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof Globe;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-btn border border-cream/20 bg-bark/25 px-3 py-2.5 text-sm font-medium text-cream transition-colors hover:bg-bark/45 hover:text-gold"
    >
      <Icon className="size-4 shrink-0 text-gold" />
      <span>{label}</span>
    </button>
  );
}

export function AppShell() {
  const { t, i18n } = useTranslation();
  const appQc = useQueryClient();
  // الحجوزات اللي عدّى وقتها بتتحسب "تم" لوحدها لو الأدمن فعّل ده (من الإضافات)
  useEffect(() => {
    void rpcUntyped('auto_complete_bookings').then((r) => {
      if (!r.error && Number(r.data) > 0) void appQc.invalidateQueries({ queryKey: ['bookings'] });
    });
  }, [appQc]);
  const { signOut } = useAuth();
  const { data: paymentsCount = 0 } = usePaymentsCount();
  const { data: remindersCount = 0 } = useUnreadBookingCount();
  const { data: waitCount = 0 } = useWaitlistCount();
  const badgeFor = (b?: 'routine') => (b === 'routine' ? paymentsCount + remindersCount + waitCount : 0);
  const location = useLocation();
  const [showHelp, setShowHelp] = useState(false);

  useGlobalShortcuts(undefined, () => setShowHelp((v) => !v));

  const toggleLang = () => {
    const next = i18n.language?.startsWith('ar') ? 'en' : 'ar';
    setLanguage(next);
  };

  const handleSignOut = () => {
    void signOut();
  };

  return (
    <div className="flex min-h-dvh bg-cream font-arabic">
      <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 lg:bg-espresso lg:text-cream">
        <div className="flex h-16 items-center justify-between gap-2 border-b border-white/5 px-4">
          <div className="flex min-w-0 items-center gap-3">
            <Logo mark height={34} />
            <span className="text-sm font-semibold tracking-wide text-gold font-latin">tito</span>
          </div>
          <NotificationsBell />
        </div>
        <nav className="flex-1 space-y-4 overflow-y-auto py-4">
          {navGroups.map((group) => (
            <div key={group.id}>
              {group.titleKey ? (
                <p className="px-4 pb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-cream/45">
                  {t(group.titleKey)}
                </p>
              ) : null}
              {group.items.map((link) => {
                const Icon = link.icon;
                return (
                  <NavLink
                    key={link.to}
                    to={link.to}
                    end={link.to === '/'}
                    className={({ isActive }) =>
                      cn(
                        'relative flex items-center gap-3 px-4 py-2 text-sm transition-colors duration-150',
                        isActive
                          ? 'bg-bark/30 text-gold before:absolute before:inset-y-1 before:start-0 before:w-1 before:rounded-e before:bg-gold'
                          : 'text-cream/80 hover:bg-bark/20 hover:text-cream',
                      )
                    }
                  >
                    <Icon className="size-[18px] shrink-0" />
                    <span className="min-w-0 flex-1 truncate">{t(link.labelKey)}</span>
                    {link.badge ? <CountBadge count={badgeFor(link.badge)} /> : null}
                  </NavLink>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="space-y-2 border-t border-white/10 p-4">
          <SidebarAction
            icon={Globe}
            label={i18n.language?.startsWith('ar') ? 'English' : 'عربي'}
            onClick={toggleLang}
          />
          <SidebarAction icon={LogOut} label={t('app.signOut')} onClick={handleSignOut} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col lg:ms-64">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-2 border-b border-white/5 bg-espresso px-3 text-cream lg:hidden">
          <div className="flex items-center gap-2">
            <Logo mark height={28} />
            <span className="text-sm font-semibold text-gold font-latin">tito</span>
          </div>
          <div className="flex items-center gap-1">
            <NotificationsBell />
            <button
              type="button"
              onClick={toggleLang}
              className="inline-flex min-h-10 items-center gap-1 rounded-btn px-2.5 text-sm text-cream hover:bg-bark/40"
              aria-label={t('app.language')}
            >
              <Globe className="size-4 text-gold" />
              {i18n.language?.startsWith('ar') ? 'EN' : 'ع'}
            </button>
            <button
              type="button"
              onClick={handleSignOut}
              className="inline-flex min-h-10 items-center gap-1 rounded-btn px-2.5 text-sm text-cream hover:bg-bark/40"
              aria-label={t('app.signOut')}
            >
              <LogOut className="size-4 text-gold" />
            </button>
          </div>
        </header>

        <main className="mx-auto w-full min-w-0 max-w-content flex-1 p-4 pb-24 lg:p-6 lg:pb-6">
          <Outlet />
        </main>

        {createPortal(
        <nav
          className="fixed inset-x-0 bottom-0 z-30 flex border-t border-bark/20 bg-espresso lg:hidden"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          {mainTabs.map((tab) => {
            const Icon = tab.icon;
            const p = location.pathname;
            const isActive =
              tab.to === '/'
                ? p === '/'
                : tab.to === '/more'
                  ? p.startsWith('/more') && !p.startsWith('/more/finance') && !p.startsWith('/more/walk-in')
                  : p.startsWith(tab.to);
            return (
              <NavLink
                key={tab.to}
                to={tab.to}
                end={tab.to === '/'}
                className={cn(
                  'relative flex min-w-0 flex-1 flex-col items-center gap-0.5 py-2 text-[11px] transition-colors',
                  isActive ? 'text-gold' : 'text-cream/70',
                )}
              >
                <span className="relative">
                  <Icon className="size-5" />
                  {tab.badge ? (
                    <span className="absolute -top-1 -end-2">
                      <CountBadge count={badgeFor(tab.badge)} />
                    </span>
                  ) : null}
                </span>
                <span className="max-w-full truncate px-0.5">{t(tab.labelKey)}</span>
              </NavLink>
            );
          })}
        </nav>
        , document.body)}
      </div>

      {showHelp ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog">
          <div className="absolute inset-0 bg-espresso/50" onClick={() => setShowHelp(false)} />
          <div className="relative w-full max-w-sm rounded-card bg-white p-4 shadow-warm-lg">
            <h3 className="mb-3 font-semibold">{t('app.keyboardHelp')}</h3>
            <ul className="space-y-1 text-sm text-ink-70">
              <li>{t('shortcuts.search')}</li>
              <li>{t('shortcuts.tabs')}</li>
              <li>{t('shortcuts.close')}</li>
              <li>{t('shortcuts.paymentsNav')}</li>
              <li>{t('shortcuts.confirm')}</li>
              <li>{t('shortcuts.reject')}</li>
            </ul>
          </div>
        </div>
      ) : null}
    </div>
  );
}
