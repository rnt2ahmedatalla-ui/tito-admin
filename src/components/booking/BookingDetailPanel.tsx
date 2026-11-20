import { fetchSlots } from '@/lib/slots';
import { StaffNote } from '@/features/customers/StaffNote';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Phone, MessageCircle } from 'lucide-react';
import { toast } from 'sonner';
import type { BookingWithRelations } from '@/types/database';
import { normalizeBooking, isOnlineBooking, isShopBooking } from '@/lib/booking';
import { Sheet } from '@/components/ui/Sheet';
import { PackageUse } from '@/features/extras/PackageUse';
import { CustomerFlags, RateRequest, rateMessage } from '@/features/extras/BookingExtras';
import { waLink } from '@/features/staff/staffLogin';
import { useAuth } from '@/hooks/useAuth';
import { StatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useSignedProofUrl } from '@/hooks/useSignedProofUrl';
import { formatEGP } from '@/lib/money';
import { formatCairoTime, formatCairoDateShort, cairoDateString } from '@/lib/time';
import { mapError } from '@/lib/errors';
import { buildWhatsAppUrl } from '@/lib/whatsapp';
import { openConfirmationWhatsApp } from '@/lib/confirmWhatsApp';
import { supabase } from '@/lib/supabase';
import { useStaff } from '@/features/staff/StaffPage';

interface BookingDetailPanelProps {
  booking: BookingWithRelations | null;
  open: boolean;
  onClose: () => void;
}

const CUSTOMER_BASE_URL = (
  import.meta.env.VITE_CUSTOMER_URL || 'https://tito-customer.vercel.app'
).replace(/\/+$/, '');
const REBOOK_URL = `${CUSTOMER_BASE_URL}/book`;

export function BookingDetailPanel({ booking, open, onClose }: BookingDetailPanelProps) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const isStaff = useAuth().role === 'staff';
  const [confirmAction, setConfirmAction] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  const [moveDate, setMoveDate] = useState('');
  const [moveSlots, setMoveSlots] = useState<string[]>([]);
  const [moveSlot, setMoveSlot] = useState('');
  const [offerFor, setOfferFor] = useState<string | null>(null);
  const [localOffer, setLocalOffer] = useState<string | null>(null);

  const [staffOverride, setStaffOverride] = useState<{ id: string; val: string } | null>(null);
  const staffList = (useStaff().data ?? []).filter((m) => m.is_active);
  const payment = booking ? normalizeBooking(booking).payment : null;
  const { url: proofUrl } = useSignedProofUrl(payment?.proof_path, open && !!payment?.proof_path);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['bookings'] });
    void queryClient.invalidateQueries({ queryKey: ['payments'] });
    void queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
    void queryClient.invalidateQueries({ queryKey: ['payments-count'] });
    void queryClient.invalidateQueries({ queryKey: ['reminders'] });
  };

  const confirmPayment = useMutation({
    mutationFn: async (paymentId: string) => {
      const { error } = await supabase.rpc('admin_confirm_payment', { p_payment_id: paymentId });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success(t('payments.confirm'));
      invalidate();
      if (booking) {
        const row = normalizeBooking(booking);
        const phone = row.profile?.phone ?? '';
        const opened = await openConfirmationWhatsApp({
          phone,
          name: row.profile?.full_name ?? '',
          startAt: row.start_at,
          serviceAr: row.service_name_ar,
          serviceEn: row.service_name_en,
          locale: i18n.language,
        });
        if (opened) toast.success(t('payments.confirmWhatsAppOpened'));
        else if (phone) toast.error(t('booking.noPhone'));
      }
      onClose();
    },
    onError: (e) => toast.error(mapError(e, t)),
  });

  const rejectPayment = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const { error } = await supabase.rpc('admin_reject_payment', {
        p_payment_id: id,
        p_reason: reason,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t('payments.reject'));
      invalidate();
      onClose();
    },
    onError: (e) => toast.error(mapError(e, t)),
  });

  const cancelBooking = useMutation({
    mutationFn: async ({ id, reason, notify }: { id: string; reason: string; notify: boolean }) => {
      const { error } = await supabase.rpc('admin_cancel_booking', {
        p_booking_id: id,
        p_reason: reason.trim() || 'cancelled by admin',
      });
      if (error) throw error;
      return notify;
    },
    onSuccess: (notify) => {
      toast.success(t('booking.cancel'));
      invalidate();
      if (notify && booking) {
        const b = normalizeBooking(booking);
        const phone = b.profile?.phone ?? '';
        const locale = i18n.language === 'ar' ? 'ar' : 'en';
        const message =
          locale === 'ar'
            ? `أهلاً ${b.profile?.full_name ?? ''} 🙏\nنعتذر، اضطرينا نلغي حجزك يوم ${formatCairoDateShort(b.start_at)} الساعة ${formatCairoTime(b.start_at, locale)}.\nتحجز معاد جديد من هنا:\n${REBOOK_URL}`
            : `Hi ${b.profile?.full_name ?? ''} 🙏\nSorry — we had to cancel your booking on ${formatCairoDateShort(b.start_at)} at ${formatCairoTime(b.start_at, locale)}.\nBook a new time here:\n${REBOOK_URL}`;
        const url = phone ? buildWhatsAppUrl(phone, message) : null;
        if (!url) {
          toast.error(t('booking.noPhone'));
        } else {
          window.open(url, '_blank', 'noopener,noreferrer');
          toast.success(t('booking.rescheduleSent'));
        }
      }
      onClose();
    },
    onError: (e) => toast.error(mapError(e, t)),
  });

  const proposeMove = useMutation({
    mutationFn: async ({ id, start }: { id: string; start: string }) => {
      const { data, error } = await supabase.rpc('admin_propose_booking_move', {
        p_booking_id: id,
        p_start_at: start,
      });
      if (error) throw error;
      const token = (data as { token?: string } | null)?.token;
      if (!token) throw new Error('NOT_FOUND');
      return { token, start };
    },
    onSuccess: ({ token, start }) => {
      if (!booking) return;
      const row = normalizeBooking(booking);
      const phone = row.profile?.phone ?? '';
      const locale = i18n.language === 'ar' ? 'ar' : 'en';
      const when = `${formatCairoDateShort(start)} ${formatCairoTime(start, locale)}`;
      const url = `${CUSTOMER_BASE_URL}/move/${token}`;
      const message =
        locale === 'ar'
          ? `أهلاً ${row.profile?.full_name ?? ''} 🙏\nآسف، مش هقدر أخلّصلك الحجز في المعاد اللي حجزته — مشغول في الوقت ده.\nأقدر أنقلك للمعاد ده:\n${when}\nمعادك القديم لسه ثابت. عشان أنقلك، افتح اللينك ووافق:\n${url}`
          : `Hi ${row.profile?.full_name ?? ''} 🙏\nSorry — I can't do your booking at the time you reserved. I'm busy then.\nI can move you to:\n${when}\nYour current time stays until you accept. Open the link and confirm:\n${url}`;
      const wa = phone ? buildWhatsAppUrl(phone, message) : null;
      setOfferFor(row.id);
      setLocalOffer(start);
      setConfirmAction(null);
      invalidate();
      if (!wa) {
        toast.error(t('booking.noPhone'));
        return;
      }
      window.open(wa, '_blank', 'noopener,noreferrer');
      toast.success(t('booking.moveSent'));
    },
    onError: (e) => toast.error(mapError(e, t)),
  });

  const cancelMove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('admin_cancel_booking_move', { p_booking_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      setLocalOffer(null);
      setOfferFor(booking?.id ?? null);
      toast.success(t('booking.moveCancelled'));
      invalidate();
    },
    onError: (e) => toast.error(mapError(e, t)),
  });

  const loadMoveSlots = async (serviceId: string, staffId: string | null, durationMin: number | null) => {
    if (!moveDate || !serviceId) return;
    const r = await fetchSlots({ serviceId, date: moveDate, staffId, durationMin });
    if (r.error) {
      toast.error(mapError(new Error(r.error), t));
      return;
    }
    const starts = r.starts;
    setMoveSlots(starts);
    setMoveSlot('');
    if (starts.length === 0) toast.message(t('booking.moveNoSlots'));
  };

  const setStaff = useMutation({
    mutationFn: async ({ id, staffId }: { id: string; staffId: string | null }) => {
      const rpcUntyped = supabase.rpc.bind(supabase) as unknown as (
        fn: string,
        args: Record<string, unknown>,
      ) => Promise<{ error: { message: string } | null }>;
      const { error } = await rpcUntyped('admin_set_booking_staff', { p_booking_id: id, p_staff_id: staffId });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      setStaffOverride({ id: vars.id, val: vars.staffId ?? '' });
      invalidate();
      toast.success(i18n.language === 'ar' ? 'اتغيّر الحلاق' : 'Barber updated');
    },
    onError: (e) => toast.error(mapError(e, t)),
  });

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: 'completed' | 'no_show' }) => {
      const { error } = await supabase.rpc('admin_set_booking_status', {
        p_booking_id: id,
        p_status: status,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      onClose();
    },
    onError: (e) => toast.error(mapError(e, t)),
  });

  if (!booking) return null;

  const b = normalizeBooking(booking);
  const name = b.profile?.full_name ?? '—';
  const phone = isStaff ? '' : (b.profile?.phone ?? '');
  const rateTok = (b as unknown as { rate_token?: string | null }).rate_token;
  const waUrl = phone
    ? b.status === 'completed' && rateTok
      ? waLink(phone, rateMessage(name, rateTok, !!i18n.language?.startsWith('ar')))
      : buildWhatsAppUrl(phone, '')
    : null;
  const locale = i18n.language;
  const offeredAt =
    offerFor === b.id ? localOffer : b.move_status === 'pending' ? b.move_start_at : null;

  const isAr = locale === 'ar';
  const L = (ar: string, en: string) => (isAr ? ar : en);
  const extrasList = b.extras ?? [];
  const extrasTotal = extrasList.reduce((sum, x) => sum + Number(x.price_egp ?? 0), 0);
  const couponInfo = b as unknown as {
    coupon_code?: string | null;
    discount_egp?: number | null;
    price_before_discount?: number | null;
  };
  const discount = Number(couponInfo.discount_egp ?? 0);
  const hasCoupon = !!couponInfo.coupon_code && discount > 0;
  const methodLabel = (m: string | null | undefined) =>
    m === 'instapay' ? 'InstaPay' : m === 'vodafone_cash' ? L('فودافون كاش', 'Vodafone Cash') : m === 'cash' ? L('كاش في المحل', 'Cash at shop') : null;
  const payStatusLabel = (st: string | null | undefined) =>
    st === 'submitted'
      ? L('مستني تأكيدك', 'Awaiting your confirmation')
      : st === 'confirmed'
        ? L('اتأكد', 'Confirmed')
        : st === 'rejected'
          ? L('اترفض', 'Rejected')
          : null;
  // ملاحظات داخلية بتتكتب أوتوماتيك (مش من العميل) فمش بنعرضها
  const noteText = (b.notes ?? '').trim();
  const showNote = !!noteText && !/walk-?in\s*via\s*admin/i.test(noteText);
  const cancelReasonText = (b.cancel_reason ?? '')
    .replace(/^cancelled by admin$/i, L('اتلغى من الأدمن', 'Cancelled by admin'))
    .replace(/^cancelled by customer$/i, L('اتلغى من العميل', 'Cancelled by customer'));
  // زرار "تمت الحلاقة / لم يحضر" بيظهر قبل الميعاد بربع ساعة وبعده
  const nearOrAfter = Date.now() >= new Date(b.start_at).getTime() - 15 * 60000;
  const canAct = b.status !== 'cancelled' && b.status !== 'completed' && b.status !== 'expired';

  const Section = ({ title, children }: { title: string; children: ReactNode }) => (
    <section className="rounded-card border border-bark/10 bg-white p-3.5">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-70">{title}</h3>
      {children}
    </section>
  );
  const Row = ({ label, children }: { label: string; children: ReactNode }) => (
    <div className="flex items-start justify-between gap-3 py-1 text-sm">
      <span className="shrink-0 text-ink-70">{label}</span>
      <span className="min-w-0 text-end font-medium text-espresso">{children}</span>
    </div>
  );

  return (
    <Sheet open={open} onClose={onClose} title={t('booking.detail')}>
      <div className="space-y-3">
        {/* العميل */}
        <div className="rounded-card bg-espresso p-4 text-cream">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-xl font-bold">{name}</p>
              {phone ? <p dir="ltr" className="mt-0.5 text-start font-latin text-sm text-cream/80">{phone}</p> : null}
            </div>
            <StatusBadge status={b.status} />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {isOnlineBooking(b) ? (
              <span className="inline-flex items-center gap-1 rounded-pill border border-sky-300/40 bg-sky-400/20 px-2.5 py-0.5 text-xs font-semibold text-sky-100">
                💳 {L('دفع أونلاين', 'Paid Online')}
              </span>
            ) : isShopBooking(b) ? (
              <span className="inline-flex items-center gap-1 rounded-pill border border-amber-300/40 bg-amber-400/20 px-2.5 py-0.5 text-xs font-semibold text-amber-100">
                🏪 {L('الدفع في المحل', 'Pay at Shop')}
              </span>
            ) : null}
          </div>
          {phone ? (
            <div className="mt-3 grid grid-cols-2 gap-2">
              <a href={`tel:${phone}`} className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-btn bg-cream/10 text-sm font-medium hover:bg-cream/20">
                <Phone className="size-4" /> {L('اتصال', 'Call')}
              </a>
              {waUrl ? (
                <a href={waUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-btn bg-green-500/90 text-sm font-medium text-white hover:bg-green-500">
                  <MessageCircle className="size-4" /> WhatsApp
                </a>
              ) : (
                <span className="inline-flex min-h-10 items-center justify-center rounded-btn bg-danger/20 text-sm text-red-100">{t('app.invalidPhone')}</span>
              )}
            </div>
          ) : null}
        </div>

        {isStaff ? null : <CustomerFlags userId={b.user_id} />}

        {/* الميعاد والخدمة */}
        <Section title={L('الحجز', 'Appointment')}>
          <Row label={L('الميعاد', 'When')}>
            <span className="font-latin">{formatCairoDateShort(b.start_at)} · {formatCairoTime(b.start_at, locale)}</span>
          </Row>
          {staffList.length >= 2 && !isStaff ? (
            <div className="flex items-center justify-between gap-3 py-1 text-sm">
              <span className="shrink-0 text-ink-70">{L('الحلاق', 'Barber')}</span>
              <select
                value={staffOverride?.id === b.id ? staffOverride.val : ((b as unknown as { staff_id?: string | null }).staff_id ?? '')}
                onChange={(e) => setStaff.mutate({ id: b.id, staffId: e.target.value || null })}
                disabled={setStaff.isPending}
                className="min-h-9 min-w-0 rounded-btn border border-default bg-white px-2 text-sm font-medium"
              >
                <option value="">{L('من غير تحديد', 'Unassigned')}</option>
                {staffList.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>
          ) : null}
          <div className="mt-1 border-t border-bark/10 pt-2">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="font-medium text-espresso">{isAr ? b.service_name_ar : b.service_name_en}</span>
              {isStaff ? null : <span className="font-latin text-ink-70">{formatEGP(Number(b.price_egp) - extrasTotal + (hasCoupon ? discount : 0))}</span>}
            </div>
            {extrasList.map((extra) => (
              <div key={extra.id} className="mt-1 flex items-center justify-between gap-3 text-sm text-ink-70">
                <span>+ {isAr ? extra.name_ar : extra.name_en}</span>
                {isStaff ? null : <span className="font-latin">{formatEGP(extra.price_egp)}</span>}
              </div>
            ))}
          </div>
          {showNote ? (
            <div className="mt-2 rounded-btn bg-sand/50 p-2.5 text-sm">
              <p className="mb-0.5 text-xs text-ink-70">{t('booking.notes')}</p>
              <p className="whitespace-pre-wrap">{b.notes}</p>
            </div>
          ) : null}
        </Section>

        {/* الدفع */}
        {isStaff ? null : (
        <Section title={L('الدفع', 'Payment')}>
          {hasCoupon ? (
            <>
              <Row label={L('قبل الخصم', 'Before discount')}>
                <span className="font-latin text-ink-70 line-through">
                  {formatEGP(Number(couponInfo.price_before_discount ?? Number(b.price_egp) + discount))}
                </span>
              </Row>
              <Row label={L(`كوبون ${couponInfo.coupon_code}`, `Coupon ${couponInfo.coupon_code}`)}>
                <span className="font-latin text-success">− {formatEGP(discount)}</span>
              </Row>
            </>
          ) : null}
          <Row label={L('الإجمالي', 'Total')}>
            <span className="font-latin text-lg font-bold">{formatEGP(b.price_egp)}</span>
          </Row>
          {methodLabel(payment?.method) ? <Row label={L('الطريقة', 'Method')}>{methodLabel(payment?.method)}</Row> : null}
          {payStatusLabel(payment?.status) ? <Row label={L('حالة الدفع', 'Payment status')}>{payStatusLabel(payment?.status)}</Row> : null}

          {proofUrl ? (
            <div className="mt-2">
              <p className="mb-1 text-xs text-ink-70">{t('booking.proof')}</p>
              <img src={proofUrl} alt={t('booking.proof')} className="max-h-48 rounded-btn object-contain" loading="lazy" />
            </div>
          ) : payment?.status === 'submitted' ? (
            <div className="mt-2 rounded-btn bg-sand/50 p-3 text-sm">
              <p className="font-medium text-espresso">{t('payments.viaWhatsApp')}</p>
              <p className="mt-1 text-ink-70">{t('payments.checkWhatsAppHint')}</p>
              {waUrl ? (
                <a href={waUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex">
                  <Button variant="secondary" size="sm">
                    <MessageCircle className="size-4" />
                    {t('payments.openCustomerWhatsApp')}
                  </Button>
                </a>
              ) : null}
            </div>
          ) : null}
        </Section>
        )}

        {isStaff ? null : (b.reviewed_at || b.cancelled_by || b.cancel_reason) ? (
          <Section title={t('booking.auditHistory')}>
            {b.reviewed_at ? (
              <p className="text-sm text-ink-70 font-latin">
                {formatCairoDateShort(b.reviewed_at)} {formatCairoTime(b.reviewed_at, locale)}
              </p>
            ) : null}
            {b.cancel_reason ? <p className="text-sm text-ink-70">{cancelReasonText}</p> : null}
          </Section>
        ) : null}

        {offeredAt ? (
          <div className="rounded-card border border-gold/40 bg-gold/10 p-3 text-sm">
            <p className="font-medium text-espresso">
              {t('booking.movePending', {
                time: `${formatCairoDateShort(offeredAt)} ${formatCairoTime(offeredAt, locale)}`,
              })}
            </p>
            <Button
              className="mt-2"
              variant="ghost"
              size="sm"
              loading={cancelMove.isPending}
              onClick={() => void cancelMove.mutate(b.id)}
            >
              {t('booking.moveCancel')}
            </Button>
          </div>
        ) : null}

        {b.status === 'confirmed' || b.status === 'completed' ? <StaffNote bookingId={b.id} /> : null}

        {/* الإجراءات */}
        {isStaff ? null : (
        <>
        {b.status === 'completed' ? (
          <RateRequest rateToken={(b as unknown as { rate_token?: string | null }).rate_token} phone={phone} name={name} />
        ) : null}
        {b.status === 'confirmed' || b.status === 'completed' ? (
          <PackageUse
            bookingId={b.id}
            userId={b.user_id}
            serviceId={b.service_id}
            alreadyUsed={!!(b as unknown as { customer_package_id?: string | null }).customer_package_id}
            onDone={invalidate}
          />
        ) : null}
        <div className="space-y-2 pt-1">
          {payment?.status === 'submitted' ? (
            <div className="grid grid-cols-2 gap-2">
              <Button variant="primary" size="lg" loading={confirmPayment.isPending} onClick={() => setConfirmAction('confirm')}>
                {t('booking.confirmPayment')}
              </Button>
              <Button variant="danger" size="lg" onClick={() => setConfirmAction('reject')}>
                {t('booking.rejectPayment')}
              </Button>
            </div>
          ) : null}
          {b.status === 'confirmed' && nearOrAfter ? (
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={() => void setStatus.mutate({ id: b.id, status: 'completed' })}>
                {L('تمت الحلاقة ✓', 'Done ✓')}
              </Button>
              <Button variant="secondary" onClick={() => void setStatus.mutate({ id: b.id, status: 'no_show' })}>
                {L('ما حضرش', 'No-show')}
              </Button>
            </div>
          ) : null}
          {canAct ? (
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="ghost"
                onClick={() => {
                  setMoveDate((d) => d || cairoDateString(new Date()));
                  setConfirmAction('move');
                }}
              >
                {t('booking.move')}
              </Button>
              <Button variant="ghost" className="text-danger" onClick={() => setConfirmAction('cancel')}>
                {t('booking.cancel')}
              </Button>
            </div>
          ) : null}
        </div>
        </>
        )}
      </div>

      <ConfirmDialog
        open={confirmAction === 'confirm'}
        title={t('payments.confirmPayment')}
        message={name}
        variant="primary"
        loading={confirmPayment.isPending}
        onConfirm={() => payment && void confirmPayment.mutate(payment.id)}
        onCancel={() => setConfirmAction(null)}
      />

      {confirmAction === 'reject' ? (
        <div className="fixed inset-0 z-[60] flex items-end justify-center p-4 lg:items-center">
          <div className="absolute inset-0 bg-espresso/50" onClick={() => setConfirmAction(null)} />
          <div className="relative w-full max-w-md rounded-card bg-white p-4">
            <Input
              label={t('payments.rejectReason')}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
            />
            <div className="mt-4 flex gap-2 justify-end">
              <Button variant="ghost" onClick={() => setConfirmAction(null)}>{t('app.cancel')}</Button>
              <Button
                variant="danger"
                loading={rejectPayment.isPending}
                disabled={!rejectReason.trim()}
                onClick={() => payment && void rejectPayment.mutate({ id: payment.id, reason: rejectReason })}
              >
                {t('payments.reject')}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {confirmAction === 'move' ? (
        <div className="fixed inset-0 z-[60] flex items-end justify-center p-4 lg:items-center">
          <div className="absolute inset-0 bg-espresso/50" onClick={() => setConfirmAction(null)} />
          <div className="relative w-full max-w-md rounded-card bg-white p-4">
            <p className="mb-2 text-sm text-ink-70">{t('booking.moveHint')}</p>
            <Input
              label={t('booking.moveDate')}
              type="date"
              value={moveDate}
              onChange={(e) => setMoveDate(e.target.value)}
            />
            <Button className="mt-3" variant="secondary" onClick={() => void loadMoveSlots(b.service_id, (b as unknown as { staff_id?: string | null }).staff_id ?? null, Number((b as unknown as { duration_minutes?: number }).duration_minutes ?? 0) || null)}>
              {t('booking.moveLoad')}
            </Button>
            {moveSlots.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {moveSlots.map((slot) => (
                  <button
                    key={slot}
                    type="button"
                    onClick={() => setMoveSlot(slot)}
                    className={`rounded-btn border px-3 py-2 text-sm font-latin ${
                      moveSlot === slot ? 'border-gold bg-gold/10' : 'border-bark/20'
                    }`}
                  >
                    {formatCairoTime(slot, locale)}
                  </button>
                ))}
              </div>
            ) : null}
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Button variant="ghost" onClick={() => setConfirmAction(null)}>{t('app.cancel')}</Button>
              <Button
                variant="primary"
                loading={proposeMove.isPending}
                disabled={!moveSlot}
                onClick={() => void proposeMove.mutate({ id: b.id, start: moveSlot })}
              >
                <MessageCircle className="size-4" />
                {t('booking.moveSend')}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {confirmAction === 'cancel' ? (
        <div className="fixed inset-0 z-[60] flex items-end justify-center p-4 lg:items-center">
          <div className="absolute inset-0 bg-espresso/50" onClick={() => setConfirmAction(null)} />
          <div className="relative w-full max-w-md rounded-card bg-white p-4">
            <p className="mb-3">
              {t('booking.cancelConfirm', {
                name,
                time: formatCairoTime(b.start_at, locale),
              })}
            </p>
            <p className="mb-2 text-sm text-ink-70">{t('booking.rescheduleHint')}</p>
            <p className="mb-2 text-sm text-ink-70">{t('booking.waSendHint')}</p>
            <Input
              label={t('booking.cancelReason')}
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
            />
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Button variant="ghost" onClick={() => setConfirmAction(null)}>{t('app.cancel')}</Button>
              <Button
                variant="secondary"
                loading={cancelBooking.isPending}
                onClick={() => void cancelBooking.mutate({ id: b.id, reason: cancelReason, notify: false })}
              >
                {t('booking.cancelOnly')}
              </Button>
              <Button
                variant="danger"
                loading={cancelBooking.isPending}
                onClick={() => void cancelBooking.mutate({ id: b.id, reason: cancelReason, notify: true })}
              >
                <MessageCircle className="size-4" />
                {t('booking.cancelAndWhatsApp')}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </Sheet>
  );
}
