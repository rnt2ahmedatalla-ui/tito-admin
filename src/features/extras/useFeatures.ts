import { useQuery } from '@tanstack/react-query';
import { untypedDb } from '@/features/payments/useFinanceBoxes';

export type FeatureFlags = {
  waitlist: boolean;
  packages: boolean;
  waitEstimate: boolean;
  inactiveBanner: boolean;
  inactiveAfterDays: number;
  noshowPrepayAfter: number;
  waitWindowHours: number;
  autoCompleteHours: number;
};

const OFF: FeatureFlags = { waitlist: false, packages: false, waitEstimate: false, inactiveBanner: false, inactiveAfterDays: 28, noshowPrepayAfter: 0, waitWindowHours: 3, autoCompleteHours: 0 };

/** مفاتيح تشغيل المميزات الإضافية (لو الجدول مش موجود يرجع كله مقفول) */
export function useFeatureFlags() {
  return useQuery({
    queryKey: ['feature-settings'],
    queryFn: async (): Promise<FeatureFlags> => {
      const { data, error } = await untypedDb.from('feature_settings').select('*').eq('id', 1).maybeSingle();
      if (error || !data) return OFF;
      const r = data as Record<string, unknown>;
      return {
        waitlist: !!r.waitlist_enabled,
        packages: !!r.packages_enabled,
        waitEstimate: !!r.wait_estimate_enabled,
        inactiveBanner: !!r.inactive_banner_enabled,
        inactiveAfterDays: Number(r.inactive_after_days ?? 28),
        noshowPrepayAfter: Number(r.noshow_prepay_after ?? 0),
        waitWindowHours: Number(r.wait_window_hours ?? 3),
        autoCompleteHours: Number(r.auto_complete_hours ?? 0),
      };
    },
    staleTime: 30_000,
    retry: false,
  });
}
