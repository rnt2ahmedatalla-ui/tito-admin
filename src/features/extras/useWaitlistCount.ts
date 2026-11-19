import { useQuery } from '@tanstack/react-query';
import { untypedDb } from '@/features/payments/useFinanceBoxes';
import { useFeatureFlags } from './useFeatures';

/** عدد الناس اللي مستنية في قايمة الانتظار (0 لو المميزة مقفولة) */
export function useWaitlistCount() {
  const flags = useFeatureFlags();
  const on = !!flags.data?.waitlist;
  return useQuery({
    queryKey: ['waitlist-count'],
    enabled: on,
    refetchInterval: 30_000,
    retry: false,
    queryFn: async (): Promise<number> => {
      const { count, error } = await untypedDb
        .from('waitlist')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'waiting');
      if (error) return 0;
      return count ?? 0;
    },
    select: (n) => (on ? n : 0),
  });
}
