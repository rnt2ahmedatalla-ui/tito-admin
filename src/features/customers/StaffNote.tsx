import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { StickyNote } from 'lucide-react';
import { rpcUntyped } from '@/features/staff/staffLogin';

/** ملاحظة العميل اللي بتظهر للحلاق قبل ما يبدأ (تفضيلات: ماكينة 2 على الجنب…) */
export function StaffNote({ bookingId }: { bookingId: string }) {
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith('ar');
  const q = useQuery({
    queryKey: ['staff-booking-note', bookingId],
    retry: false,
    staleTime: 60_000,
    queryFn: async (): Promise<string> => {
      const r = await rpcUntyped('staff_booking_note', { p_booking_id: bookingId });
      if (r.error) return '';
      return typeof r.data === 'string' ? r.data : '';
    },
  });
  if (!q.data?.trim()) return null;
  return (
    <div className="flex items-start gap-2 rounded-card border border-gold/50 bg-gold/10 p-3">
      <StickyNote className="mt-0.5 size-4 shrink-0 text-gold" aria-hidden />
      <div className="min-w-0">
        <p className="text-xs font-semibold text-ink-70">{isAr ? 'تفضيلات العميل' : 'Customer preferences'}</p>
        <p className="whitespace-pre-line break-words text-sm text-espresso">{q.data}</p>
      </div>
    </div>
  );
}
