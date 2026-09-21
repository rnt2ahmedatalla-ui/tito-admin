import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export function usePaymentsCount() {
  return useQuery({
    queryKey: ['payments-count'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('payments')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'submitted');
      if (error) throw error;
      return count ?? 0;
    },
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}
