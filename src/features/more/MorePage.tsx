import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Globe, LogOut } from 'lucide-react';
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
