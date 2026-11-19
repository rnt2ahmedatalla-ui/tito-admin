import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { untypedDb } from '@/features/payments/useFinanceBoxes';
import { supabase } from '@/lib/supabase';
import { mapError } from '@/lib/errors';
import { cairoDateString } from '@/lib/time';
import { useFeatureFlags } from './useFeatures';

const rpc = supabase.rpc.bind(supabase) as unknown as (
  fn: string,
  args?: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message: string } | null }>;

type Cp = { id: string; name_ar: string; sessions_left: number; service_id: string | null; expires_at: string };

/** خصم حصة من باقة العميل على الحجز ده (بيظهر بس لو الباقات شغالة وعند العميل باقة تنفع) */
export function PackageUse({ bookingId, userId, serviceId, alreadyUsed, onDone }: {
  bookingId: string;
  userId: string;
  serviceId: string;
  alreadyUsed: boolean;
  onDone: () => void;
}) {
  const { i18n, t } = useTranslation();
  const L = (ar: string, en: string) => (i18n.language?.startsWith('ar') ? ar : en);
  const qc = useQueryClient();
  const flags = useFeatureFlags();
  const on = !!flags.data?.packages && !alreadyUsed;
  const q = useQuery({
    queryKey: ['usable-packages', userId],
    enabled: on,
    queryFn: async (): Promise<Cp[]> => {
      const { data, error } = await untypedDb
        .from('customer_packages')
        .select('id, name_ar, sessions_left, service_id, expires_at')
        .eq('user_id', userId)
        .gt('sessions_left', 0)
        .gte('expires_at', cairoDateString(new Date()));
      if (error) throw error;
      return ((data ?? []) as Cp[]).filter((p) => !p.service_id || p.service_id === serviceId);
    },
    retry: false,
  });
  const use = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await rpc('admin_use_package_session', { p_customer_package: id, p_booking: bookingId });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success(L('اتخصمت حصة من الباقة', 'Session deducted'));
      void qc.invalidateQueries({ queryKey: ['usable-packages', userId] });
      onDone();
    },
    onError: (e) => toast.error(mapError(e, t)),
  });
  if (!on || !q.data || q.data.length === 0) return null;
  return (
    <div className="space-y-2 rounded-btn border border-gold/40 bg-gold/10 p-3">
      <p className="text-sm font-semibold text-espresso">{L('العميل عنده باقة', 'Customer has a package')}</p>
      {q.data.map((p) => (
        <Button key={p.id} size="sm" variant="secondary" className="w-full justify-between" loading={use.isPending} onClick={() => use.mutate(p.id)}>
          <span className="truncate">{L('خصم من', 'Use')} {p.name_ar}</span>
          <span className="font-latin">({p.sessions_left})</span>
        </Button>
      ))}
    </div>
  );
}
