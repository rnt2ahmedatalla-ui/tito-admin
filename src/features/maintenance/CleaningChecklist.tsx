import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, SprayCan, Trash2, Wrench } from 'lucide-react';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import { untypedDb } from '@/features/payments/useFinanceBoxes';
import { cairoDateString } from '@/lib/time';
import { cn } from '@/lib/cn';

type Freq = 'daily' | 'weekly' | 'monthly';
type Task = { id: string; name: string; freq: Freq; sort: number; is_active: boolean };
type Log = { id: string; task_id: string; done_on: string };
type Asset = { id: string; name: string; next_service_date: string | null; is_active: boolean };

function shift(ymd: string, days: number) {
  const [y = 2026, m = 1, d = 1] = ymd.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
}

/** تنظيف المحل (يومي/أسبوعي/شهري) + أقرب صيانة للأجهزة */
export function CleaningChecklist() {
  const { i18n } = useTranslation();
  const isAr = !!i18n.language?.startsWith('ar');
  const L = (ar: string, en: string) => (isAr ? ar : en);
  const qc = useQueryClient();
  const today = cairoDateString(new Date());
  const weekFrom = shift(today, -6);
  const monthFrom = `${today.slice(0, 7)}-01`;
  const [tab, setTab] = useState<Freq>('daily');
  const [newName, setNewName] = useState('');

  const q = useQuery({
    queryKey: ['cleaning'],
    retry: false,
    queryFn: async () => {
      const [t, l, a] = await Promise.all([
        untypedDb.from('fin_cleaning_tasks').select('*').order('sort'),
        untypedDb.from('fin_cleaning_log').select('id, task_id, done_on').gte('done_on', monthFrom),
        untypedDb.from('fin_assets').select('id, name, next_service_date, is_active').order('next_service_date'),
      ]);
      if (t.error) throw t.error;
      return { tasks: (t.data ?? []) as Task[], logs: (l.data ?? []) as Log[], assets: ((a.data ?? []) as Asset[]).filter((x) => x.is_active && x.next_service_date) };
    },
  });

  const doneFor = (task: Task): Log | undefined => {
    const from = task.freq === 'daily' ? today : task.freq === 'weekly' ? weekFrom : monthFrom;
    return (q.data?.logs ?? []).find((x) => x.task_id === task.id && x.done_on >= from);
  };

  const toggle = useMutation({
    mutationFn: async (task: Task) => {
      const ex = doneFor(task);
      if (ex) {
        const { error } = await untypedDb.from('fin_cleaning_log').delete().eq('task_id', task.id).gte('done_on', task.freq === 'daily' ? today : task.freq === 'weekly' ? weekFrom : monthFrom);
        if (error) throw error;
      } else {
        const { error } = await untypedDb.from('fin_cleaning_log').insert({ task_id: task.id, done_on: today });
        if (error) throw error;
      }
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['cleaning'] }),
    onError: () => toast.error(L('حصل خطأ', 'Error')),
  });
  const add = useMutation({
    mutationFn: async () => {
      if (!newName.trim()) throw new Error('x');
      const { error } = await untypedDb.from('fin_cleaning_tasks').insert({ name: newName.trim(), freq: tab, sort: (q.data?.tasks.length ?? 0) + 1 });
      if (error) throw error;
    },
    onSuccess: () => { setNewName(''); void qc.invalidateQueries({ queryKey: ['cleaning'] }); },
    onError: () => toast.error(L('اكتب اسم المهمة', 'Enter a task name')),
  });
  const del = useMutation({
    mutationFn: async (id: string) => { const { error } = await untypedDb.from('fin_cleaning_tasks').delete().eq('id', id); if (error) throw error; },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['cleaning'] }),
  });

  if (q.isLoading) return <Skeleton className="h-48" />;
  if (q.isError) return <p className="rounded-btn bg-sand/50 p-3 text-sm">{L('شغّل ملف features-v48.sql في Supabase عشان تظهر قايمة التنظيف.', 'Run features-v48.sql in Supabase to enable the cleaning list.')}</p>;

  const tasks = (q.data?.tasks ?? []).filter((x) => x.is_active && x.freq === tab);
  const doneN = tasks.filter((x) => doneFor(x)).length;
  const soon = shift(today, 14);
  const due = (q.data?.assets ?? []).filter((a) => (a.next_service_date ?? '') <= soon).slice(0, 8);
  const tabs: Array<[Freq, string]> = [['daily', L('يومي', 'Daily')], ['weekly', L('أسبوعي', 'Weekly')], ['monthly', L('شهري', 'Monthly')]];

  return (
    <>
      <Card>
        <CardHeader><h2 className="flex items-center gap-2 font-semibold"><SprayCan className="size-4 text-gold" aria-hidden />{L('تنظيف المحل', 'Shop cleaning')}</h2></CardHeader>
        <CardBody className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex gap-2">
              {tabs.map(([id, label]) => (
                <button key={id} type="button" onClick={() => setTab(id)} className={cn('min-h-9 rounded-full border px-4 text-sm font-medium', tab === id ? 'border-gold bg-gold text-espresso' : 'border-default bg-white text-ink-70 hover:bg-sand')}>{label}</button>
              ))}
            </div>
            <span className="font-latin text-sm text-ink-70">{doneN}/{tasks.length}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-sand/70"><div className="h-full rounded-full bg-success transition-all" style={{ width: `${tasks.length ? (doneN / tasks.length) * 100 : 0}%` }} /></div>
          <ul className="divide-y divide-default rounded-card border border-default bg-white">
            {tasks.map((task) => {
              const done = !!doneFor(task);
              return (
                <li key={task.id} className="flex items-center gap-3 px-3 py-2.5">
                  <input type="checkbox" className="size-5 shrink-0 accent-gold" checked={done} onChange={() => toggle.mutate(task)} aria-label={task.name} />
                  <span className={cn('min-w-0 flex-1 text-sm', done && 'text-ink-70 line-through')}>{task.name}</span>
                  <button type="button" onClick={() => del.mutate(task.id)} aria-label={L('مسح', 'Delete')} className="shrink-0 rounded p-1 text-ink-70 hover:text-danger"><Trash2 className="size-4" /></button>
                </li>
              );
            })}
          </ul>
          <div className="flex items-end gap-2">
            <div className="min-w-0 flex-1"><Input label={L('إضافة مهمة', 'Add a task')} value={newName} onChange={(e) => setNewName(e.target.value)} /></div>
            <Button variant="secondary" loading={add.isPending} onClick={() => add.mutate()}><Plus className="size-4" aria-hidden />{L('إضافة', 'Add')}</Button>
          </div>
          <p className="text-xs text-ink-70">{L('اليومي بيتصفّر كل يوم، والأسبوعي كل 7 أيام، والشهري أول كل شهر.', 'Daily resets every day, weekly every 7 days, monthly each month.')}</p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader><h2 className="flex items-center gap-2 font-semibold"><Wrench className="size-4 text-gold" aria-hidden />{L('صيانة الأجهزة القريبة', 'Upcoming equipment service')}</h2></CardHeader>
        <CardBody className="space-y-2">
          {due.length === 0 ? <p className="text-sm text-ink-70">{L('مفيش صيانة مستحقة في الأسبوعين الجايين ✅', 'Nothing due in the next two weeks ✅')}</p> : (
            <ul className="divide-y divide-default rounded-card border border-default bg-white">
              {due.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                  <span className="min-w-0 flex-1 truncate">{a.name}</span>
                  <span className={cn('shrink-0 font-latin text-xs', (a.next_service_date ?? '') <= today ? 'font-bold text-danger' : 'text-ink-70')}>{a.next_service_date}</span>
                </li>
              ))}
            </ul>
          )}
          <Link to="/more/finance?tab=assets" className="inline-flex min-h-9 items-center rounded-btn bg-gold px-3 text-sm font-semibold text-espresso">{L('كل الأجهزة والمواعيد', 'All equipment & schedules')}</Link>
        </CardBody>
      </Card>
    </>
  );
}
