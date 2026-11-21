import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Bell, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { supabase } from '@/lib/supabase';
import { untypedDb } from '@/features/payments/useFinanceBoxes';
import { cn } from '@/lib/cn';

type Field = 'title_ar' | 'body_ar' | 'title_en' | 'body_en';
type Row = { key: string; id?: string; value: string; unit: 'h' | 'm'; is_active: boolean } & Record<Field, string>;

const NEW_ROW = (): Row => ({
  key: `n${Date.now()}${Math.random().toString(36).slice(2, 5)}`,
  value: '2', unit: 'h', is_active: true,
  title_ar: 'تذكير بمعادك', body_ar: 'معادك الساعة {time} في {shop} مع {barber}. مستنينك!',
  title_en: 'Appointment reminder', body_en: 'Your appointment is at {time} at {shop} with {barber}. See you!',
});
const PLACEHOLDERS: Array<[string, string, string]> = [
  ['{name}', 'اسم العميل', 'Customer'], ['{barber}', 'اسم الحلاق', 'Barber'], ['{time}', 'الساعة', 'Time'],
  ['{date}', 'اليوم', 'Date'], ['{service}', 'الخدمة', 'Service'], ['{shop}', 'اسم المحل', 'Shop'],
];
const WA_HOURS = [1, 2, 3, 6, 12, 24];

const toMinutes = (r: Row) => Math.round(Number(r.value) * (r.unit === 'h' ? 60 : 1));

export function PushReminderCard() {
  const { i18n } = useTranslation();
  const isAr = !!i18n.language?.startsWith('ar');
  const L = (ar: string, en: string) => (isAr ? ar : en);
  const qc = useQueryClient();
  const [rows, setRows] = useState<Row[]>([]);
  const [waMins, setWaMins] = useState(120);
  const [loaded, setLoaded] = useState(false);
  const orig = useRef<string[]>([]);
  const focus = useRef<{ key: string; field: Field } | null>(null);
  const refs = useRef<Record<string, HTMLTextAreaElement | null>>({});

  const q = useQuery({
    queryKey: ['push-reminders-cfg'],
    retry: false,
    queryFn: async () => {
      const [r, st] = await Promise.all([
        untypedDb.from('push_reminders').select('*').order('minutes_before', { ascending: false }),
        supabase.from('settings').select('reminder_minutes_before').eq('id', 1).maybeSingle(),
      ]);
      if (r.error) throw r.error;
      return { list: (r.data ?? []) as Array<Record<string, unknown>>, wa: Number((st.data as { reminder_minutes_before?: number } | null)?.reminder_minutes_before ?? 120) };
    },
  });
  useEffect(() => {
    if (!q.data) return;
    orig.current = q.data.list.map((x) => String(x.id));
    setRows(q.data.list.map((x) => {
      const m = Number(x.minutes_before);
      const hrs = m % 60 === 0;
      return {
        key: String(x.id), id: String(x.id), value: String(hrs ? m / 60 : m), unit: hrs ? 'h' : 'm', is_active: !!x.is_active,
        title_ar: String(x.title_ar ?? ''), body_ar: String(x.body_ar ?? ''), title_en: String(x.title_en ?? ''), body_en: String(x.body_en ?? ''),
      } as Row;
    }));
    setWaMins(q.data.wa);
    setLoaded(true);
  }, [q.data]);

  const patch = (key: string, p: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...p } : r)));
  const insert = (ph: string) => {
    const f = focus.current;
    if (!f) { toast.message(L('دوس جوه النص الأول مكان ما عايز تضيف', 'Tap inside a text box first')); return; }
    const el = refs.current[`${f.key}:${f.field}`];
    const cur = rows.find((r) => r.key === f.key)?.[f.field] ?? '';
    const a = el?.selectionStart ?? cur.length;
    const b = el?.selectionEnd ?? cur.length;
    patch(f.key, { [f.field]: cur.slice(0, a) + ph + cur.slice(b) } as Partial<Row>);
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(a + ph.length, a + ph.length); });
  };

  const save = useMutation({
    mutationFn: async () => {
      for (const r of rows) {
        const m = toMinutes(r);
        if (!Number.isFinite(m) || m < 5 || m > 10080) throw new Error(L('وقت التذكير لازم يكون بين 5 دقايق و7 أيام', 'Reminder time must be 5 minutes to 7 days'));
        if (!r.title_ar.trim() || !r.body_ar.trim() || !r.title_en.trim() || !r.body_en.trim()) throw new Error(L('املأ العنوان والنص بالعربي والإنجليزي', 'Fill title and message in Arabic and English'));
      }
      const removed = orig.current.filter((id) => !rows.some((r) => r.id === id));
      if (removed.length) { const { error } = await untypedDb.from('push_reminders').delete().in('id', removed); if (error) throw error; }
      for (const r of rows) {
        const row = { minutes_before: toMinutes(r), title_ar: r.title_ar.trim(), body_ar: r.body_ar.trim(), title_en: r.title_en.trim(), body_en: r.body_en.trim(), is_active: r.is_active };
        const res = r.id ? await untypedDb.from('push_reminders').update(row).eq('id', r.id) : await untypedDb.from('push_reminders').insert(row);
        if (res.error) throw res.error;
      }
      const { error: e2 } = await supabase.from('settings').update({ reminder_minutes_before: waMins }).eq('id', 1);
      if (e2) throw e2;
    },
    onSuccess: () => { toast.success(L('تم الحفظ', 'Saved')); void qc.invalidateQueries({ queryKey: ['push-reminders-cfg'] }); void qc.invalidateQueries({ queryKey: ['settings'] }); },
    onError: (e) => toast.error(e instanceof Error && e.message ? e.message : L('حصل خطأ', 'Error')),
  });

  const sample = { name: L('أحمد', 'Ahmed'), barber: L('محمد', 'Mohamed'), time: L('٥:٣٠ م', '5:30 PM'), date: L('السبت ٢٢ نوفمبر', 'Saturday, November 22'), service: L('حلاقة + دقن', 'Haircut + Beard'), shop: 'tito' };
  const preview = (s: string) => s.replace(/\{(\w+)\}/g, (m, k: string) => (sample as Record<string, string>)[k] ?? m);

  if (q.isLoading) return <Skeleton className="h-64" />;
  if (q.isError) return <p className="rounded-btn bg-sand/50 p-3 text-sm">{L('شغّل ملف features-v49.sql في Supabase الأول.', 'Run features-v49.sql in Supabase first.')}</p>;

  const field = (r: Row, f: Field, label: string, rtl: boolean, rowsN: number) => (
    <label key={f} className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-ink-70">{label}</span>
      <textarea
        ref={(el) => { refs.current[`${r.key}:${f}`] = el; }}
        rows={rowsN} maxLength={f.startsWith('title') ? 60 : 180} dir={rtl ? 'rtl' : 'ltr'} value={r[f]}
        onFocus={() => { focus.current = { key: r.key, field: f }; }}
        onChange={(e) => patch(r.key, { [f]: e.target.value } as Partial<Row>)}
        className="w-full rounded-btn border border-bark/20 bg-white px-3 py-2 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
      />
    </label>
  );

  return (
    <Card>
      <CardHeader>
        <h2 className="flex items-center gap-2 font-semibold"><Bell className="size-4 text-gold" aria-hidden />{L('تذكيرات العميل على موبايله (مجانية)', 'Customer phone reminders (free)')}</h2>
        <p className="mt-1 text-sm text-ink-70">{L('أنت اللي بتحدد كام تذكير يوصل للعميل، ووقت كل واحد، ونصه. بيوصل لو العميل فعّل الإشعارات من الموقع.', 'You decide how many reminders each customer gets, when, and what they say. Delivered to customers who enabled notifications.')}</p>
      </CardHeader>
      <CardBody className="space-y-4">
        {!loaded ? null : rows.length === 0 ? <p className="text-sm text-ink-70">{L('مفيش تذكيرات. دوس "إضافة تذكير".', 'No reminders yet. Tap "Add reminder".')}</p> : null}

        {rows.map((r, i) => (
          <div key={r.key} className={cn('space-y-3 rounded-card border p-3', r.is_active ? 'border-default bg-white' : 'border-default bg-sand/40 opacity-80')}>
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div className="flex items-end gap-2">
                <span className="mb-2 rounded-pill bg-gold/20 px-2.5 py-0.5 text-xs font-bold text-espresso">{L(`تذكير ${i + 1}`, `Reminder ${i + 1}`)}</span>
                <div className="w-24"><Input label={L('قبل المعاد بـ', 'Before by')} type="number" min={1} step="any" inputMode="decimal" value={r.value} onChange={(e) => patch(r.key, { value: e.target.value })} /></div>
                <div className="flex overflow-hidden rounded-btn border border-bark/20" dir="ltr">
                  {(['h', 'm'] as const).map((u) => (
                    <button key={u} type="button" onClick={() => patch(r.key, { unit: u })} className={cn('min-h-11 px-3 text-sm font-medium', r.unit === u ? 'bg-gold text-espresso' : 'bg-white text-ink-70')}>
                      {u === 'h' ? L('ساعة', 'hours') : L('دقيقة', 'min')}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <label className="flex cursor-pointer items-center gap-2 text-sm"><input type="checkbox" className="size-5 accent-gold" checked={r.is_active} onChange={(e) => patch(r.key, { is_active: e.target.checked })} />{L('شغّال', 'Active')}</label>
                <button type="button" aria-label={L('مسح', 'Delete')} onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))} className="rounded p-2 text-ink-70 hover:text-danger"><Trash2 className="size-4" /></button>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {field(r, 'title_ar', L('العنوان (عربي)', 'Title (Arabic)'), true, 1)}
              {field(r, 'title_en', L('العنوان (إنجليزي)', 'Title (English)'), false, 1)}
              {field(r, 'body_ar', L('الرسالة (عربي)', 'Message (Arabic)'), true, 3)}
              {field(r, 'body_en', L('الرسالة (إنجليزي)', 'Message (English)'), false, 3)}
            </div>
            <div className="flex items-start gap-3 rounded-btn bg-sand/40 p-2.5">
              <img src={`${import.meta.env.BASE_URL}tito-icon-192.png`} alt="" className="size-9 shrink-0 rounded-full object-cover" />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-espresso">{preview(isAr ? r.title_ar : r.title_en)}</p>
                <p className="text-sm text-ink-70">{preview(isAr ? r.body_ar : r.body_en)}</p>
              </div>
            </div>
          </div>
        ))}

        <div>
          <p className="mb-1.5 text-xs text-ink-70">{L('دوس لإضافة بيانات تلقائية مكان المؤشر في أي نص:', 'Tap to insert auto-filled data at the cursor of the selected text:')}</p>
          <div className="flex flex-wrap gap-1.5">
            {PLACEHOLDERS.map(([ph, ar, en]) => (
              <button key={ph} type="button" onClick={() => insert(ph)} className="inline-flex items-center gap-1.5 rounded-full border border-default bg-white px-2.5 py-1 text-xs hover:bg-sand">
                <span className="font-latin">{ph}</span><span className="text-ink-70">{isAr ? ar : en}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setRows((rs) => [...rs, NEW_ROW()])}><Plus className="size-4" aria-hidden />{L('إضافة تذكير', 'Add reminder')}</Button>
        </div>

        <div className="rounded-btn border border-default p-3">
          <p className="mb-2 text-sm font-medium text-ink-70">{L('شريط تذكير الواتساب في صفحة اليوم بيظهر قبل المعاد بـ', 'The WhatsApp reminder bar on Today shows up before the appointment by')}</p>
          <div className="flex flex-wrap gap-2">
            {WA_HOURS.map((h) => (
              <button key={h} type="button" onClick={() => setWaMins(h * 60)} className={cn('min-h-9 rounded-full border px-3 text-sm font-medium', waMins === h * 60 ? 'border-gold bg-gold text-espresso' : 'border-default bg-white text-ink-70 hover:bg-sand')}>
                {h} {L('ساعة', h === 1 ? 'hour' : 'hours')}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-ink-70">{L('الشريط ده بتبعت منه واتساب بإيدك بضغطة. منفصل عن إشعارات الموبايل اللي فوق.', 'This bar lets you send a WhatsApp reminder yourself in one tap. It is separate from the phone notifications above.')}</p>
        </div>

        <Button variant="primary" loading={save.isPending} onClick={() => save.mutate()}>{L('حفظ كل التذكيرات', 'Save all reminders')}</Button>
      </CardBody>
    </Card>
  );
}
