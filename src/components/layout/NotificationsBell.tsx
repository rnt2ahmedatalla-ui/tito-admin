import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Bell, ChevronRight } from 'lucide-react';
import {
  notificationHref,
  useAdminNotifications,
} from '@/hooks/useAdminNotifications';
import { usePendingOnlinePayments } from '@/hooks/usePendingOnlinePayments';
import { cn } from '@/lib/cn';
import { formatEGP } from '@/lib/money';
import { formatCairoDateShort, formatCairoTime, formatWaitTime, minutesSince } from '@/lib/time';

const DESKTOP_BREAKPOINT = 1024;
const PANEL_WIDTH = 384;

export function NotificationsBell() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { data: notifications = [], markAll, markOne } = useAdminNotifications();
  const pendingQuery = usePendingOnlinePayments();
  const [open, setOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const isAr = !!i18n.language?.startsWith('ar');
  const L = (ar: string, en: string) => (isAr ? ar : en);

  // الجرس بيعرض بس: طلبات الدفع الأونلاين المستنية تأكيدك + طلبات المنتجات
  const pending = pendingQuery.data ?? [];
  const productNotifs = notifications.filter(
    (n) => (n.kind ?? '').startsWith('product') || n.entity === 'product_order',
  );
  const unreadProducts = productNotifs.filter((n) => !n.is_read).length;
  const badge = pending.length + unreadProducts;

  const toggle = () => {
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      const desktop = window.innerWidth >= DESKTOP_BREAKPOINT;
      setIsDesktop(desktop);
      // على اللابتوب: اللوحة تتحط تحت الجرس مباشرة وتفضل جوه الشاشة
      setPos({
        top: rect.bottom + 8,
        left: Math.max(8, Math.min(rect.left, window.innerWidth - PANEL_WIDTH - 8)),
      });
    }
    setOpen((v) => !v);
  };

  const openPayments = () => {
    setOpen(false);
    navigate('/payments');
  };

  const openProduct = (id: string, kind: string, entity: string | null, isRead: boolean) => {
    setOpen(false);
    if (!isRead) void markOne.mutate(id);
    navigate(notificationHref({ kind, entity }));
  };

  const methodLabel = (m: string) =>
    m === 'instapay' ? 'InstaPay' : m === 'vodafone_cash' ? 'Vodafone Cash' : m;

  const panel = (
    <>
      <div className="fixed inset-0 z-40 bg-espresso/40 lg:bg-transparent" onClick={() => setOpen(false)} />
      <div
        style={isDesktop ? { top: pos.top, left: pos.left, width: PANEL_WIDTH } : undefined}
        className={cn(
          'z-50 overflow-hidden rounded-card border border-bark/15 bg-white shadow-warm-lg',
          // الموبايل: شريط عريض تحت الهيدر
          'fixed inset-x-3 top-[4.25rem] max-h-[min(70dvh,28rem)]',
        )}
      >
        <div className="flex items-center justify-between gap-2 border-b border-bark/10 px-4 py-3">
          <p className="text-base font-semibold text-espresso">{t('notifications.title')}</p>
          {unreadProducts > 0 ? (
            <button
              type="button"
              className="shrink-0 text-sm font-medium text-gold"
              onClick={() => void markAll.mutate()}
            >
              {t('notifications.markAll')}
            </button>
          ) : null}
        </div>
        <ul className="max-h-[min(60dvh,24rem)] divide-y divide-bark/10 overflow-y-auto overscroll-contain">
          {pending.length === 0 && productNotifs.length === 0 ? (
            <li className="px-4 py-6 text-sm text-ink-70">
              {L('مفيش طلبات دفع مستنية تأكيدك', 'No payment requests waiting for you')}
            </li>
          ) : null}

          {pending.map((p) => {
            const booking = p.booking;
            const guest = (booking as unknown as { guest_name?: string | null } | null)?.guest_name;
            const name = p.profile?.full_name || guest || L('عميل', 'Customer');
            const service = booking ? (isAr ? booking.service_name_ar : booking.service_name_en) : '';
            const when = booking
              ? `${formatCairoDateShort(booking.start_at)} · ${formatCairoTime(booking.start_at, i18n.language)}`
              : '';
            return (
              <li key={p.id}>
                <button
                  type="button"
                  className="flex w-full items-start gap-3 bg-gold/10 px-4 py-3.5 text-start transition-colors hover:bg-sand/50"
                  onClick={openPayments}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-medium text-gold">
                      {L('طلب دفع أونلاين', 'Online payment request')}
                    </span>
                    <span className="mt-0.5 block truncate text-sm font-semibold text-espresso">{name}</span>
                    {service || when ? (
                      <span className="mt-0.5 block text-sm text-ink-70">
                        {service}
                        {service && when ? ' — ' : ''}
                        <span className="font-latin">{when}</span>
                      </span>
                    ) : null}
                    <span className="mt-0.5 block text-sm text-espresso">
                      <span className="font-latin font-semibold">{formatEGP(p.amount_egp)}</span> · {methodLabel(p.method)}
                    </span>
                    <span className="mt-1 block text-xs text-ink-70">
                      {L('مستني من', 'Waiting for')} {formatWaitTime(minutesSince(p.created_at), t)}
                    </span>
                    <span className="mt-1 block text-xs font-medium text-gold">
                      {L('اضغط للمراجعة والتأكيد', 'Tap to review and confirm')}
                    </span>
                  </span>
                  <ChevronRight className="mt-1 size-4 shrink-0 text-ink-70 rtl:-scale-x-100" aria-hidden />
                </button>
              </li>
            );
          })}

          {productNotifs.map((n) => (
            <li key={n.id}>
              <button
                type="button"
                className={cn(
                  'flex w-full items-start gap-3 px-4 py-3.5 text-start transition-colors hover:bg-sand/50',
                  !n.is_read && 'bg-gold/10',
                )}
                onClick={() => openProduct(n.id, n.kind, n.entity, n.is_read)}
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-espresso">{isAr ? n.title_ar : n.title_en}</span>
                  {(isAr ? n.body_ar : n.body_en) ? (
                    <span className="mt-0.5 block text-sm text-ink-70">{isAr ? n.body_ar : n.body_en}</span>
                  ) : null}
                  <span className="mt-1 block text-xs font-medium text-gold">{t('notifications.openAction')}</span>
                </span>
                <ChevronRight className="mt-1 size-4 shrink-0 text-ink-70 rtl:-scale-x-100" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      </div>
    </>
  );

  return (
    <div className="relative">
      <button
        ref={btnRef}
        type="button"
        className="relative inline-flex min-h-10 min-w-10 items-center justify-center rounded-btn border border-gold/40 bg-bark/40 p-2 text-cream hover:bg-bark/60 hover:text-gold"
        aria-label={t('notifications.title')}
        aria-expanded={open}
        onClick={toggle}
      >
        <Bell className="size-5 text-gold" />
        {badge > 0 ? (
          <span className="absolute -end-1.5 -top-1.5 flex min-h-5 min-w-5 items-center justify-center rounded-full bg-gold px-1.5 text-[11px] font-bold text-espresso shadow">
            {badge > 9 ? '9+' : badge}
          </span>
        ) : null}
      </button>

      {open ? createPortal(panel, document.body) : null}
    </div>
  );
}
