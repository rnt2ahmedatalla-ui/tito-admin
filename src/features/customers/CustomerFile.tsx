import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { untypedDb } from '@/features/payments/useFinanceBoxes';
import { useStaff } from '@/features/staff/StaffPage';
import { formatEGP } from '@/lib/money';
import { mapError } from '@/lib/errors';
import { formatCairoDateShort } from '@/lib/time';

type Done = { start_at: string; price_egp: number; staff_id: string | null };
type Hist = { id: string; start_at: string; status: string; price_egp: number; staff_id: string | null; service_name_ar: string | null; service_name_en: string | null };
const ST_AR: Record<string, string> = { completed: 'تمت', confirmed: 'مؤكد', cancelled: 'ملغي', no_show: 'ما حضرش' };

/** ملف العميل: إجمالي الصرف، متوسط الفترة بين الزيارات، الحلاق المفضل، وملاحظات وتفضيلات */
export function CustomerFile({ userId }: { userId: string }) {
  const { i18n, t } = useTranslation();
  const isAr = i18n.language?.startsWith('ar');
  const L = (ar: string, en: string) => (isAr ? ar : en);
  const qc = useQueryClient();
  const staff = useStaff().data ?? [];

  const stats = useQuery({
    queryKey: ['customer-file', userId],
    retry: false,
    queryFn: async (): Promise<Done[]> => {
      const { data, error } = await untypedDb
        .from('bookings')
        .select('start_at, price_egp, staff_id')
        .eq('user_id', userId)
        .eq('status', 'completed')
        .order('start_at', { ascending: true })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as Done[];
    },
  });

  const hist = useQuery({
    queryKey: ['customer-history', userId],
    retry: false,
    queryFn: async (): Promise<Hist[]> => {
      const { data, error } = await untypedDb
        .from('bookings')
        .select('id, start_at, status, price_egp, staff_id, service_name_ar, service_name_en')
        .eq('user_id', userId)
        .in('status', ['completed', 'confirmed', 'cancelled', 'no_show'])
        .order('start_at', { ascending: false })
        .limit(15);
      if (error) throw error;
      return (data ?? []) as Hist[];
    },
  });

  const noteQ = useQuery({
    queryKey: ['customer-note', userId],
    retry: false,
    queryFn: async (): Promise<{ note: string; staffNote: string }> => {
      let r = await untypedDb.from('customer_notes').select('note, staff_note').eq('user_id', userId).maybeSingle();
      if (r.error) r = await untypedDb.from('customer_notes').select('note').eq('user_id', userId).maybeSingle();
      if (r.error) throw r.error;
      const d = (r.data ?? {}) as { note?: string; staff_note?: string };
      return { note: d.note ?? '', staffNote: d.staff_note ?? '' };
    },
  });
  const [note, setNote] = useState('');
  const [staffNote, setStaffNote] = useState('');
  useEffect(() => {
    if (noteQ.data !== undefined) {
      setNote(noteQ.data.note);
      setStaffNote(noteQ.data.staffNote);
    }
  }, [noteQ.data]);

  const save = useMutation({
    mutationFn: async () => {
      const base = { user_id: userId, note: note.trim().slice(0, 1000), updated_at: new Date().toISOString() };
      let { error } = await untypedDb.from('customer_notes').upsert({ ...base, staff_note: staffNote.trim().slice(0, 500) });
      // لو ملف features-v41.sql لسه متشغلش نحفظ الملاحظة العادية بس
      if (error) ({ error } = await untypedDb.from('customer_notes').upsert(base));
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(L('اتحفظت الملاحظة', 'Note saved'));
      void qc.invalidateQueries({ queryKey: ['customer-note', userId] });
    },
    onError: (e) => toast.error(mapError(e, t)),
  });

  const rows = stats.data ?? [];
  const spent = rows.reduce((s, r) => s + Number(r.price_egp || 0), 0);
  let avgGap: number | null = null;
  if (rows.length >= 2) {
    const first = Date.parse(rows[0]!.start_at);
    const last = Date.parse(rows[rows.length - 1]!.start_at);
    avgGap = Math.round((last - first) / 86400_000 / (rows.length - 1));
  }
  const byStaff = new Map<string, number>();
  rows.forEach((r) => r.staff_id && byStaff.set(r.staff_id, (byStaff.get(r.staff_id) ?? 0) + 1));
  const favId = [...byStaff.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const fav = staff.length >= 2 ? staff.find((m) => m.id === favId)?.name : undefined;
  const noteMissing = noteQ.isError;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-btn bg-sand/50 px-2.5 py-2">
          <p className="text-xs text-ink-70">{L('إجمالي اللي صرفه', 'Total spent')}</p>
          <p className="font-latin font-semibold">{formatEGP(spent)}</p>
        </div>
        <div className="rounded-btn bg-sand/50 px-2.5 py-2">
          <p className="text-xs text-ink-70">{L('بيجي كل', 'Visits every')}</p>
          <p className="font-latin font-semibold">{avgGap === null ? '—' : isAr ? `${avgGap} يوم` : `${avgGap} days`}</p>
        </div>
        {fav ? (
          <div className="col-span-2 rounded-btn bg-sand/50 px-2.5 py-2">
            <p className="text-xs text-ink-70">{L('حلاقه المفضل', 'Preferred barber')}</p>
            <p className="font-semibold">{fav}</p>
          </div>
        ) : null}
      </div>
      {(hist.data ?? []).length > 0 ? (
        <div className="space-y-1.5">
          <p className="font-semibold text-espresso">{L('سجل الحلاقات', 'Visit history')}</p>
          <ul className="divide-y divide-default rounded-btn border border-default bg-white text-sm">
            {(hist.data ?? []).map((h) => (
              <li key={h.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 px-3 py-2">
                <span className="font-latin text-xs text-ink-70">{formatCairoDateShort(h.start_at)}</span>
                <span className="min-w-0 flex-1 truncate">
                  {isAr ? h.service_name_ar : h.service_name_en}
                  {staff.length >= 2 && h.staff_id ? ` · ${staff.find((m) => m.id === h.staff_id)?.name ?? ''}` : ''}
                </span>
                <span className={h.status === 'completed' ? 'text-xs font-medium text-success' : 'text-xs text-ink-70'}>{isAr ? (ST_AR[h.status] ?? h.status) : h.status}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {noteMissing ? null : (
        <div className="space-y-2">
          <p className="font-semibold text-espresso">{L('ملاحظات وتفضيلات', 'Notes & preferences')}</p>
          <textarea
            rows={3}
            maxLength={1000}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={L('ملاحظاتك إنت بس (مبتظهرش للحلاق)', 'Your private notes (barbers do not see this)')}
            className="w-full rounded-btn border border-bark/20 bg-white p-3 text-sm text-espresso"
          />
          <p className="font-semibold text-espresso">{L('تفضيلات بتظهر للحلاق', 'Preferences shown to the barber')}</p>
          <textarea
            rows={2}
            maxLength={500}
            value={staffNote}
            onChange={(e) => setStaffNote(e.target.value)}
            placeholder={L('مثلاً: ماكينة 2 على الجنب، مبيحبش الكلام كتير…', 'e.g. clipper 2 on the sides, prefers quiet…')}
            className="w-full rounded-btn border border-bark/20 bg-white p-3 text-sm text-espresso"
          />
          <Button size="sm" variant="secondary" loading={save.isPending} disabled={note === (noteQ.data?.note ?? '') && staffNote === (noteQ.data?.staffNote ?? '')} onClick={() => save.mutate()}>
            {L('حفظ الملاحظة', 'Save note')}
          </Button>
        </div>
      )}
    </div>
  );
}
