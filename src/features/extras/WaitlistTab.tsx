import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MessageCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { untypedDb } from '@/features/payments/useFinanceBoxes';
import { buildWhatsAppUrl } from '@/lib/whatsapp';
import { mapError } from '@/lib/errors';

const CUSTOMER_BASE_URL = (import.meta.env.VITE_CUSTOMER_URL || 'https://tito-customer.vercel.app').replace(/\/+$/, '');

type Row = {
  id: string;
  day: string;
  note: string | null;
  status: 'waiting' | 'notified';
  service_id: string | null;
  profile: { full_name: string | null; phone: string | null } | null;
};

export function WaitlistTab() {
  const { i18n, t } = useTranslation();
  const isAr = i18n.language?.startsWith('ar');
  const L = (ar: string, en: string) => (isAr ? ar : en);
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ['waitlist-admin'],
    queryFn: async (): Promise<Row[]> => {
      const { data, error } = await untypedDb
        .from('waitlist')
        .select('id, day, note, status, service_id, profile:profiles(full_name, phone)')
        .in('status', ['waiting', 'notified'])
        .order('day');
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
    refetchInterval: 30_000,
    retry: false,
  });
  const svcQ = useQuery({
    queryKey: ['waitlist-services'],
    queryFn: async () => {
      const { data } = await untypedDb.from('services').select('id, name_ar, name_en');
      return (data ?? []) as Array<{ id: string; name_ar: string; name_en: string }>;
    },
    staleTime: 5 * 60_000,
  });
  const svcName = (id: string | null) => {
    const s = svcQ.data?.find((x) => x.id === id);
    return s ? (isAr ? s.name_ar : s.name_en) : '';
  };

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: 'notified' | 'done' | 'cancelled' }) => {
      const { error } = await untypedDb.from('waitlist').update({ status }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['waitlist-admin'] }),
    onError: (e) => toast.error(mapError(e, t)),
  });

  const notify = (r: Row) => {
    const phone = r.profile?.phone ?? '';
    const msg = isAr
      ? `أهلاً ${r.profile?.full_name ?? ''} 🙏\nفضي معاد يوم ${r.day}. لو لسه عايز تحجز، احجز من هنا بسرعة:\n${CUSTOMER_BASE_URL}/book`
      : `Hi ${r.profile?.full_name ?? ''} 🙏\nA slot opened up on ${r.day}. Book quickly here:\n${CUSTOMER_BASE_URL}/book`;
    const url = phone ? buildWhatsAppUrl(phone, msg) : null;
    if (!url) {
      toast.error(L('مفيش رقم صالح للعميل', 'No valid phone number'));
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
    setStatus.mutate({ id: r.id, status: 'notified' });
  };

  if (q.isError) {
    return <p className="rounded-btn bg-sand/50 p-3 text-sm">{L('محتاج تشغّل ملف features-v32.sql في Supabase الأول.', 'Run features-v32.sql in Supabase first.')}</p>;
  }
  if (q.isLoading) return <Skeleton className="h-32" />;
  const rows = q.data ?? [];
  if (rows.length === 0) return <p className="py-10 text-center text-ink-70">{L('مفيش حد في قايمة الانتظار.', 'Nobody is on the waiting list.')}</p>;

  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-70">{L('لما يفضى معاد، ابعت للعميل على واتساب. أول واحد في القايمة هو الأقدم.', 'When a slot frees up, message the customer on WhatsApp.')}</p>
      {rows.map((r) => (
        <Card key={r.id}>
          <CardBody className="space-y-2 p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-semibold text-espresso">{r.profile?.full_name ?? '—'}</p>
                <p className="font-latin text-xs text-ink-70">{r.profile?.phone}</p>
              </div>
              <span className="shrink-0 rounded-full bg-sand/70 px-2.5 py-1 font-latin text-xs font-semibold text-espresso">{r.day}</span>
            </div>
            {svcName(r.service_id) ? <p className="text-sm text-ink-70">{svcName(r.service_id)}</p> : null}
            {r.note ? <p className="text-sm text-espresso">“{r.note}”</p> : null}
            {r.status === 'notified' ? <p className="text-xs font-semibold text-gold">{L('اتبلّغ ✓', 'Notified ✓')}</p> : null}
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="primary" onClick={() => notify(r)}>
                <MessageCircle className="size-4" />
                {L('فيه معاد فاضي', 'Slot available')}
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setStatus.mutate({ id: r.id, status: 'done' })}>
                {L('تم', 'Done')}
              </Button>
              <Button size="sm" variant="ghost" className="text-danger" onClick={() => setStatus.mutate({ id: r.id, status: 'cancelled' })}>
                {L('شيل', 'Remove')}
              </Button>
            </div>
          </CardBody>
        </Card>
      ))}
    </div>
  );
}
