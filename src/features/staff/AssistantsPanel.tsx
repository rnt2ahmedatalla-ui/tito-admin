import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { untypedDb } from '@/features/payments/useFinanceBoxes';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardBody } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { mapError } from '@/lib/errors';

type Assistant = { id: string; name: string; phone: string | null; job: string; monthly_salary: number; start_date: string | null; notes: string | null; is_active: boolean };
type Pay = { id: string; assistant_id: string; pay_date: string; kind: 'salary' | 'advance' | 'bonus' | 'deduction'; amount: number; note: string | null };

const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' });
const egp = (n: number) => `${Math.round(n).toLocaleString('en-US')} ج`;
const EMPTY = { name: '', phone: '', job: 'مساعد', monthly_salary: '', start_date: '', notes: '', is_active: true };

export function AssistantsPanel() {
  const { i18n } = useTranslation();
  const isAr = !!i18n.language?.startsWith('ar');
  const L = (ar: string, en: string) => (isAr ? ar : en);
  const qc = useQueryClient();
  const [month, setMonth] = useState(today().slice(0, 7));
  const [form, setForm] = useState<(typeof EMPTY & { id?: string }) | null>(null);
  const [payFor, setPayFor] = useState<{ a: Assistant; kind: Pay['kind'] } | null>(null);
  const [payForm, setPayForm] = useState({ amount: '', note: '', date: today() });
  const [del, setDel] = useState<Assistant | null>(null);
  const [delPay, setDelPay] = useState<string | null>(null);

  const kindLabel: Record<Pay['kind'], string> = {
    salary: L('مرتب', 'Salary'), advance: L('سلفة', 'Advance'), bonus: L('مكافأة', 'Bonus'), deduction: L('خصم', 'Deduction'),
  };

  const list = useQuery({
    queryKey: ['assistants'],
    queryFn: async () => {
      const { data, error } = await untypedDb.from('assistants').select('*').order('sort').order('created_at');
      if (error) throw error;
      return (data ?? []) as Assistant[];
    },
    retry: false,
  });
  const [y, m] = month.split('-').map(Number) as [number, number];
  const from = `${month}-01`;
  const to = new Date(y, m, 1).toLocaleDateString('en-CA');
  const pays = useQuery({
    queryKey: ['assistant-pay', month],
    queryFn: async () => {
      const { data, error } = await untypedDb.from('assistant_pay').select('*').gte('pay_date', from).lt('pay_date', to).order('pay_date', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Pay[];
    },
    retry: false,
  });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['assistants'] });
    void qc.invalidateQueries({ queryKey: ['assistant-pay'] });
  };

  const saveA = useMutation({
    mutationFn: async () => {
      if (!form || !form.name.trim()) throw new Error(L('اكتب الاسم', 'Enter a name'));
      const row = {
        name: form.name.trim(), phone: form.phone.trim() || null, job: form.job.trim() || 'مساعد',
        monthly_salary: Number(form.monthly_salary) || 0, start_date: form.start_date || null,
        notes: form.notes.trim() || null, is_active: form.is_active,
      };
      const r = form.id ? await untypedDb.from('assistants').update(row).eq('id', form.id) : await untypedDb.from('assistants').insert(row);
      if (r.error) throw r.error;
    },
    onSuccess: () => { toast.success(L('اتحفظ ✓', 'Saved ✓')); setForm(null); refresh(); },
    onError: (e) => toast.error(mapError(e)),
  });
  const delA = useMutation({
    mutationFn: async (id: string) => { const { error } = await untypedDb.from('assistants').delete().eq('id', id); if (error) throw error; },
    onSuccess: () => { setDel(null); refresh(); },
    onError: (e) => toast.error(mapError(e)),
  });
  const addPay = useMutation({
    mutationFn: async () => {
      if (!payFor) return;
      const amount = Number(payForm.amount);
      if (!(amount > 0)) throw new Error(L('اكتب مبلغ صحيح', 'Enter a valid amount'));
      const { error } = await untypedDb.from('assistant_pay').insert({
        assistant_id: payFor.a.id, kind: payFor.kind, amount, note: payForm.note.trim() || null, pay_date: payForm.date || today(),
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success(L('اتسجل ✓', 'Recorded ✓')); setPayFor(null); refresh(); },
    onError: (e) => toast.error(mapError(e)),
  });
  const delP = useMutation({
    mutationFn: async (id: string) => { const { error } = await untypedDb.from('assistant_pay').delete().eq('id', id); if (error) throw error; },
    onSuccess: () => { setDelPay(null); refresh(); },
    onError: (e) => toast.error(mapError(e)),
  });

  const shiftMonth = (d: number) => setMonth(new Date(y, m - 1 + d, 1).toLocaleDateString('en-CA').slice(0, 7));
  const monthLabel = new Date(y, m - 1, 1).toLocaleDateString(isAr ? 'ar-EG' : 'en-GB', { month: 'long', year: 'numeric' });

  const startPay = (a: Assistant, kind: Pay['kind'], suggested?: number) => {
    setPayFor({ a, kind });
    setPayForm({ amount: suggested && suggested > 0 ? String(Math.round(suggested)) : '', note: '', date: today() });
  };

  if (list.isError) {
    return <Card><CardBody className="text-sm text-danger">{L('شغّل ملف features-v45.sql في Supabase الأول.', 'Run features-v45.sql in Supabase first.')}</CardBody></Card>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-ink-70">
          {L('المساعدين مالهمش حسابات ولا بيظهروا للعملاء. القسم ده لحساب مرتباتهم وسلفهم بس.', 'Assistants have no accounts and are hidden from customers. This is for tracking their pay.')}
        </p>
        <Button variant="primary" onClick={() => setForm({ ...EMPTY })}><Plus className="size-4" /> {L('إضافة', 'Add')}</Button>
      </div>

      <div className="flex items-center justify-between rounded-card border border-default bg-white p-2">
        <Button variant="ghost" size="sm" onClick={() => shiftMonth(isAr ? 1 : -1)} aria-label="prev"><ChevronRight className="size-4" /></Button>
        <p className="font-semibold text-espresso">{monthLabel}</p>
        <Button variant="ghost" size="sm" onClick={() => shiftMonth(isAr ? -1 : 1)} aria-label="next"><ChevronLeft className="size-4" /></Button>
      </div>

      {form ? (
        <Card><CardBody className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input label={L('الاسم', 'Name')} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <Input label={L('الوظيفة', 'Role')} value={form.job} onChange={(e) => setForm({ ...form, job: e.target.value })} />
            <Input label={L('المرتب الشهري (ج)', 'Monthly salary')} type="number" inputMode="decimal" value={form.monthly_salary} onChange={(e) => setForm({ ...form, monthly_salary: e.target.value })} />
            <Input label={L('رقم التليفون (اختياري)', 'Phone (optional)')} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} dir="ltr" />
            <Input label={L('بدأ الشغل (اختياري)', 'Start date')} type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
            <Input label={L('ملاحظات', 'Notes')} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />{L('شغّال حالياً', 'Currently working')}</label>
          <div className="flex gap-2">
            <Button variant="primary" loading={saveA.isPending} onClick={() => saveA.mutate()}>{L('حفظ', 'Save')}</Button>
            <Button variant="ghost" onClick={() => setForm(null)}>{L('إلغاء', 'Cancel')}</Button>
          </div>
        </CardBody></Card>
      ) : null}

      {list.isLoading || pays.isLoading ? <Skeleton className="h-24" /> : null}
      {!list.isLoading && (list.data ?? []).length === 0 && !form ? (
        <Card><CardBody className="py-8 text-center text-sm text-ink-70">{L('لسه مفيش مساعدين. دوس «إضافة».', 'No assistants yet.')}</CardBody></Card>
      ) : null}

      {(list.data ?? []).map((a) => {
        const mine = (pays.data ?? []).filter((p) => p.assistant_id === a.id);
        const sum = (k: Pay['kind']) => mine.filter((p) => p.kind === k).reduce((s, p) => s + Number(p.amount), 0);
        const salaryPaid = sum('salary'), advance = sum('advance'), bonus = sum('bonus'), ded = sum('deduction');
        const net = Number(a.monthly_salary) + bonus - ded - advance - salaryPaid;
        return (
          <Card key={a.id} className={a.is_active ? '' : 'opacity-60'}>
            <CardBody className="space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-gold/25 text-lg font-bold text-espresso">{a.name.slice(0, 1)}</span>
                  <div className="min-w-0">
                    <p className="truncate font-bold text-espresso">{a.name}</p>
                    <p className="text-xs text-ink-70">{a.job} · {L('المرتب', 'Salary')} {egp(Number(a.monthly_salary))}{a.is_active ? '' : ` · ${L('موقوف', 'Inactive')}`}</p>
                  </div>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button variant="ghost" size="sm" aria-label="edit" onClick={() => setForm({ id: a.id, name: a.name, phone: a.phone ?? '', job: a.job, monthly_salary: String(a.monthly_salary), start_date: a.start_date ?? '', notes: a.notes ?? '', is_active: a.is_active })}><Pencil className="size-4" /></Button>
                  <Button variant="ghost" size="sm" aria-label="delete" onClick={() => setDel(a)}><Trash2 className="size-4 text-danger" /></Button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                {([[L('اتصرف', 'Paid'), salaryPaid], [L('سلف', 'Advances'), advance], [L('مكافآت', 'Bonus'), bonus], [L('خصومات', 'Deductions'), ded]] as Array<[string, number]>).map(([lbl, v]) => (
                  <div key={lbl} className="rounded-btn bg-sand/50 p-2 text-center"><p className="text-xs text-ink-70">{lbl}</p><p className="font-latin font-semibold">{egp(v)}</p></div>
                ))}
              </div>
              <div className={`flex items-center justify-between rounded-btn p-3 ${net > 0 ? 'bg-gold/20' : 'bg-emerald-50'}`}>
                <p className="text-sm font-medium text-espresso">{net > 0 ? L('المتبقي له', 'Still due') : L('خالص', 'Settled')}</p>
                <p className="font-latin text-lg font-bold text-espresso">{egp(Math.max(net, 0))}{net < 0 ? ` (${L('زيادة', 'over')} ${egp(-net)})` : ''}</p>
              </div>

              <div className="flex flex-wrap gap-2">
                {net > 0 ? <Button size="sm" variant="primary" onClick={() => startPay(a, 'salary', net)}>{L('صرف المتبقي', 'Pay due')}</Button> : null}
                <Button size="sm" onClick={() => startPay(a, 'advance')}>{L('+ سلفة', '+ Advance')}</Button>
                <Button size="sm" onClick={() => startPay(a, 'bonus')}>{L('+ مكافأة', '+ Bonus')}</Button>
                <Button size="sm" onClick={() => startPay(a, 'deduction')}>{L('+ خصم', '+ Deduction')}</Button>
              </div>

              {payFor?.a.id === a.id ? (
                <div className="space-y-2 rounded-btn border border-gold/40 bg-cream p-3">
                  <p className="text-sm font-semibold text-espresso">{kindLabel[payFor.kind]} — {a.name}</p>
                  <div className="grid grid-cols-2 gap-2">
                    <Input type="number" inputMode="decimal" label={L('المبلغ', 'Amount')} value={payForm.amount} onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })} />
                    <Input type="date" label={L('التاريخ', 'Date')} value={payForm.date} onChange={(e) => setPayForm({ ...payForm, date: e.target.value })} />
                  </div>
                  <Input label={L('ملاحظة (اختياري)', 'Note')} value={payForm.note} onChange={(e) => setPayForm({ ...payForm, note: e.target.value })} />
                  <div className="flex gap-2">
                    <Button variant="primary" size="sm" loading={addPay.isPending} onClick={() => addPay.mutate()}>{L('تسجيل', 'Record')}</Button>
                    <Button variant="ghost" size="sm" onClick={() => setPayFor(null)}>{L('إلغاء', 'Cancel')}</Button>
                  </div>
                </div>
              ) : null}

              {mine.length ? (
                <ul className="divide-y divide-bark/10 text-sm">
                  {mine.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-2 py-1.5">
                      <span className="min-w-0 truncate"><b>{kindLabel[p.kind]}</b> <span className="text-ink-70">{p.pay_date}{p.note ? ` · ${p.note}` : ''}</span></span>
                      <span className="flex shrink-0 items-center gap-1">
                        <span className="font-latin">{egp(Number(p.amount))}</span>
                        <button type="button" aria-label="delete" className="p-1 text-ink-70 hover:text-danger" onClick={() => setDelPay(p.id)}><Trash2 className="size-3.5" /></button>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </CardBody>
          </Card>
        );
      })}

      <ConfirmDialog open={!!del} title={L('مسح المساعد؟', 'Delete assistant?')} message={L('هيتمسح معاه سجل مرتباته كمان.', 'Their pay history is deleted too.')} loading={delA.isPending} onConfirm={() => del && delA.mutate(del.id)} onCancel={() => setDel(null)} />
      <ConfirmDialog open={!!delPay} title={L('مسح العملية؟', 'Delete entry?')} message={L('هتتشال من الحساب.', 'It will be removed from the totals.')} loading={delP.isPending} onConfirm={() => delPay && delP.mutate(delPay)} onCancel={() => setDelPay(null)} />
    </div>
  );
}
