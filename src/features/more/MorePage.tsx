import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Globe, LogOut, Calendar, List, Users, Wallet, Megaphone, Settings } from 'lucide-react';
import { navGroups } from '@/components/layout/navConfig';
import { CountBadge } from '@/components/ui/Badge';
import { useAuth } from '@/hooks/useAuth';
import { useWaitlistCount } from '@/features/extras/useWaitlistCount';
import { usePaymentsCount } from '@/hooks/usePaymentsCount';
import { useUnreadBookingCount } from '@/hooks/useBookingLog';
import { setLanguage } from '@/lib/i18n';
import { cn } from '@/lib/cn';

export function MorePage() {
  const { t, i18n } = useTranslation();
  const { signOut } = useAuth();
  const routineCount = (usePaymentsCount().data ?? 0) + (useUnreadBookingCount().data ?? 0) + (useWaitlistCount().data ?? 0);
  // الأساسيات (اليوم/الروتين/الحجوزات/المالية) موجودة في الشريط تحت، فمش بنكررها هنا
  const hidden = new Set(['/', '/routine', '/more/finance', '/more/walk-in']);

  return (
    <div className="w-full min-w-0 max-w-full space-y-5 overflow-x-clip">
      <h1 className="text-2xl font-bold text-espresso">{t('nav.more')}</h1>
      <section className="space-y-2">
        <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-70">{i18n.language?.startsWith('ar') ? 'الأكثر استخدامًا' : 'Most used'}</h2>
        <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-6">
          {[
            { to: '/', icon: Calendar, ar: 'اليوم', en: 'Today' },
            { to: '/bookings', icon: List, ar: 'الحجوزات', en: 'Bookings' },
            { to: '/more/customers', icon: Users, ar: 'العملاء', en: 'Customers' },
            { to: '/more/finance', icon: Wallet, ar: 'المالية', en: 'Finance' },
            { to: '/more/campaigns', icon: Megaphone, ar: 'الحملات', en: 'Campaigns' },
            { to: '/more/settings', icon: Settings, ar: 'الإعدادات', en: 'Settings' },
          ].map((q) => {
            const Icon = q.icon;
            return (
              <NavLink key={q.to} to={q.to} className="flex min-w-0 flex-col items-center gap-1.5 rounded-card border border-gold/40 bg-gold/10 px-2 py-3 text-center text-xs font-semibold text-espresso transition-colors hover:bg-gold/20">
                <Icon className="size-5 text-gold" aria-hidden />
                <span className="w-full truncate">{i18n.language?.startsWith('ar') ? q.ar : q.en}</span>
              </NavLink>
            );
          })}
        </div>
      </section>
      {navGroups.map((group) => {
        const items = group.items.filter((i) => !hidden.has(i.to));
        if (items.length === 0) return null;
        return (
          <section key={group.id} className="space-y-2">
            <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-70">
              {group.titleKey ? t(group.titleKey) : t('nav.groupQuick')}
            </h2>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
              {items.map((link) => {
                const Icon = link.icon;
                return (
                  <NavLink
                    key={link.to}
                    to={link.to}
                    className={({ isActive }) =>
                      cn(
                        'relative flex min-w-0 items-center gap-3 rounded-card border border-default bg-white px-3 py-3.5 text-sm font-medium text-espresso shadow-sm transition-colors hover:border-gold/60 hover:bg-gold/10',
                        isActive && 'border-gold bg-gold/15',
                      )
                    }
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-btn bg-gold/15 text-gold">
                      <Icon className="size-5" />
                    </span>
                    <span className="min-w-0 flex-1 truncate">{t(link.labelKey)}</span>
                    {link.badge ? <CountBadge count={routineCount} /> : null}
                  </NavLink>
                );
              })}
            </div>
          </section>
        );
      })}

      <section className="grid grid-cols-2 gap-2.5 border-t border-default pt-4">
        <button
          type="button"
          className="flex min-w-0 items-center justify-center gap-2 rounded-card border border-default bg-white px-3 py-3 text-sm font-medium text-espresso hover:bg-sand/50"
          onClick={() => setLanguage(i18n.language?.startsWith('ar') ? 'en' : 'ar')}
        >
          <Globe className="size-4 shrink-0 text-gold" />
          <span className="truncate">{i18n.language?.startsWith('ar') ? 'English' : 'عربي'}</span>
        </button>
        <button
          type="button"
          className="flex min-w-0 items-center justify-center gap-2 rounded-card border border-danger/30 bg-white px-3 py-3 text-sm font-medium text-danger hover:bg-danger/10"
          onClick={() => void signOut()}
        >
          <LogOut className="size-4 shrink-0" />
          <span className="truncate">{t('app.signOut')}</span>
        </button>
      </section>
    </div>
  );
}
