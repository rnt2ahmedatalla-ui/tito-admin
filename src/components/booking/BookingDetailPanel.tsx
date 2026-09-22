import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Phone, MessageCircle } from 'lucide-react';
import { toast } from 'sonner';
import type { BookingWithRelations } from '@/types/database';
import { normalizeBooking } from '@/lib/booking';
import { Sheet } from '@/components/ui/Sheet';
import { StatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useSignedProofUrl } from '@/hooks/useSignedProofUrl';
import { formatEGP } from '@/lib/money';
import { formatCairoTime, formatCairoDateShort } from '@/lib/time';
import { mapError } from '@/lib/errors';
import { buildWhatsAppUrl } from '@/lib/whatsapp';
import { supabase } from '@/lib/supabase';

interface BookingDetailPanelProps {
  booking: BookingWithRelations | null;
  open: boolean;
  onClose: () => void;
}

export function BookingDetailPanel({ booking, open, onClose }: BookingDetailPanelProps) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const [confirmAction, setConfirmAction] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [cancelReason, setCancelReason] = useState('');

  const payment = booking ? normalizeBooking(booking).payment : null;
  const { url: proofUrl } = useSignedProofUrl(payment?.proof_path, open && !!payment?.proof_path);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['bookings'] });
    void queryClient.invalidateQueries({ queryKey: ['payments'] });
    void queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
    void queryClient.invalidateQueries({ queryKey: ['payments-count'] });
  };

  const confirmPayment = useMutation({
    mutationFn: async (paymentId: string) => {
      const { error } = await supabase.rpc('admin_confirm_payment', { p_payment_id: paymentId });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t('payments.confirm'));
      invalidate();
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
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const { error } = await supabase.rpc('admin_cancel_booking', {
        p_booking_id: id,
        p_reason: reason,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t('booking.cancel'));
      invalidate();
      onClose();
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
  const phone = b.profile?.phone ?? '';
  const waUrl = phone ? buildWhatsAppUrl(phone, '') : null;
  const locale = i18n.language;

  return (
    <Sheet open={open} onClose={onClose} title={t('booking.detail')}>
      <div className="space-y-4">
        <StatusBadge status={b.status} />

        <div>
          <p className="text-sm text-ink-70">{t('booking.customer')}</p>
          <p className="font-semibold text-lg">{name}</p>
          {phone ? (
            <div className="mt-2 flex gap-2">
              <a href={`tel:${phone}`} className="inline-flex items-center gap-1 text-info text-sm">
                <Phone className="size-4" />
                {phone}
              </a>
              {waUrl ? (
                <a
                  href={waUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-success text-sm"
                >
                  <MessageCircle className="size-4" />
                  WhatsApp
                </a>
              ) : (
                <span className="text-sm text-danger">{t('app.invalidPhone')}</span>
              )}
            </div>
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-sm text-ink-70">{t('booking.service')}</p>
            <p className="font-medium">{locale === 'ar' ? b.service_name_ar : b.service_name_en}</p>
          </div>
          <div>
            <p className="text-sm text-ink-70">{t('booking.price')}</p>
            <p className="font-medium font-latin">{formatEGP(b.price_egp)}</p>
          </div>
          <div>
            <p className="text-sm text-ink-70">{t('booking.time')}</p>
            <p className="font-medium font-latin">
              {formatCairoDateShort(b.start_at)} — {formatCairoTime(b.start_at, locale)}
            </p>
          </div>
        </div>

        {proofUrl ? (
          <div>
            <p className="mb-2 text-sm text-ink-70">{t('booking.proof')}</p>
            <img src={proofUrl} alt={t('booking.proof')} className="max-h-48 rounded-btn object-contain" loading="lazy" />
          </div>
        ) : payment?.status === 'submitted' ? (
          <div className="rounded-btn bg-sand/50 p-3 text-sm">
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

        {(b.reviewed_at || b.cancelled_by) ? (
          <div className="rounded-btn bg-sand/50 p-3 text-sm">
            <p className="font-medium mb-1">{t('booking.auditHistory')}</p>
            {b.reviewed_at ? (
              <p className="text-ink-70">
                {formatCairoDateShort(b.reviewed_at)} {formatCairoTime(b.reviewed_at, locale)}
              </p>
            ) : null}
            {b.cancel_reason ? <p className="text-ink-70">{b.cancel_reason}</p> : null}
          </div>
        ) : null}

        <div className="flex flex-col gap-2 pt-2">
          {payment?.status === 'submitted' ? (
            <>
              <Button
                variant="primary"
                size="lg"
                loading={confirmPayment.isPending}
                onClick={() => setConfirmAction('confirm')}
              >
                {t('booking.confirmPayment')}
              </Button>
              <Button variant="danger" size="lg" onClick={() => setConfirmAction('reject')}>
                {t('booking.rejectPayment')}
              </Button>
            </>
          ) : null}
          {b.status !== 'cancelled' && b.status !== 'completed' ? (
            <Button variant="secondary" onClick={() => setConfirmAction('cancel')}>
              {t('booking.cancel')}
            </Button>
          ) : null}
          {b.status === 'confirmed' ? (
            <>
              <Button variant="secondary" onClick={() => void setStatus.mutate({ id: b.id, status: 'completed' })}>
                {t('booking.markCompleted')}
              </Button>
              <Button variant="danger" onClick={() => void setStatus.mutate({ id: b.id, status: 'no_show' })}>
                {t('booking.markNoShow')}
              </Button>
            </>
          ) : null}
        </div>
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
            <Input
              label={t('booking.cancelReason')}
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
            />
            <div className="mt-4 flex gap-2 justify-end">
              <Button variant="ghost" onClick={() => setConfirmAction(null)}>{t('app.cancel')}</Button>
              <Button
                variant="danger"
                loading={cancelBooking.isPending}
                disabled={!cancelReason.trim()}
                onClick={() => void cancelBooking.mutate({ id: b.id, reason: cancelReason })}
              >
                {t('booking.cancel')}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </Sheet>
  );
}
