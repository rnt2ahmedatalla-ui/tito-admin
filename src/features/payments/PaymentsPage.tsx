import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, MessageCircle, Volume2, VolumeX } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import type { PaymentWithBooking } from '@/types/database';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Skeleton } from '@/components/ui/Skeleton';
import { useSignedProofUrl } from '@/hooks/useSignedProofUrl';
import { formatEGP } from '@/lib/money';
import { formatCairoTime, minutesSince, formatWaitTime } from '@/lib/time';
import { mapError } from '@/lib/errors';
import { buildWhatsAppUrl } from '@/lib/whatsapp';
import { cn } from '@/lib/cn';

const SOUND_KEY = 'tito-admin-payment-sound';

function PaymentCard({
  payment,
  focused,
  onFocus,
  onConfirm,
  onReject,
}: {
  payment: PaymentWithBooking;
  focused: boolean;
  onFocus: () => void;
  onConfirm: () => void;
  onReject: () => void;
}) {
  const { t, i18n } = useTranslation();
  const cardRef = useRef<HTMLDivElement>(null);
  const viaWhatsApp = (payment.transaction_ref ?? '').toLowerCase() === 'whatsapp' || !payment.proof_path;
  const { url: proofUrl, loading: proofLoading } = useSignedProofUrl(
    payment.proof_path,
    focused && !!payment.proof_path,
  );

  useEffect(() => {
    if (focused && cardRef.current) {
      cardRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [focused]);

  const name = payment.profile?.full_name ?? '—';
  const phone = payment.profile?.phone ?? '';
  const waitMins = minutesSince(payment.created_at);
  const shortId = payment.booking_id.slice(0, 8).toUpperCase();
  const when = payment.booking
    ? formatCairoTime(payment.booking.start_at, i18n.language)
    : '';

  const waCheckUrl = phone
    ? buildWhatsAppUrl(
        phone,
        i18n.language === 'ar'
          ? `أهلاً ${name}، وصّلنا إنك حوّلت ${formatEGP(payment.amount_egp)} للحجز #${shortId}${when ? ` (${when})` : ''}. ابعت صورة التحويل هنا لو لسه مبعتتهاش 🙏`
          : `Hi ${name}, we got your transfer note for ${formatEGP(payment.amount_egp)} booking #${shortId}${when ? ` (${when})` : ''}. Please send the screenshot here if you haven’t 🙏`,
      )
    : null;

  return (
    <div
      ref={cardRef}
      tabIndex={0}
      onFocus={onFocus}
      className={cn(
        'rounded-card border bg-white p-4 shadow-warm transition-all duration-200',
        focused ? 'border-gold ring-2 ring-gold/30' : 'border-bark/15',
      )}
    >
      <div className="flex flex-col gap-4 lg:flex-row">
        <div className="flex-1">
          {proofLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : proofUrl ? (
            <img
              src={proofUrl}
              alt={t('booking.proof')}
              className="max-h-64 w-full cursor-zoom-in rounded-btn bg-sand/30 object-contain"
              loading="lazy"
              onClick={() => window.open(proofUrl, '_blank', 'noopener,noreferrer')}
            />
          ) : (
            <div className="flex h-40 flex-col items-center justify-center gap-3 rounded-btn bg-sand/40 px-4 text-center">
              <MessageCircle className="size-8 text-gold" />
              <p className="text-sm font-medium text-espresso">{t('payments.viaWhatsApp')}</p>
              <p className="text-xs text-ink-70">{t('payments.checkWhatsAppHint')}</p>
              {waCheckUrl ? (
                <a href={waCheckUrl} target="_blank" rel="noopener noreferrer">
                  <Button variant="primary" size="sm">
                    <MessageCircle className="size-4" />
                    {t('payments.openCustomerWhatsApp')}
                  </Button>
                </a>
              ) : (
                <p className="text-xs text-danger">{t('reminders.noPhone')}</p>
              )}
            </div>
          )}
        </div>
        <div className="flex-1 space-y-3">
          <p className="text-2xl font-bold font-latin text-espresso">{formatEGP(payment.amount_egp)}</p>
          <p className="text-sm text-ink-70">
            {t('payments.waiting')} {formatWaitTime(waitMins, t)}
          </p>
          {viaWhatsApp ? (
            <span className="inline-flex rounded-pill bg-gold/20 px-3 py-1 text-xs font-semibold text-bark">
              WhatsApp
            </span>
          ) : null}
          <p className="text-lg font-semibold">{name}</p>
          <p className="text-sm font-latin" dir="ltr">
            {phone || '—'}
          </p>
          <p className="text-xs font-latin text-ink-70">#{shortId}</p>
          {payment.booking ? (
            <p className="text-sm text-ink-70 font-latin">
              {formatCairoTime(payment.booking.start_at, i18n.language)} ·{' '}
              {i18n.language === 'ar'
                ? payment.booking.service_name_ar
                : payment.booking.service_name_en}
            </p>
          ) : null}
          {payment.method ? (
            <p className="text-sm text-ink-70">
              {payment.method === 'instapay' ? 'InstaPay' : payment.method === 'vodafone_cash' ? 'Vodafone Cash' : payment.method}
            </p>
          ) : null}
          {payment.transaction_ref && payment.transaction_ref !== 'whatsapp' ? (
            <div className="flex items-center gap-2">
              <code className="rounded bg-sand/50 px-2 py-1 text-sm font-latin">
                {payment.transaction_ref}
              </code>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  void navigator.clipboard.writeText(payment.transaction_ref ?? '');
                  toast.success(t('app.copied'));
                }}
              >
                <Copy className="size-4" />
              </Button>
            </div>
          ) : null}
          <div className="flex gap-2 pt-2">
            <Button
              variant="primary"
              size="lg"
              className="flex-1 bg-success hover:bg-success/90"
              onClick={onConfirm}
            >
              {t('payments.confirm')}
            </Button>
            <Button variant="danger" size="lg" className="flex-1" onClick={onReject}>
              {t('payments.reject')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function PaymentsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [soundOn, setSoundOn] = useState(() => localStorage.getItem(SOUND_KEY) === 'true');

  const { data: payments = [], isLoading, isError, error, refetch } = useQuery({
    queryKey: ['payments', 'queue'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payments')
        .select(
          '*, booking:bookings!payments_booking_id_fkey(*), profile:profiles!payments_user_id_fkey(full_name, phone)',
        )
        .eq('status', 'submitted')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as PaymentWithBooking[];
    },
    staleTime: 15_000,
  });

  useEffect(() => {
    const channel = supabase
      .channel('payments-admin')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'payments', filter: 'status=eq.submitted' },
        () => {
          void queryClient.invalidateQueries({ queryKey: ['payments'] });
          void queryClient.invalidateQueries({ queryKey: ['payments-count'] });
          if (soundOn) {
            try {
              const audio = new Audio(`${import.meta.env.BASE_URL}notification.mp3`);
              void audio.play();
            } catch {
              /* optional sound */
            }
          }
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient, soundOn]);

  const confirmMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('admin_confirm_payment', { p_payment_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t('payments.confirm'));
      void queryClient.invalidateQueries({ queryKey: ['payments'] });
      void queryClient.invalidateQueries({ queryKey: ['payments-count'] });
      void queryClient.invalidateQueries({ queryKey: ['bookings'] });
      setConfirmId(null);
    },
    onError: (e) => toast.error(mapError(e, t)),
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const { error } = await supabase.rpc('admin_reject_payment', {
        p_payment_id: id,
        p_reason: reason,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t('payments.reject'));
      void queryClient.invalidateQueries({ queryKey: ['payments'] });
      void queryClient.invalidateQueries({ queryKey: ['payments-count'] });
      setRejectId(null);
      setRejectReason('');
    },
    onError: (e) => toast.error(mapError(e, t)),
  });

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

      if (e.key === 'j') setFocusedIndex((i) => Math.min(i + 1, payments.length - 1));
      if (e.key === 'k') setFocusedIndex((i) => Math.max(i - 1, 0));
      if (e.key === 'Enter' && payments[focusedIndex]) setConfirmId(payments[focusedIndex].id);
      if (e.key === 'r' && payments[focusedIndex]) setRejectId(payments[focusedIndex].id);
    },
    [payments, focusedIndex],
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const toggleSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    localStorage.setItem(SOUND_KEY, String(next));
  };

  const focusedPayment = payments[focusedIndex];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-default pb-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-gold font-latin">WhatsApp</p>
          <h1 className="mt-1 text-2xl font-bold text-espresso">{t('payments.title')}</h1>
          <p className="mt-1 max-w-xl text-sm text-ink-70">{t('payments.whatsappQueueHint')}</p>
        </div>
        <Button variant="ghost" size="sm" onClick={toggleSound} aria-label={t('payments.soundToggle')}>
          {soundOn ? <Volume2 className="size-5" /> : <VolumeX className="size-5" />}
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
      ) : isError ? (
        <div className="space-y-3 py-12 text-center">
          <p className="text-ink-70">{error instanceof Error ? error.message : t('payments.empty')}</p>
          <Button variant="secondary" size="sm" onClick={() => void refetch()}>
            {t('app.retry', { defaultValue: 'Retry' })}
          </Button>
        </div>
      ) : payments.length === 0 ? (
        <p className="py-12 text-center text-ink-70">{t('payments.empty')}</p>
      ) : (
        <div className="space-y-4">
          {payments.map((p, i) => (
            <PaymentCard
              key={p.id}
              payment={p}
              focused={i === focusedIndex}
              onFocus={() => setFocusedIndex(i)}
              onConfirm={() => setConfirmId(p.id)}
              onReject={() => setRejectId(p.id)}
            />
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!confirmId}
        title={t('payments.confirmPayment')}
        message={focusedPayment?.profile?.full_name ?? ''}
        variant="primary"
        loading={confirmMutation.isPending}
        onConfirm={() => confirmId && void confirmMutation.mutate(confirmId)}
        onCancel={() => setConfirmId(null)}
      />

      {rejectId ? (
        <div className="fixed inset-0 z-[60] flex items-end justify-center p-4 lg:items-center">
          <div className="absolute inset-0 bg-espresso/50" onClick={() => setRejectId(null)} />
          <div className="relative w-full max-w-md rounded-card bg-white p-4">
            <Input
              label={t('payments.rejectReason')}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
            />
            <div className="mt-2 flex flex-wrap gap-2">
              {['مبلغ غلط', 'صورة مش واضحة على واتساب', 'تحويل مكرر', 'مفيش صورة'].map((r) => (
                <Button key={r} variant="ghost" size="sm" onClick={() => setRejectReason(r)}>
                  {r}
                </Button>
              ))}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setRejectId(null)}>
                {t('app.cancel')}
              </Button>
              <Button
                variant="danger"
                loading={rejectMutation.isPending}
                disabled={!rejectReason.trim()}
                onClick={() =>
                  rejectId && void rejectMutation.mutate({ id: rejectId, reason: rejectReason })
                }
              >
                {t('payments.reject')}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
