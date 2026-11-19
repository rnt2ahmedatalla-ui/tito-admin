import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, MessageCircle, Trash2, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import type { PaymentWithBooking } from '@/types/database';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Skeleton } from '@/components/ui/Skeleton';
import { formatEGP } from '@/lib/money';
import { formatCairoDate, formatCairoTime } from '@/lib/time';
import { buildWhatsAppUrl } from '@/lib/whatsapp';
import { untypedDb } from './useFinanceBoxes';
import { cn } from '@/lib/cn';

const PAGE = 20;
const PREF_KEY = 'hidden_transfers';

// "المسح" هنا بيخبّي التحويل من السجل بس. الحساب المالي والحجز نفسه ما بيتأثروش.
function useHiddenTransfers() {
  return useQuery({
    queryKey: ['hidden-transfers'],
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await untypedDb.from('admin_prefs').select('value').eq('key', PREF_KEY).maybeSingle();
      if (error) throw error;
      const ids = (data as { value?: { ids?: unknown } } | null)?.value?.ids;
      return Array.isArray(ids) ? ids.filter((x): x is string => typeof x === 'string') : [];
    },
    retry: false,
    staleTime: 30_000,
  });
}

async function saveHidden(ids: string[]) {
  const { error } = await untypedDb
    .from('admin_prefs')
    .upsert({ key: PREF_KEY, value: { ids }, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) throw error;
}

export function TransfersTab() {
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith('ar');
  const queryClient = useQueryClient();
  const [pages, setPages] = useState(1);
  const [confirmClear, setConfirmClear] = useState(false);
  const hiddenQuery = useHiddenTransfers();
  const hidden = hiddenQuery.data ?? [];

  const listQuery = useQuery({
    queryKey: ['payments', 'history', pages, hidden.length],
    enabled: hiddenQuery.isSuccess || hiddenQuery.isError,
    queryFn: async () => {
      // بنجيب زيادة بعدد المخفي عشان بعد الفلترة يفضل عدد كفاية
      const take = pages * PAGE + hidden.length;
      const { data, error } = await supabase
        .from('payments')
        .select(
          '*, booking:bookings!payments_booking_id_fkey(*), profile:profiles!payments_user_id_fkey(full_name, phone)',
        )
        .in('status', ['confirmed', 'rejected'])
        .order('created_at', { ascending: false })
        .range(0, take);
      if (error) throw error;
      return (data ?? []) as PaymentWithBooking[];
    },
    staleTime: 15_000,
  });

  const hiddenSet = new Set(hidden);
  const visibleAll = (listQuery.data ?? []).filter((p) => !hiddenSet.has(p.id));
  const visible = visibleAll.slice(0, pages * PAGE);
  const hasMore = visibleAll.length > pages * PAGE;

  const hideMutation = useMutation({
    mutationFn: async (ids: string[]) => saveHidden(Array.from(new Set([...hidden, ...ids]))),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['hidden-transfers'] });
      void queryClient.invalidateQueries({ queryKey: ['payments', 'history'] });
    },
    onError: () => toast.error(isAr ? 'معرفتش أمسح، جرّب تاني' : 'Could not remove, try again'),
  });

  const clearAll = async () => {
    const { data, error } = await supabase
      .from('payments')
      .select('id')
      .in('status', ['confirmed', 'rejected'])
      .limit(5000);
    if (error) {
      toast.error(isAr ? 'معرفتش أمسح، جرّب تاني' : 'Could not clear, try again');
      return;
    }
    hideMutation.mutate((data ?? []).map((r) => r.id as string));
    setConfirmClear(false);
  };

  const methodLabel = (m: string) =>
    m === 'instapay' ? 'InstaPay' : m === 'vodafone_cash' ? (isAr ? 'فودافون كاش' : 'Vodafone Cash') : m === 'pay_at_shop' ? (isAr ? 'الدفع في المحل' : 'Pay at shop') : m;

  if (listQuery.isLoading || hiddenQuery.isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-ink-70">
          {isAr ? 'من الأحدث للأقدم. المسح بيخبّي من السجل بس، والحسابات والحجوزات زي ما هي.' : 'Newest first. Removing only hides from this log; finances and bookings are unchanged.'}
        </p>
        {visible.length > 0 ? (
          <Button variant="ghost" size="sm" onClick={() => setConfirmClear(true)}>
            <Trash2 className="size-4" aria-hidden />
            {isAr ? 'امسح الكل' : 'Clear all'}
          </Button>
        ) : null}
      </div>

      {visible.length === 0 ? (
        <p className="rounded-card border border-default bg-white p-6 text-center text-sm text-ink-70">
          {isAr ? 'مفيش تحويلات في السجل' : 'No transfers in the log'}
        </p>
      ) : (
        <ul className="space-y-2">
          {visible.map((p) => {
            const ok = p.status === 'confirmed';
            const phone = p.profile?.phone ?? '';
            const wa = phone ? buildWhatsAppUrl(phone, '') : null;
            return (
              <li key={p.id} className="rounded-card border border-default bg-white p-4 shadow-warm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="break-words font-semibold text-espresso">{p.profile?.full_name ?? '—'}</p>
                    <p dir="ltr" className="font-latin text-xs text-ink-70 text-start">{phone}</p>
                  </div>
                  <div className="shrink-0 text-end">
                    <p className="font-latin text-lg font-bold text-espresso">{formatEGP(p.amount_egp)}</p>
                    <span
                      className={cn(
                        'mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
                        ok ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger',
                      )}
                    >
                      {ok ? <CheckCircle2 className="size-3.5" aria-hidden /> : <XCircle className="size-3.5" aria-hidden />}
                      {ok ? (isAr ? 'اتأكد' : 'Confirmed') : isAr ? 'اترفض' : 'Rejected'}
                    </span>
                  </div>
                </div>

                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                  <div>
                    <dt className="text-ink-70">{isAr ? 'الطريقة' : 'Method'}</dt>
                    <dd className="font-medium text-espresso">{methodLabel(p.method)}</dd>
                  </div>
                  <div>
                    <dt className="text-ink-70">{isAr ? 'اتسجل' : 'Submitted'}</dt>
                    <dd className="font-latin text-espresso">
                      {formatCairoDate(p.created_at, i18n.language)} · {formatCairoTime(p.created_at, i18n.language)}
                    </dd>
                  </div>
                  {p.booking ? (
                    <div className="col-span-2">
                      <dt className="text-ink-70">{isAr ? 'معاد الحجز' : 'Appointment'}</dt>
                      <dd className="font-medium text-espresso">
                        {isAr ? p.booking.service_name_ar : p.booking.service_name_en} ·{' '}
                        <span className="font-latin">
                          {formatCairoDate(p.booking.start_at, i18n.language)} {formatCairoTime(p.booking.start_at, i18n.language)}
                        </span>
                      </dd>
                    </div>
                  ) : null}
                  {!ok && p.rejection_reason ? (
                    <div className="col-span-2">
                      <dt className="text-ink-70">{isAr ? 'سبب الرفض' : 'Reason'}</dt>
                      <dd className="text-danger">{p.rejection_reason}</dd>
                    </div>
                  ) : null}
                </dl>

                <div className="mt-3 flex items-center justify-between gap-2 border-t border-default/60 pt-3">
                  {wa ? (
                    <a href={wa} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-gold underline">
                      <MessageCircle className="me-1 inline size-3.5" aria-hidden />
                      {isAr ? 'واتساب العميل' : 'Customer WhatsApp'}
                    </a>
                  ) : (
                    <span />
                  )}
                  <button
                    type="button"
                    onClick={() => hideMutation.mutate([p.id])}
                    disabled={hideMutation.isPending}
                    className="inline-flex items-center gap-1 rounded-btn px-2 py-1 text-xs text-danger hover:bg-danger/5"
                    aria-label={isAr ? 'امسح من السجل' : 'Remove from log'}
                  >
                    <Trash2 className="size-3.5" aria-hidden />
                    {isAr ? 'امسح' : 'Remove'}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {hasMore ? (
        <Button variant="secondary" className="w-full" onClick={() => setPages((n) => n + 1)}>
          {isAr ? 'عرض المزيد' : 'Show more'}
        </Button>
      ) : null}

      <ConfirmDialog
        open={confirmClear}
        title={isAr ? 'تمسح كل السجل؟' : 'Clear the whole log?'}
        message={isAr ? 'هيتخبّى كل التحويلات من السجل. الحسابات والحجوزات مش هتتأثر.' : 'All transfers will be hidden from the log. Finances and bookings are unaffected.'}
        variant="danger"
        loading={hideMutation.isPending}
        onConfirm={() => void clearAll()}
        onCancel={() => setConfirmClear(false)}
      />
    </div>
  );
}
