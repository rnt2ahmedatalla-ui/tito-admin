import { rpcUntyped } from '@/features/staff/staffLogin';

/**
 * المواعيد المتاحة لخدمة (وحلاق لو متحدد) بمدة كلية معينة (حلاقة + إضافات ليها وقت).
 * لو قاعدة البيانات لسه مش متحدّثة (features-v39.sql) بنرجع للطريقة القديمة من غير المدة.
 */
export async function fetchSlots(args: {
  serviceId: string;
  date: string;
  staffId?: string | null;
  durationMin?: number | null;
}): Promise<{ starts: string[]; error: string | null }> {
  const base: Record<string, unknown> = { p_service_id: args.serviceId, p_date: args.date };
  if (args.staffId) base.p_staff_id = args.staffId;
  const fn = args.staffId ? 'get_available_slots_staff' : 'get_available_slots';
  let res = await rpcUntyped(fn, args.durationMin ? { ...base, p_duration_min: args.durationMin } : base);
  if (res.error && args.durationMin) res = await rpcUntyped(fn, base);
  if (res.error) return { starts: [], error: res.error.message };
  const starts = ((res.data ?? []) as Array<{ start_at: string }>).map((r) => r.start_at).filter(Boolean);
  return { starts, error: null };
}
