import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, Volume2, VolumeX } from 'lucide-react';
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
  const { url: proofUrl, loading: proofLoading } = useSignedProofUrl(payment.proof_path, focused);

  useEffect(() => {
    if (focused && cardRef.current) {
      cardRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [focused]);

  const name = payment.profile?.full_name ?? '—';
  const waitMins = minutesSince(payment.created_at);

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
              className="max-h-64 w-full rounded-btn object-contain bg-sand/30 cursor-zoom-in"
              loading="lazy"
              onClick={() => window.open(proofUrl, '_blank', 'noopener,noreferrer')}
            />
          ) : (
            <div className="h-32 rounded-btn bg-sand/30 flex items-center justify-center text-ink-70 text-sm">
              —
            </div>
          )}
        </div>
        <div className="flex-1 space-y-3">
          <p className="text-2xl font-bold font-latin text-espresso">{formatEGP(payment.amount_egp)}</p>
          <p className="text-sm text-ink-70">
            {t('payments.waiting')} {formatWaitTime(waitMins, t)}
          </p>
          <p className="font-semibold text-lg">{name}</p>
          <p className="text-sm font-latin">{payment.profile?.phone}</p>
          {payment.booking ? (
            <p className="text-sm text-ink-70 font-latin">
              {formatCairoTime(payment.booking.start_at, i18n.language)}
            </p>
          ) : null}
          {payment.transaction_ref ? (
            <div className="flex items-center gap-2">
              <code className="text-sm font-latin bg-sand/50 px-2 py-1 rounded">{payment.transaction_ref}</code>
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
            <Button variant="primary" size="lg" className="flex-1 bg-success hover:bg-success/90" onClick={onConfirm}>
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

  const { data: payments = [], isLoading } = useQuery({
    queryKey: ['payments', 'queue'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payments')
        .select('*, booking:bookings(*), profile:profiles(full_name, phone)')
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
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{t('payments.title')}</h1>
        <Button variant="ghost" size="sm" onClick={toggleSound} aria-label={t('payments.soundToggle')}>
          {soundOn ? <Volume2 className="size-5" /> : <VolumeX className="size-5" />}
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
      ) : payments.length === 0 ? (
        <p className="text-center text-ink-70 py-12">{t('payments.empty')}</p>
      ) : (
        <div className="space-y-4">
          {payments.map((p, i) => (
            <div key={p.id}>
              <PaymentCard
                payment={p}
                focused={i === focusedIndex}
                onFocus={() => setFocusedIndex(i)}
                onConfirm={() => setConfirmId(p.id)}
                onReject={() => setRejectId(p.id)}
              />
            </div>
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
              {['مبلغ غلط', 'إثبات مش واضح', 'تحويل مكرر'].map((r) => (
                <Button key={r} variant="ghost" size="sm" onClick={() => setRejectReason(r)}>
                  {r}
                </Button>
              ))}
            </div>
            <div className="mt-4 flex gap-2 justify-end">
              <Button variant="ghost" onClick={() => setRejectId(null)}>{t('app.cancel')}</Button>
              <Button
                variant="danger"
                loading={rejectMutation.isPending}
                disabled={!rejectReason.trim()}
                onClick={() => rejectId && void rejectMutation.mutate({ id: rejectId, reason: rejectReason })}
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
