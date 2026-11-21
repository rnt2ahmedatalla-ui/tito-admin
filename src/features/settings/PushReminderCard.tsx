import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { supabase } from '@/lib/supabase';
import { untypedDb } from '@/features/payments/useFinanceBoxes';
import { mapError } from '@/lib/errors';
import { cn } from '@/lib/cn';

const DEFAULTS = {
  title_ar: 'تذكير بمعادك',
  body_ar: 'معادك الساعة {time} في {shop} ({service}). مستنينك!',
  title_en: 'Appointment reminder',
  body_en: 'Your appointment is at {time} at {shop} ({service}). See you!',
};
type Key = keyof typeof DEFAULTS;
const KEYS = Object.keys(DEFAULTS) as Key[];
const HOURS = [1, 2, 3, 6, 12, 24];
const PLACEHOLDERS = ['{name}', '{time}', '{date}', '{service}', '{shop}'];

export function PushReminderCard() {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language?.startsWith('ar');
  const L = (ar: string, en: string) => (isAr ? ar : en);
  const qc = useQueryClient();
  const [hours, setHours] = useState(2);
  const [tpl, setTpl] = useState<Record<Key, string>>(DEFAULTS);
  const [focus, setFocus] = useState<Key>('body_ar');

  const q = useQuery({
    queryKey: ['push-reminder-cfg'],
    queryFn: async () => {
      const { data: st } = await supabase.from('settings').select('reminder_minutes_before').eq('id', 1).maybeSingle();
      const { data: cfg, error } = await untypedDb.from('push_config').select('key, value').in('key', KEYS);
      if (error) throw error;
      const t: Record<Key, string> = { ...DEFAULTS };
      for (const r of (cfg ?? []) as { key: Key; value: string }[]) if (r.key in t) t[r.key] = r.value;
      return { mins: Number((st as { reminder_minutes_before?: number } | null)?.reminder_minutes_before ?? 120), t };
    },
  });
  useEffect(() => {
    if (q.data) {
      setHours(Math.round((q.data.mins / 60) * 100) / 100);
      setTpl(q.data.t);
    }
  }, [q.data]);

  const save = useMutation({
    mutationFn: async () => {
      const mins = Math.round(Number(hours) * 60);
      if (!Number.isFinite(mins) || mins < 5 || mins > 10080) throw new Error(L('عدد الساعات غير صحيح', 'Invalid hours'));
      const { error: e1 } = await supabase.from('settings').update({ reminder_minutes_before: mins }).eq('id', 1);
      if (e1) throw e1;
      const rows = KEYS.map((k) => ({ key: k, value: (tpl[k] || '').trim() || DEFAULTS[k] }));
      const { error: e2 } = await untypedDb.from('push_config').upsert(rows);
      if (e2) throw e2;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['push-reminder-cfg'] });
      void qc.invalidateQueries({ queryKey: ['settings'] });
      toast.success(L('تم الحفظ', 'Saved'));
    },
    onError: (e) => toast.error(e instanceof Error && e.message.startsWith(L('عدد', 'Invalid')) ? e.message : mapError(e, t)),
  });

  const insert = (ph: string) => setTpl((p) => ({ ...p, [focus]: `${p[focus]}${p[focus] && !p[focus].endsWith(' ') ? ' ' : ''}${ph}` }));
  const sample = { name: L('أحمد', 'Ahmed'), time: L('٥:٣٠ م', '5:30 PM'), date: L('السبت ٢٢ نوفمبر', 'Saturday, November 22'), service: L('حلاقة + دقن', 'Haircut + Beard'), shop: 'tito' };
  const preview = (s: string) => s.replace(/\{(\w+)\}/g, (m, k: string) => (sample as Record<string, string>)[k] ?? m);
  const pt = isAr ? tpl.title_ar : tpl.title_en;
  const pb = isAr ? tpl.body_ar : tpl.body_en;

  if (q.isLoading) return <Skeleton className="h-64" />;
  return (
    <Card>
      <CardHeader>
        <h2 className="flex items-center gap-2 font-semibold"><Bell className="size-4 text-gold" aria-hidden />{L('إشعار تذكير العميل (مجاني)', 'Customer reminder notification (free)')}</h2>
        <p className="mt-1 text-sm text-ink-70">{L('بيوصل لموبايل العميل لو فعّل الإشعارات من الموقع.', 'Delivered to customers who enabled notifications on the site.')}</p>
      </CardHeader>
      <CardBody className="grid gap-4">
        {q.isError ? <p className="rounded-btn bg-sand/50 p-3 text-sm">{L('شغّل ملف features-v47.sql في Supabase الأول.', 'Run features-v47.sql in Supabase first.')}</p> : null}
        <div>
          <p className="mb-2 text-sm font-medium text-ink-70">{L('يتبعت قبل المعاد بـ', 'Send before the appointment by')}</p>
          <div className="flex flex-wrap items-center gap-2">
            {HOURS.map((h) => (
              <button key={h} type="button" onClick={() => setHours(h)}
                className={cn('min-h-9 rounded-full border px-3 text-sm font-medium', Number(hours) === h ? 'border-gold bg-gold text-espresso' : 'border-default bg-white text-ink-70 hover:bg-sand')}>
                {h} {L('ساعة', h === 1 ? 'hour' : 'hours')}
              </button>
            ))}
            <div className="w-28">
              <Input type="number" min={0.1} step="0.5" aria-label={L('ساعات مخصصة', 'Custom hours')} value={String(hours)} onChange={(e) => setHours(e.target.value as unknown as number)} />
            </div>
          </div>
          <p className="mt-1.5 text-xs text-ink-70">{L('ملحوظة: في صفحة اليوم بيظهر شريط فيه الحجوزات القريبة عشان تبعتلهم تذكير واتساب بإيدك بضغطة. الشريط ده بيظهر قبل المعاد بنفس عدد الساعات اللي اخترتها هنا، فمش محتاج تضبط حاجة تانية.', 'Note: the Today page shows a bar with upcoming bookings so you can send a WhatsApp reminder in one tap. It appears the same number of hours before the appointment as chosen here, so nothing else to set.')}</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {(['title_ar', 'body_ar', 'title_en', 'body_en'] as Key[]).map((k) => (
            <label key={k} className={cn('flex flex-col gap-1.5', k.startsWith('body') ? '' : '')}>
              <span className="text-sm font-medium text-ink-70">
                {k.startsWith('title') ? L('العنوان', 'Title') : L('النص', 'Message')} ({k.endsWith('_ar') ? L('عربي', 'Arabic') : L('إنجليزي', 'English')})
              </span>
              <textarea rows={k.startsWith('title') ? 1 : 3} maxLength={k.startsWith('title') ? 60 : 160}
                dir={k.endsWith('_ar') ? 'rtl' : 'ltr'} value={tpl[k]} onFocus={() => setFocus(k)}
                onChange={(e) => setTpl((p) => ({ ...p, [k]: e.target.value }))}
                className="w-full rounded-btn border border-bark/20 bg-white px-3 py-2 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold" />
            </label>
          ))}
        </div>

        <div>
          <p className="mb-1.5 text-xs text-ink-70">{L('دوس لإضافة بيانات تلقائية في المكان اللي واقف فيه:', 'Tap to insert auto-filled data at the selected box:')}</p>
          <div className="flex flex-wrap gap-1.5">
            {PLACEHOLDERS.map((p) => (
              <button key={p} type="button" onClick={() => insert(p)} className="rounded-full border border-default bg-white px-2.5 py-1 font-latin text-xs hover:bg-sand">{p}</button>
            ))}
          </div>
        </div>

        <div className="rounded-card border border-default bg-sand/40 p-3">
          <p className="mb-1.5 text-xs text-ink-70">{L('شكلها عند العميل', 'Preview')}</p>
          <div className="flex items-start gap-3 rounded-btn bg-white p-3 shadow-sm">
            <img src={`${import.meta.env.BASE_URL}tito-icon-192.png`} alt="" className="size-10 shrink-0 rounded-btn object-cover" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-espresso">{preview(pt)}</p>
              <p className="text-sm text-ink-70">{preview(pb)}</p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="primary" onClick={() => save.mutate()} loading={save.isPending}>{L('حفظ', 'Save')}</Button>
          <Button variant="secondary" onClick={() => setTpl(DEFAULTS)}>{L('رجوع للنص الأصلي', 'Reset text')}</Button>
        </div>
      </CardBody>
    </Card>
  );
}
