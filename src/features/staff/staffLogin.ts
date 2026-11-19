import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { normalizeEgyptPhone } from '@/lib/whatsapp';
import { untypedDb } from '@/features/payments/useFinanceBoxes';

export const rpcUntyped = supabase.rpc.bind(supabase) as unknown as (
  fn: string,
  args?: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message: string } | null }>;

/** لينك صفحة الأدمن الحالية (نفس اللينك اللي إنت بتدخل منه) */
export function adminUrl(): string {
  return `${window.location.origin}${import.meta.env.BASE_URL ?? '/'}`;
}

/** أرقام الحلاقين (محفوظة للأدمن بس) */
export function useStaffPhones() {
  return useQuery({
    queryKey: ['staff-phones'],
    retry: false,
    staleTime: 30_000,
    queryFn: async (): Promise<Record<string, string>> => {
      const { data, error } = await untypedDb.from('staff_private').select('staff_id, phone');
      if (error) throw error;
      const map: Record<string, string> = {};
      ((data ?? []) as Array<{ staff_id: string; phone: string | null }>).forEach((r) => {
        if (r.phone) map[r.staff_id] = r.phone;
      });
      return map;
    },
  });
}

export async function saveStaffPhone(staffId: string, phone: string): Promise<void> {
  const clean = phone.trim();
  if (!clean) {
    await untypedDb.from('staff_private').delete().eq('staff_id', staffId);
    return;
  }
  const { error } = await untypedDb.from('staff_private').upsert({ staff_id: staffId, phone: clean }, { onConflict: 'staff_id' });
  if (error) throw error;
}

export function loginMessage(name: string, user: string, pass: string, isAr: boolean): string {
  return isAr
    ? `أهلاً ${name} 👋\nده حسابك على نظام تيتو، هتشوف منه حجوزاتك:\n\nاللينك: ${adminUrl()}\nاسم المستخدم: ${user}\nالباسورد: ${pass}\n\nاحتفظ بالبيانات دي ومتبعتهاش لحد.`
    : `Hi ${name} 👋\nYour Tito account to see your bookings:\n\nLink: ${adminUrl()}\nUsername: ${user}\nPassword: ${pass}\n\nKeep these private.`;
}

/** رابط واتساب بيحافظ على السطور (الدالة العادية بتشيل السطور الجديدة) */
export function waLink(phone: string, message: string): string | null {
  const n = normalizeEgyptPhone(phone);
  if (!n) return null;
  return `https://wa.me/${n}?text=${encodeURIComponent(message.slice(0, 1500))}`;
}
