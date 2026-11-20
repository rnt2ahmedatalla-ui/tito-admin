import { waLink } from '@/features/staff/staffLogin';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { MessageCircle, Star } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { supabase } from '@/lib/supabase';

const CUSTOMER_BASE_URL = (import.meta.env.VITE_CUSTOMER_URL || 'https://tito-customer.vercel.app').replace(/\/+$/, '');

/** علامات سريعة عن العميل: غاب قبل كده؟ عميل مميز؟ */
export function CustomerFlags({ userId }: { userId: string }) {
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith('ar');
  const q = useQuery({
    queryKey: ['customer-flags', userId],
    staleTime: 60_000,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bookings')
        .select('status')
        .eq('user_id', userId)
        .in('status', ['no_show', 'completed'])
        .limit(500);
      if (error) throw error;
      const rows = (data ?? []) as Array<{ status: string }>;
      return {
        noShow: rows.filter((r) => r.status === 'no_show').length,
        completed: rows.filter((r) => r.status === 'completed').length,
      };
    },
  });
  const d = q.data;
  if (!d || (d.noShow === 0 && d.completed < 10)) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {d.noShow > 0 ? (
        <span className="inline-flex items-center gap-1 rounded-pill bg-danger/15 px-2.5 py-1 text-xs font-semibold text-danger">
          ⚠ {isAr ? `غاب ${d.noShow} مرة قبل كده` : `No-show ${d.noShow}x before`}
        </span>
      ) : null}
      {d.completed >= 10 ? (
        <span className="inline-flex items-center gap-1 rounded-pill bg-gold/20 px-2.5 py-1 text-xs font-semibold text-espresso">
          <Star className="size-3.5 fill-gold text-gold" />
          {isAr ? `عميل مميز (${d.completed} حلاقة)` : `VIP (${d.completed} visits)`}
        </span>
      ) : null}
    </div>
  );
}

export function rateMessage(name: string, token: string, isAr: boolean): string {
  const link = `${CUSTOMER_BASE_URL}/rate/${token}`;
  return isAr
    ? `أهلاً ${name} 🙏\nنورتنا! رأيك يهمنا، قيّم حلاقتك في ثانيتين:\n${link}`
    : `Hi ${name} 🙏\nThanks for visiting! Rate your cut in two seconds:\n${link}`;
}

/** بعد الحلاقة: رسالة واتساب جاهزة فيها لينك التقييم */
export function RateRequest({ rateToken, phone, name }: { rateToken: string | null | undefined; phone: string; name: string }) {
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith('ar');
  if (!rateToken) return null;
  const msg = rateMessage(name, rateToken, !!isAr);
  const url = phone ? waLink(phone, msg) : null;
  if (!url) return null;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="block">
      <Button variant="secondary" className="w-full">
        <MessageCircle className="size-4" />
        {isAr ? 'اطلب تقييم على واتساب ⭐' : 'Ask for a rating on WhatsApp ⭐'}
      </Button>
    </a>
  );
}
