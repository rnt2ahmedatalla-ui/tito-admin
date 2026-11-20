import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarHeart, Pencil, Plus, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { untypedDb } from '@/features/payments/useFinanceBoxes';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardBody } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { mapError } from '@/lib/errors';

type Brk = { start: string; end: string };
type Period = {
  id: string;
  name_ar: string;
  name_en: string | null;
  start_date: string;
  end_date: string;
  release_on: string | null;
  open_time: string;
  close_time: string;
  last_slot_start: string | null;
  breaks: Brk[] | null;
  is_active: boolean;
};

const toMin = (s: string) => { const [h, m] = s.split(':'); return (Number(h) || 0) * 60 + (Number(m) || 0); };
const fromMin = (n: number) => `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
/** نفس حساب «مواعيد العمل»: آخر خانة بتخلّص مع القفل بالظبط بنفس الفاصل بين المواعيد */
function autoLast(open: string, close: string, step: number): string {
  const o = toMin(open); const c = toMin(close); const limit = c - step;
  if (step <= 0 || limit < o) return open;
  return fromMin(o + Math.floor((limit - o) / step) * step);
}
const hm = (s: string | null | undefined) => (s ? s.slice(0, 5) : '');
const todayYmd = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' });

const EMPTY = {
  name_ar: '',
  name_en: '',
  start_date: '',
  end_date: '',
  release_on: '',
  open_time: '12:00',
  close_time: '23:00',
  last_slot_start: '',
  breaks: [] as Brk[],
  is_active: true,
  lastAuto: true,
};

export function SeasonsPage() {
  const { i18n } = useTranslation();
  const isAr = !!i18n.language?.startsWith('ar');
  const L = (ar: string, en: string) => (isAr ? ar : en);
  const qc = useQueryClient();
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [form, setForm] = useState({ ...EMPTY });
  const [delId, setDelId] = useState<string | null>(null);

  const stepQ = useQuery({
    queryKey: ['slot-step'],
    queryFn: async () => {
      const { data } = await untypedDb.from('settings').select('slot_step_min').eq('id', 1).maybeSingle();
      return Number((data as { slot_step_min?: number } | null)?.slot_step_min ?? 30) || 30;
    },
  });
  const step = stepQ.data ?? 30;
  const lastShown = form.lastAuto ? autoLast(form.open_time, form.close_time, step) : form.last_slot_start;

  const q = useQuery({
    queryKey: ['special-periods'],
    queryFn: async () => {
      const { data, error } = await untypedDb.from('special_periods').select('*').order('start_date', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Period[];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!form.name_ar.trim()) throw new Error(L('اكتب اسم الموسم', 'Enter a name'));
      if (!form.start_date || !form.end_date) throw new Error(L('اختار أول وآخر يوم', 'Pick start and end dates'));
      if (form.end_date < form.start_date) throw new Error(L('آخر يوم قبل أول يوم', 'End is before start'));
      if (form.close_time <= form.open_time) throw new Error(L('معاد القفل لازم بعد الفتح', 'Close must be after open'));
      for (const b of form.breaks) {
        if (!b.start || !b.end || b.end <= b.start) throw new Error(L('راجع معاد الاستراحة', 'Check the break times'));
      }
      const row = {
        name_ar: form.name_ar.trim(),
        name_en: form.name_en.trim() || null,
        start_date: form.start_date,
        end_date: form.end_date,
        release_on: form.release_on || null,
        open_time: form.open_time,
        close_time: form.close_time,
        last_slot_start: lastShown || null,
        breaks: form.breaks,
        is_active: form.is_active,
      };
      const r = editing && editing !== 'new'
        ? await untypedDb.from('special_periods').update(row).eq('id', editing)
        : await untypedDb.from('special_periods').insert(row);
      if (r.error) throw r.error;
    },
    onSuccess: () => {
      toast.success(L('اتحفظ ✓', 'Saved ✓'));
      setEditing(null);
      void qc.invalidateQueries({ queryKey: ['special-periods'] });
    },
    onError: (e) => toast.error(mapError(e)),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await untypedDb.from('special_periods').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(L('اتمسح', 'Deleted'));
      setDelId(null);
      void qc.invalidateQueries({ queryKey: ['special-periods'] });
    },
    onError: (e) => toast.error(mapError(e)),
  });

  const openForm = (p?: Period) => {
    if (p) {
      setForm({
        name_ar: p.name_ar,
        name_en: p.name_en ?? '',
        start_date: p.start_date,
        end_date: p.end_date,
        release_on: p.release_on ?? '',
        open_time: hm(p.open_time),
        close_time: hm(p.close_time),
        last_slot_start: hm(p.last_slot_start),
        breaks: (p.breaks ?? []).map((b) => ({ start: hm(b.start), end: hm(b.end) })),
        is_active: p.is_active,
        lastAuto: !p.last_slot_start || hm(p.last_slot_start) === autoLast(hm(p.open_time), hm(p.close_time), step),
      });
      setEditing(p.id);
    } else {
      setForm({ ...EMPTY });
      setEditing('new');
    }
  };

  const set = <K extends keyof typeof EMPTY>(k: K, v: (typeof EMPTY)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const today = todayYmd();
  const fmt = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString(isAr ? 'ar-EG' : 'en-GB', { day: 'numeric', month: 'long' });

  const status = (p: Period) => {
    if (!p.is_active) return { t: L('موقوف', 'Paused'), c: 'bg-sand text-ink-70' };
    if (p.end_date < today) return { t: L('خلص', 'Ended'), c: 'bg-sand text-ink-70' };
    if (p.release_on && today < p.release_on) return { t: L('مقفول لحد ' + fmt(p.release_on), 'Closed until ' + fmt(p.release_on)), c: 'bg-amber-100 text-amber-800' };
    return { t: L('شغال', 'Live'), c: 'bg-emerald-100 text-emerald-800' };
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-espresso">
            <CalendarHeart className="size-5 text-gold" /> {L('المواسم والأعياد', 'Seasons & holidays')}
          </h1>
          <p className="mt-1 text-sm text-ink-70">
            {L('حدد أيام الموسم، ومعاد فتح الحجز، ومواعيد الشغل والاستراحات الخاصة بيه. بيفتح لوحده في اليوم ده.',
              'Set the season dates, when booking opens, and its own hours and breaks. It opens by itself.')}
          </p>
        </div>
        {!editing ? (
          <Button variant="primary" onClick={() => openForm()}>
            <Plus className="size-4" /> {L('موسم جديد', 'New season')}
          </Button>
        ) : null}
      </div>

      {editing ? (
        <Card>
          <CardBody className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Input label={L('الاسم (عربي)', 'Name (Arabic)')} value={form.name_ar} onChange={(e) => set('name_ar', e.target.value)} placeholder="عيد الفطر" />
              <Input label={L('الاسم (إنجليزي)', 'Name (English)')} value={form.name_en} onChange={(e) => set('name_en', e.target.value)} placeholder="Eid al-Fitr" dir="ltr" />
            </div>

            <div className="rounded-btn bg-sand/50 p-3">
              <p className="mb-2 text-sm font-semibold text-espresso">{L('١) أيام الموسم', '1) Season days')}</p>
              <div className="grid grid-cols-2 gap-3">
                <Input type="date" label={L('من يوم', 'From')} value={form.start_date} onChange={(e) => set('start_date', e.target.value)} />
                <Input type="date" label={L('لحد يوم', 'To')} value={form.end_date} onChange={(e) => set('end_date', e.target.value)} />
              </div>
              <div className="mt-3">
                <Input type="date" label={L('الحجز يتفتح للأيام دي يوم (اختياري)', 'Booking opens on (optional)')} value={form.release_on} onChange={(e) => set('release_on', e.target.value)} />
                <p className="mt-1 text-xs text-ink-70">
                  {L('لحد اليوم ده الأيام دي بتبان للزبون "هنفتح يوم كذا". فاضي = الحجز متاح من دلوقتي.',
                    'Until this day customers see "opens on …". Empty = bookable now.')}
                </p>
              </div>
            </div>

            <div className="rounded-btn bg-sand/50 p-3">
              <p className="mb-2 text-sm font-semibold text-espresso">{L('٢) مواعيد الشغل في الموسم', '2) Hours during the season')}</p>
              <div className="grid grid-cols-2 gap-3">
                <Input type="time" label={L('بنفتح', 'Open')} value={form.open_time} onChange={(e) => set('open_time', e.target.value)} className="px-2 text-center text-lg" />
                <Input type="time" label={L('بنقفل', 'Close')} value={form.close_time} onChange={(e) => set('close_time', e.target.value)} className="px-2 text-center text-lg" />
              </div>
              <div className="mt-3 rounded-btn bg-white p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-espresso">{L('آخر معاد حجز', 'Last booking time')}</p>
                    <p className="text-xs text-ink-70">{form.lastAuto ? L('بيتحسب لوحده حسب القفل والفاصل بين المواعيد', 'Calculated from closing time & slot step') : L('إنت محدده بإيدك', 'Set manually')}</p>
                  </div>
                  <p className="font-latin text-xl font-semibold text-espresso" dir="ltr">{lastShown}</p>
                </div>
                <label className="mt-2 flex items-center gap-2 text-sm">
                  <input type="checkbox" className="size-4" checked={form.lastAuto} onChange={(e) => setForm((f) => ({ ...f, lastAuto: e.target.checked, last_slot_start: e.target.checked ? f.last_slot_start : autoLast(f.open_time, f.close_time, step) }))} />
                  {L('تلقائي', 'Automatic')}
                </label>
                {!form.lastAuto ? <div className="mt-2"><Input type="time" value={form.last_slot_start} onChange={(e) => set('last_slot_start', e.target.value)} className="px-2 text-center text-lg" /></div> : null}
              </div>
            </div>

            <div className="rounded-btn bg-sand/50 p-3">
              <p className="mb-2 text-sm font-semibold text-espresso">{L('٣) استراحات الموسم', '3) Season breaks')}</p>
              <div className="space-y-2">
                {form.breaks.map((b, i) => (
                  <div key={i} className="flex items-end gap-2">
                    <Input type="time" className="px-2 text-center text-lg" label={i === 0 ? L('من', 'From') : undefined} value={b.start}
                      onChange={(e) => set('breaks', form.breaks.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)))} />
                    <Input type="time" className="px-2 text-center text-lg" label={i === 0 ? L('إلى', 'To') : undefined} value={b.end}
                      onChange={(e) => set('breaks', form.breaks.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)))} />
                    <Button variant="ghost" aria-label={L('شيل', 'Remove')} onClick={() => set('breaks', form.breaks.filter((_, j) => j !== i))}>
                      <X className="size-4" />
                    </Button>
                  </div>
                ))}
              </div>
              <Button variant="secondary" size="sm" className="mt-2" onClick={() => set('breaks', [...form.breaks, { start: '15:00', end: '15:30' }])}>
                <Plus className="size-4" /> {L('أضف استراحة', 'Add break')}
              </Button>
              <p className="mt-1 text-xs text-ink-70">{L('استراحات المحل العادية مش بتشتغل في أيام الموسم، الاستراحات هنا بس.', 'Normal breaks are ignored on season days; only these apply.')}</p>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.is_active} onChange={(e) => set('is_active', e.target.checked)} className="size-4" />
              {L('الموسم شغال (شيلها لو عايز توقفه)', 'Season active (untick to pause)')}
            </label>

            <div className="flex gap-2">
              <Button variant="primary" loading={save.isPending} onClick={() => save.mutate()}>{L('حفظ', 'Save')}</Button>
              <Button variant="ghost" onClick={() => setEditing(null)}>{L('إلغاء', 'Cancel')}</Button>
            </div>
          </CardBody>
        </Card>
      ) : null}

      {q.isLoading ? <Skeleton className="h-24" /> : null}
      {q.isError ? (
        <Card><CardBody className="text-sm text-danger">{L('شغّل ملف features-v43.sql في Supabase الأول.', 'Run features-v43.sql in Supabase first.')}</CardBody></Card>
      ) : null}
      {!q.isLoading && !q.isError && (q.data ?? []).length === 0 && !editing ? (
        <Card><CardBody className="py-8 text-center text-sm text-ink-70">{L('مفيش مواسم لسه. دوس "موسم جديد".', 'No seasons yet.')}</CardBody></Card>
      ) : null}

      {(q.data ?? []).map((p) => {
        const s = status(p);
        return (
          <Card key={p.id}>
            <CardBody className="space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-bold text-espresso">{isAr ? p.name_ar : (p.name_en || p.name_ar)}</p>
                  <p className="text-sm text-ink-70">{fmt(p.start_date)} ← {fmt(p.end_date)}</p>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${s.c}`}>{s.t}</span>
              </div>
              <p className="text-sm text-ink-70">
                {L('شغل من', 'Hours')} {hm(p.open_time)} {L('لحد', 'to')} {hm(p.close_time)}
                {(p.breaks ?? []).length ? ` · ${L('استراحات', 'breaks')}: ${(p.breaks ?? []).map((b) => `${hm(b.start)}-${hm(b.end)}`).join('، ')}` : ''}
              </p>
              <div className="flex gap-2 pt-1">
                <Button size="sm" onClick={() => openForm(p)}><Pencil className="size-4" /> {L('تعديل', 'Edit')}</Button>
                <Button size="sm" variant="ghost" onClick={() => setDelId(p.id)}><Trash2 className="size-4 text-danger" /> {L('مسح', 'Delete')}</Button>
              </div>
            </CardBody>
          </Card>
        );
      })}

      <ConfirmDialog
        open={!!delId}
        title={L('مسح الموسم؟', 'Delete season?')}
        message={L('الأيام دي هترجع لمواعيد المحل العادية.', 'These days go back to normal hours.')}
        loading={del.isPending}
        onConfirm={() => delId && del.mutate(delId)}
        onCancel={() => setDelId(null)}
      />
    </div>
  );
}
