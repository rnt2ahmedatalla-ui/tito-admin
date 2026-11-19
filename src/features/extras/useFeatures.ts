import { useQuery } from '@tanstack/react-query';
import { untypedDb } from '@/features/payments/useFinanceBoxes';

export type FeatureFlags = { waitlist: boolean; packages: boolean; waitEstimate: boolean };

/** مفاتيح تشغيل المميزات الإضافية (لو الجدول مش موجود يرجع كله مقفول) */
export function useFeatureFlags() {
  return useQuery({
    queryKey: ['feature-settings'],
    queryFn: async (): Promise<FeatureFlags> => {
      const { data, error } = await untypedDb.from('feature_settings').select('*').eq('id', 1).maybeSingle();
      if (error || !data) return { waitlist: false, packages: false, waitEstimate: false };
      const r = data as Record<string, unknown>;
      return { waitlist: !!r.waitlist_enabled, packages: !!r.packages_enabled, waitEstimate: !!r.wait_estimate_enabled };
    },
    staleTime: 30_000,
    retry: false,
  });
}
