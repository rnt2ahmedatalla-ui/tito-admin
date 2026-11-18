import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { PaymentWithBooking } from '@/types/database';

/** طلبات الدفع الأونلاين اللي مستنية تأكيدك (نفس قايمة صفحة الدفعات) */
export function usePendingOnlinePayments() {
  return useQuery({
    // تحت 'payments' عشان تتحدث لوحدها لما تأكد أو ترفض دفعة
    queryKey: ['payments', 'bell-pending'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payments')
        .select(
          '*, booking:bookings!payments_booking_id_fkey(*), profile:profiles!payments_user_id_fkey(full_name, phone)',
        )
        .eq('status', 'submitted')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as PaymentWithBooking[];
    },
    refetchInterval: 15_000,
    staleTime: 10_000,
  });
}
