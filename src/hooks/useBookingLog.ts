import { useQuery } from '@tanstack/react-query';
import { untypedDb } from '@/features/payments/useFinanceBoxes';
import type { AdminNotification } from '@/hooks/useAdminNotifications';

export const BOOKING_LOG_PAGE = 30;
const PREF_KEY = 'hidden_booking_notifs';
const BOOKING_FILTER = 'kind.like.booking*,entity.eq.booking';

// "المسح" بيخبّي الإشعار من السجل بس (محفوظ في admin_prefs فبيتزامن بين أجهزتك)
export function useHiddenNotifs() {
  return useQuery({
    queryKey: ['admin-notifications', 'hidden'],
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

export async function saveHiddenNotifs(ids: string[]) {
  const { error } = await untypedDb
    .from('admin_prefs')
    .upsert({ key: PREF_KEY, value: { ids }, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) throw error;
}

export async function fetchAllBookingNotifIds(): Promise<string[]> {
  const { data, error } = await untypedDb.from('admin_notifications').select('id').or(BOOKING_FILTER).limit(5000);
  if (error) throw error;
  return ((data ?? []) as Array<{ id: string }>).map((r) => r.id);
}

/** سجل الحجوزات الجديدة والإلغاءات، صفحات صفحات (بنجيب زيادة بعدد المخفي) */
export function useBookingLog(pages: number, hiddenCount: number, enabled: boolean) {
  return useQuery({
    queryKey: ['admin-notifications', 'booking-log', pages, hiddenCount],
    enabled,
    queryFn: async (): Promise<AdminNotification[]> => {
      const take = pages * BOOKING_LOG_PAGE + hiddenCount;
      const { data, error } = await untypedDb
        .from('admin_notifications')
        .select('id, kind, title_ar, title_en, body_ar, body_en, entity, entity_id, is_read, created_at')
        .or(BOOKING_FILTER)
        .order('created_at', { ascending: false })
        .range(0, take);
      if (error) throw error;
      return (data ?? []) as AdminNotification[];
    },
    refetchInterval: 15_000,
  });
}

/** عدّاد الجديد (غير المقروء) فوق تبويب "الجديدة" */
export function useUnreadBookingCount() {
  return useQuery({
    queryKey: ['admin-notifications', 'unread-bookings'],
    queryFn: async (): Promise<number> => {
      const { count, error } = await untypedDb
        .from('admin_notifications')
        .select('id', { count: 'exact', head: true })
        .eq('is_read', false)
        .or(BOOKING_FILTER);
      if (error) throw error;
      return count ?? 0;
    },
    staleTime: 10_000,
    refetchInterval: 20_000,
  });
}
