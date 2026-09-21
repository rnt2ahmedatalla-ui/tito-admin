import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Calendar,
  CreditCard,
  Bell,
  List,
  MoreHorizontal,
  Globe,
  LogOut,
} from 'lucide-react';
import { Logo } from '@/components/brand/Logo';
import { CountBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/hooks/useAuth';
import { usePaymentsCount } from '@/hooks/usePaymentsCount';
import { setLanguage } from '@/lib/i18n';
import { cn } from '@/lib/cn';
import { useState } from 'react';
import { useGlobalShortcuts } from '@/hooks/useKeyboardShortcuts';

const mainTabs = [
  { to: '/', icon: Calendar, labelKey: 'nav.today' },
  { to: '/payments', icon: CreditCard, labelKey: 'nav.payments', badge: true },
  { to: '/reminders', icon: Bell, labelKey: 'nav.reminders' },
  { to: '/bookings', icon: List, labelKey: 'nav.bookings' },
  { to: '/more', icon: MoreHorizontal, labelKey: 'nav.more' },
];

const sidebarLinks = [
  ...mainTabs.slice(0, 4),
  { to: '/more/services', labelKey: 'nav.services' },
  { to: '/more/hours', labelKey: 'nav.hours' },
  { to: '/more/time-off', labelKey: 'nav.timeOff' },
  { to: '/more/customers', labelKey: 'nav.customers' },
  { to: '/more/walk-in', labelKey: 'nav.walkIn' },
  { to: '/more/settings', labelKey: 'nav.settings' },
  { to: '/more/maintenance', labelKey: 'nav.maintenance' },
];

export function AppShell() {
  const { t, i18n } = useTranslation();
  const { signOut } = useAuth();
  const { data: paymentsCount = 0 } = usePaymentsCount();
  const location = useLocation();
  const [showHelp, setShowHelp] = useState(false);

  useGlobalShortcuts(undefined, () => setShowHelp((v) => !v));

  const toggleLang = () => {
    setLanguage(i18n.language === 'ar' ? 'en' : 'ar');
  };

  return (
    <div className="flex min-h-dvh bg-cream font-arabic">
      <aside className="hidden lg:flex lg:w-60 lg:flex-col lg:fixed lg:inset-y-0 lg:bg-espresso lg:text-cream">
        <div className="flex h-14 items-center px-4 border-b border-bark/30">
          <Logo className="h-[30px] w-auto" />
        </div>
        <nav className="flex-1 overflow-y-auto py-4">
          {sidebarLinks.map((link) => {
            const Icon = 'icon' in link ? link.icon : undefined;
            const showBadge = 'badge' in link && link.badge;
            return (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.to === '/'}
                className={({ isActive }) =>
                  cn(
                    'relative flex items-center gap-3 px-4 py-2.5 text-sm transition-colors duration-150',
                    isActive
                      ? 'bg-bark/30 text-gold before:absolute before:inset-y-1 before:start-0 before:w-1 before:rounded-e before:bg-gold'
                      : 'text-cream/80 hover:text-cream hover:bg-bark/20',
                  )
                }
              >
                {Icon ? <Icon className="size-5 shrink-0" /> : null}
                <span className="flex-1">{t(link.labelKey)}</span>
                {showBadge ? <CountBadge count={paymentsCount} /> : null}
              </NavLink>
            );
          })}
        </nav>
        <div className="border-t border-bark/30 p-4 space-y-2">
          <Button variant="ghost" size="sm" className="w-full justify-start text-cream/80" onClick={toggleLang}>
            <Globe className="size-4" />
            {t('app.language')}
          </Button>
          <Button variant="ghost" size="sm" className="w-full justify-start text-cream/80" onClick={() => void signOut()}>
            <LogOut className="size-4" />
            {t('app.signOut')}
          </Button>
        </div>
      </aside>

      <div className="flex flex-1 flex-col lg:ms-60">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between bg-espresso px-4 text-cream lg:hidden">
          <Logo className="h-[28px] w-auto" />
          <CountBadge count={paymentsCount} />
        </header>

        <main className="mx-auto w-full max-w-content flex-1 p-4 pb-24 lg:pb-4">
          <Outlet />
        </main>

        <nav
          className="fixed inset-x-0 bottom-0 z-30 flex border-t border-bark/20 bg-espresso lg:hidden"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          {mainTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive =
              tab.to === '/'
                ? location.pathname === '/'
                : location.pathname.startsWith(tab.to);
            return (
              <NavLink
                key={tab.to}
                to={tab.to}
                end={tab.to === '/'}
                className={cn(
                  'relative flex flex-1 flex-col items-center gap-0.5 py-2 text-xs transition-colors',
                  isActive ? 'text-gold' : 'text-cream/70',
                )}
              >
                <span className="relative">
                  <Icon className="size-5" />
                  {tab.badge ? (
                    <span className="absolute -top-1 -end-2">
                      <CountBadge count={paymentsCount} />
                    </span>
                  ) : null}
                </span>
                {t(tab.labelKey)}
              </NavLink>
            );
          })}
        </nav>
      </div>

      {showHelp ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog">
          <div className="absolute inset-0 bg-espresso/50" onClick={() => setShowHelp(false)} />
          <div className="relative rounded-card bg-white p-4 shadow-warm-lg max-w-sm w-full">
            <h3 className="font-semibold mb-3">{t('app.keyboardHelp')}</h3>
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
