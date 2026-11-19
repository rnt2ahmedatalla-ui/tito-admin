import { lazy, Suspense } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useWaitlistCount } from '@/features/extras/useWaitlistCount';
import { Bell, CreditCard, MessageCircle, Users, Hourglass } from 'lucide-react';
import { useFeatureFlags } from '@/features/extras/useFeatures';
import { Skeleton } from '@/components/ui/Skeleton';
import { usePaymentsCount } from '@/hooks/usePaymentsCount';
import { useUnreadBookingCount } from '@/hooks/useBookingLog';
import { cn } from '@/lib/cn';

const PaymentsPage = lazy(() => import('@/features/payments/PaymentsPage').then((m) => ({ default: m.PaymentsPage })));
const WaitlistTab = lazy(() => import('@/features/extras/WaitlistTab').then((m) => ({ default: m.WaitlistTab })));
const RemindersPage = lazy(() => import('@/features/reminders/RemindersPage').then((m) => ({ default: m.RemindersPage })));

type Key = 'payments' | 'new' | 'reminders' | 'inactive' | 'waitlist';

/** الروتين اليومي: كل اللي بتعمله كل يوم في مكان واحد، بدل ما يبقى متفرق */
export function RoutinePage() {
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith('ar');
  const L = (ar: string, en: string) => (isAr ? ar : en);
  const [params, setParams] = useSearchParams();
  const payCount = usePaymentsCount().data ?? 0;
  const newCount = useUnreadBookingCount().data ?? 0;

  const waitlistOn = !!useFeatureFlags().data?.waitlist;
  const waitCount = useWaitlistCount().data ?? 0;
  const asked = params.get('t') as Key | null;
  const active: Key = asked && (asked !== 'waitlist' || waitlistOn) && ['payments', 'new', 'reminders', 'inactive', 'waitlist'].includes(asked) ? asked : payCount > 0 ? 'payments' : newCount > 0 ? 'new' : 'reminders';

  const tabs: Array<{ key: Key; label: string; icon: typeof Bell; badge: number }> = [
    { key: 'payments', label: L('الدفعات', 'Payments'), icon: CreditCard, badge: payCount },
    { key: 'new', label: L('الجديدة', 'New'), icon: Bell, badge: newCount },
    { key: 'reminders', label: L('التذكيرات', 'Reminders'), icon: MessageCircle, badge: 0 },
    { key: 'inactive', label: L('الغايبين', 'Inactive'), icon: Users, badge: 0 },
    ...(waitlistOn ? [{ key: 'waitlist' as Key, label: L('الانتظار', 'Waitlist'), icon: Hourglass, badge: waitCount }] : []),
  ];

  return (
    <div className="w-full min-w-0 max-w-full space-y-4 overflow-x-clip">
      <div>
        <h1 className="text-2xl font-bold text-espresso">{L('الروتين اليومي', 'Daily routine')}</h1>
        <p className="mt-1 text-sm text-ink-70">
          {L('الدفعات والحجوزات الجديدة والتذكيرات والعملاء الغايبين في مكان واحد.', 'Payments, new bookings, reminders and inactive customers in one place.')}
        </p>
      </div>

      <div role="tablist" className={cn('grid gap-1.5 rounded-card border border-default bg-white p-1.5', tabs.length > 4 ? 'grid-cols-5' : 'grid-cols-4')}>
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const on = active === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setParams({ t: tab.key }, { replace: true })}
              className={cn(
                'relative flex min-w-0 flex-col items-center justify-center gap-1 rounded-btn px-1 py-2 text-xs font-semibold transition-colors sm:flex-row sm:gap-2 sm:px-3 sm:text-sm',
                on ? 'bg-gold text-espresso' : 'text-ink-70 hover:bg-sand/50 hover:text-espresso',
              )}
            >
              <span className="relative">
                <Icon className="size-5 sm:size-4" aria-hidden />
                {tab.badge > 0 ? (
                  <span className="absolute -top-1.5 -end-2.5 min-w-4 rounded-full bg-danger px-1 text-center font-latin text-[10px] font-bold leading-4 text-white sm:hidden">
                    {tab.badge}
                  </span>
                ) : null}
              </span>
              <span className="max-w-full truncate">{tab.label}</span>
              {tab.badge > 0 ? (
                <span className="hidden rounded-full bg-espresso px-2 py-0.5 font-latin text-[11px] text-cream sm:inline">{tab.badge}</span>
              ) : null}
            </button>
          );
        })}
      </div>

      <Suspense fallback={<Skeleton className="h-48" />}>
        {active === 'payments' ? (
          <PaymentsPage embedded />
        ) : active === 'waitlist' ? (
          <WaitlistTab />
        ) : (
          <RemindersPage section={active} hideTabs />
        )}
      </Suspense>
    </div>
  );
}
