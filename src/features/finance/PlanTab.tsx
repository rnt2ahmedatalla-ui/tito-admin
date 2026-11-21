import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Card, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import { untypedDb } from '@/features/payments/useFinanceBoxes';
import { formatEGP as baseEGP } from '@/lib/money';
import { cn } from '@/lib/cn';
import { fetchIncome, monthBounds, todayCairo, type FinData } from './useFinance';

const egp = (n: number) => `‎${baseEGP(Math.round(n))}`;
const RENT_NAME = 'إيجار المحل';

type Plan = { monthly_goal: number; owner_salary: number; rent_start: string | null; rent_base: number; var_pct: number; barbers_fixed: number };
type RentStep = { id: string; step_start: string; pct: number; amount: number };
type Asst = { monthly_salary: number; is_active: boolean };

const num = (v: unknown) => Number(v ?? 0) || 0;
function addYears(ymd: string, n: number) {
  const [y = 2026, m = 1, d = 1] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y + n, m - 1, d));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}
function prevMonth(ym: string) {
  const [y = 2026, m = 1] = ym.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 2, 1));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** الخطة والأهداف: إيجار بزيادة سنوية + راتبك + هدفك الشهري + نقطة التعادل + تقدمك لحظة بلحظة */
export function PlanTab({ d }: { d: FinData }) {
  const { i18n } = useTranslation();
  const isAr = !!i18n.language?.startsWith('ar');
  const L = (ar: string, en: string) => (isAr ? ar : en);
  const qc = useQueryClient();
  const today = todayCairo();
  const ym = today.slice(0, 7);

  const planQ = useQuery({
    queryKey: ['fin-plan'],
    retry: false,
    queryFn: async () => {
      const [p, s, a] = await Promise.all([
        untypedDb.from('fin_plan').select('*').eq('id', 1).maybeSingle(),
        untypedDb.from('fin_rent_steps').select('*').order('step_start'),
        untypedDb.from('assistants').select('monthly_salary, is_active'),
      ]);
      if (p.error) throw p.error;
      const r = (p.data ?? {}) as Record<string, unknown>;
      const plan: Plan = { monthly_goal: num(r.monthly_goal), owner_salary: num(r.owner_salary), rent_start: (r.rent_start as string | null) ?? null, rent_base: num(r.rent_base), var_pct: r.var_pct == null ? 15 : num(r.var_pct), barbers_fixed: num(r.barbers_fixed) };
      const steps = ((s.data ?? []) as Array<Record<string, unknown>>).map((x) => ({ id: String(x.id), step_start: String(x.step_start), pct: num(x.pct), amount: num(x.amount) })) as RentStep[];
      const asst = ((a.data ?? []) as Asst[]).filter((x) => x.is_active).reduce((t, x) => t + num(x.monthly_salary), 0);
      return { plan, steps, asst };
    },
  });

  const cur = fetchKey(ym);
  const inc = useQuery({ queryKey: ['fin-month', ...cur], queryFn: () => fetchIncome(cur[0], cur[1]), retry: false });
  const pm = prevMonth(ym);
  const prevB = monthBounds(pm);
  const incPrev = useQuery({ queryKey: ['fin-month', prevB.from, prevB.to], queryFn: () => fetchIncome(prevB.from, prevB.to), retry: false });

  const [f, setF] = useState<{ goal: string; owner: string; rentBase: string; rentStart: string; varPct: string; barbers: string } | null>(null);
  const [pct, setPct] = useState('');
  const form = f ?? (planQ.data ? { goal: String(planQ.data.plan.monthly_goal || ''), owner: String(planQ.data.plan.owner_salary || ''), rentBase: String(planQ.data.plan.rent_base || ''), rentStart: planQ.data.plan.rent_start ?? '', varPct: String(planQ.data.plan.var_pct), barbers: String(planQ.data.plan.barbers_fixed || '') } : null);
  const set = (patch: Partial<NonNullable<typeof f>>) => setF({ ...(form as NonNullable<typeof f>), ...patch });

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['fin-plan'] });
    void qc.invalidateQueries({ queryKey: ['fin-data'] });
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!form) return;
      const { error } = await untypedDb.from('fin_plan').upsert({
        id: 1, monthly_goal: num(form.goal), owner_salary: num(form.owner), rent_base: num(form.rentBase), rent_start: form.rentStart || null,
        var_pct: Math.min(80, Math.max(0, num(form.varPct))), barbers_fixed: num(form.barbers), updated_at: new Date().toISOString(),
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success(L('اتحفظت الخطة', 'Plan saved')); setF(null); refresh(); },
    onError: () => toast.error(L('معرفتش أحفظ. اتأكد إنك شغّلت features-v48.sql.', 'Could not save. Make sure features-v48.sql was run.')),
  });

  const steps = planQ.data?.steps ?? [];
  const plan = planQ.data?.plan;
  const rentNow = useMemo(() => {
    if (!plan || !plan.rent_base) return 0;
    const past = steps.filter((s) => s.step_start <= today);
    return past.length ? past[past.length - 1].amount : plan.rent_base;
  }, [plan, steps, today]);
  const lastStepAmount = steps.length ? steps[steps.length - 1].amount : plan?.rent_base ?? 0;
  const nextRaise = plan?.rent_start ? addYears(plan.rent_start, steps.length + 1) : null;
  const raiseDue = !!nextRaise && nextRaise <= today;

  const addStep = useMutation({
    mutationFn: async () => {
      const p = num(pct);
      if (!nextRaise || !(p >= 0)) throw new Error('x');
      const amount = Math.round(lastStepAmount * (1 + p / 100));
      const { error } = await untypedDb.from('fin_rent_steps').insert({ step_start: nextRaise, pct: p, amount });
      if (error) throw error;
    },
    onSuccess: () => { toast.success(L('اتسجّلت زيادة الإيجار', 'Rent increase recorded')); setPct(''); refresh(); },
    onError: () => toast.error(L('اكتب نسبة الزيادة (رقم)', 'Enter the increase % (number)')),
  });

  const syncRent = useMutation({
    mutationFn: async () => {
      if (!(rentNow > 0)) throw new Error('x');
      const cat = d.categories.find((c) => c.name === RENT_NAME);
      const main = d.wallets.find((w) => w.is_main) ?? d.wallets[0];
      const ex = d.recurring.find((r) => r.name === RENT_NAME);
      const day = Math.min(28, Number((plan?.rent_start ?? today).slice(8, 10)) || 1);
      const row = { name: RENT_NAME, kind: 'expense', amount: rentNow, day_of_month: day, start_date: today, category_id: cat?.id ?? null, wallet_id: main?.id ?? null, to_wallet_id: null, is_active: true };
      const r = ex ? await untypedDb.from('fin_recurring').update({ amount: rentNow, is_active: true }).eq('id', ex.id) : await untypedDb.from('fin_recurring').insert(row);
      if (r.error) throw r.error;
    },
    onSuccess: () => { toast.success(L('الإيجار بقى مصروف ثابت شهري تلقائي', 'Rent is now an automatic monthly expense')); refresh(); },
    onError: () => toast.error(L('اكتب إيجار السنة الأولى واحفظ الأول', 'Save the first-year rent first')),
  });

  const setAlloc = useMutation({
    mutationFn: async () => {
      const id = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `a-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
      const alloc = [
        { id: id(), name: L('ادخار', 'Savings'), pct: 15, kind: 'savings' },
        { id: id(), name: L('تطوير المحل', 'Shop development'), pct: 15, kind: 'development' },
        { id: id(), name: L('طوارئ', 'Emergency'), pct: 10, kind: 'other' },
      ];
      const { error } = await untypedDb.from('fin_settings').update({ alloc }).eq('id', 1);
      if (error) throw error;
    },
    onSuccess: () => { toast.success(L('اتملت صناديق مقترحة (تقدر تعدلها من تبويب الميزانية)', 'Suggested boxes filled (edit in Budget tab)')); refresh(); },
    onError: () => toast.error(L('حصل خطأ', 'Error')),
  });

  if (planQ.isLoading) return <Skeleton className="h-64" />;
  if (planQ.isError || !form || !plan) {
    return <p className="rounded-btn bg-sand/50 p-3 text-sm">{L('محتاج تشغّل ملف features-v48.sql في Supabase الأول.', 'Run features-v48.sql in Supabase first.')}</p>;
  }

  // ---------- الحسابات ----------
  const recurringFixed = d.recurring.filter((r) => r.is_active && r.kind === 'expense' && r.name !== RENT_NAME).reduce((t, r) => t + r.amount, 0);
  const asst = planQ.data?.asst ?? 0;
  const owner = num(form.owner);
  const barbers = num(form.barbers);
  const fixedNoOwner = rentNow + recurringFixed + asst + barbers;
  const fixedAll = fixedNoOwner + owner;
  const v = Math.min(80, Math.max(0, num(form.varPct))) / 100;
  const breakEven = fixedAll / (1 - v);
  const goal = num(form.goal);
  const required = (fixedAll + goal) / (1 - v);
  const incomeNow = inc.data?.grand_total ?? 0;
  const cutsNow = inc.data?.bookings_count ?? 0;
  const prevIncome = incPrev.data?.grand_total ?? 0;
  const prevCuts = incPrev.data?.bookings_count ?? 0;
  const avgTicket = cutsNow > 0 ? incomeNow / cutsNow : prevCuts > 0 ? prevIncome / prevCuts : 0;
  const dayOfMonth = Number(today.slice(8, 10));
  const daysInMonth = Number(monthBounds(ym).to.slice(8, 10));
  const projected = dayOfMonth > 0 ? (incomeNow / dayOfMonth) * daysInMonth : 0;
  const profitNow = incomeNow * (1 - v) - fixedAll;
  const profitProjected = projected * (1 - v) - fixedAll;
  const cutsNeeded = avgTicket > 0 ? Math.ceil(required / avgTicket) : null;
  const cutsPerDay = cutsNeeded ? Math.ceil(cutsNeeded / 26) : null;
  const pctDone = required > 0 ? Math.min(100, (incomeNow / required) * 100) : 0;
  const suggestedGoal = Math.round((breakEven * 0.2) / 100) * 100;
  const healthy = profitProjected >= goal && goal > 0;
  const dirty = f !== null;

  const row = (label: string, value: number, hint?: string, strong = false) => (
    <div className="flex items-start justify-between gap-3 py-1.5 text-sm">
      <span className="min-w-0 text-ink-70">{label}{hint ? <span className="block text-[11px]">{hint}</span> : null}</span>
      <span className={cn('shrink-0 font-latin', strong ? 'font-bold text-espresso' : 'font-semibold')}>{egp(value)}</span>
    </div>
  );

  return (
    <div className="space-y-5">
      {/* لوحة التقدم */}
      <section className="space-y-3">
        <h2 className="text-lg font-bold text-espresso">{L('تقدمك الشهر ده', 'This month')}</h2>
        <Card className={cn(goal > 0 ? (healthy ? 'border-success/40 bg-success/10' : 'border-danger/30 bg-danger/5') : '')}>
          <CardBody className="space-y-3 p-4">
            {goal > 0 ? (
              <p className="text-sm font-semibold text-espresso">
                {healthy ? L('ماشي كويس ✅ بالسرعة دي هتحقق هدفك', 'On track ✅ you will hit your goal at this pace') : L('محتاج تزوّد الدخل عشان توصل لهدفك', 'You need more income to reach your goal')}
              </p>
            ) : <p className="text-sm text-ink-70">{L('اكتب هدفك الشهري تحت عشان نتابعه.', 'Enter your monthly goal below to track it.')}</p>}
            <div>
              <div className="flex justify-between text-xs text-ink-70"><span>{L('الدخل لحد دلوقتي', 'Income so far')}: <b className="font-latin text-espresso">{egp(incomeNow)}</b></span><span>{L('المطلوب', 'Needed')}: <b className="font-latin text-espresso">{egp(required)}</b></span></div>
              <div className="mt-1 h-3 overflow-hidden rounded-full bg-sand/70"><div className="h-full rounded-full bg-gold transition-all" style={{ width: `${Math.max(2, pctDone)}%` }} /></div>
            </div>
            <div className="grid grid-cols-2 gap-2.5 text-sm sm:grid-cols-4">
              <Stat label={L('ربح لحد دلوقتي', 'Profit so far')} value={egp(profitNow)} bad={profitNow < 0} />
              <Stat label={L('الربح المتوقع آخر الشهر', 'Projected profit')} value={egp(profitProjected)} bad={profitProjected < 0} />
              <Stat label={L('عدد الحلاقات', 'Cuts so far')} value={String(cutsNow)} />
              <Stat label={L('متوسط الفاتورة', 'Avg ticket')} value={egp(avgTicket)} />
            </div>
            {cutsNeeded ? (
              <p className="text-xs text-ink-70">
                {L(`عشان توصل لهدفك محتاج حوالي ${cutsNeeded} حلاقة في الشهر (تقريباً ${cutsPerDay} في اليوم).`, `To hit your goal you need about ${cutsNeeded} cuts a month (~${cutsPerDay} a day).`)}
              </p>
            ) : null}
            {prevIncome > 0 ? (
              <p className="text-xs text-ink-70">
                {L('الشهر اللي فات:', 'Last month:')} <span className="font-latin">{egp(prevIncome)}</span> · {prevCuts} {L('حلاقة', 'cuts')}
                {' · '}
                <span className={cn('font-latin font-semibold', projected >= prevIncome ? 'text-success' : 'text-danger')}>{projected >= prevIncome ? '▲' : '▼'} {Math.abs(Math.round(((projected - prevIncome) / prevIncome) * 100))}%</span>
                {' '}{L('(المتوقع للشهر ده مقارنة بيه)', '(projected vs it)')}
              </p>
            ) : null}
          </CardBody>
        </Card>
      </section>

      {/* الإعدادات */}
      <section className="space-y-3">
        <h2 className="text-lg font-bold text-espresso">{L('خطتك', 'Your plan')}</h2>
        <Card><CardBody className="grid gap-3 p-4 sm:grid-cols-2">
          <Input label={L('هدفك الشهري: صافي الربح اللي عايزه (بعد راتبك) ج', 'Monthly goal: net profit you want (after your salary)')} type="number" inputMode="decimal" value={form.goal} onChange={(e) => set({ goal: e.target.value })} />
          <Input label={L('راتبك الشهري (ج)', 'Your monthly salary')} type="number" inputMode="decimal" value={form.owner} onChange={(e) => set({ owner: e.target.value })} />
          <Input label={L('مرتبات الحلاقين الثابتة شهرياً (لو فيه) ج', 'Fixed barber pay per month (if any)')} type="number" inputMode="decimal" value={form.barbers} onChange={(e) => set({ barbers: e.target.value })} />
          <Input label={L('نسبة المصروفات المتغيرة من الدخل %', 'Variable costs % of income')} type="number" inputMode="decimal" value={form.varPct} onChange={(e) => set({ varPct: e.target.value })} />
          <p className="text-xs text-ink-70 sm:col-span-2">{L('المصروفات المتغيرة = مستهلكات وعمولات وأي حاجة بتزيد كل ما الشغل يزيد. المقترح 10–20%.', 'Variable costs = consumables, commissions and anything that grows with sales. Suggested 10–20%.')}</p>
          <div className="sm:col-span-2"><Button variant="primary" loading={save.isPending} disabled={!dirty} onClick={() => save.mutate()}>{L('حفظ الخطة', 'Save plan')}</Button></div>
        </CardBody></Card>
      </section>

      {/* الإيجار */}
      <section className="space-y-3">
        <h2 className="text-lg font-bold text-espresso">{L('الإيجار (بيزيد كل سنة)', 'Rent (increases yearly)')}</h2>
        <Card><CardBody className="space-y-3 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Input type="date" dir="ltr" label={L('تاريخ بداية عقد الإيجار', 'Lease start date')} value={form.rentStart} onChange={(e) => set({ rentStart: e.target.value })} />
            <Input label={L('الإيجار الشهري في السنة الأولى (ج)', 'First-year monthly rent')} type="number" inputMode="decimal" value={form.rentBase} onChange={(e) => set({ rentBase: e.target.value })} />
          </div>
          {plan.rent_start && plan.rent_base ? (
            <div className="space-y-2 rounded-btn bg-sand/40 p-3 text-sm">
              <p>{L('الإيجار الحالي:', 'Current rent:')} <b className="font-latin">{egp(rentNow)}</b> / {L('شهر', 'month')}</p>
              {nextRaise ? <p className="text-xs text-ink-70">{L('أول يوم في سنة الإيجار الجاية (تاريخ الزيادة):', 'Next lease year starts (raise date):')} <span className="font-latin">{nextRaise}</span></p> : null}
              {steps.length > 0 ? (
                <ul className="space-y-0.5 text-xs text-ink-70">
                  {steps.map((s) => <li key={s.id}><span className="font-latin">{s.step_start}</span> · +{s.pct}% → <span className="font-latin">{egp(s.amount)}</span></li>)}
                </ul>
              ) : null}
              {raiseDue ? (
                <div className="space-y-2 rounded-btn border border-gold/50 bg-gold/10 p-3">
                  <p className="font-semibold">{L('سنة الإيجار انتهت ✅ اكتب نسبة الزيادة الجديدة', 'Lease year ended ✅ enter the new increase %')}</p>
                  <div className="flex items-end gap-2">
                    <div className="w-32"><Input label={L('الزيادة %', 'Increase %')} type="number" inputMode="decimal" value={pct} onChange={(e) => setPct(e.target.value)} /></div>
                    <Button variant="primary" loading={addStep.isPending} onClick={() => addStep.mutate()}>{L('سجّل الزيادة', 'Record')}</Button>
                  </div>
                  {pct && num(pct) >= 0 ? <p className="text-xs text-ink-70">{L('الإيجار الجديد:', 'New rent:')} <span className="font-latin">{egp(lastStepAmount * (1 + num(pct) / 100))}</span></p> : null}
                </div>
              ) : null}
              <Button variant="secondary" size="sm" loading={syncRent.isPending} onClick={() => syncRent.mutate()}>{L('خلّي الإيجار مصروف شهري تلقائي', 'Make rent an automatic monthly expense')}</Button>
            </div>
          ) : <p className="text-xs text-ink-70">{L('اكتب التاريخ والمبلغ واحفظ الخطة فوق.', 'Enter the date and amount, then save the plan above.')}</p>}
        </CardBody></Card>
      </section>

      {/* نقطة التعادل */}
      <section className="space-y-3">
        <h2 className="text-lg font-bold text-espresso">{L('نقطة التعادل (أقل دخل يغطيك)', 'Break-even')}</h2>
        <Card><CardBody className="p-4">
          <div className="divide-y divide-bark/10">
            {row(L('إيجار المحل', 'Rent'), rentNow)}
            {row(L('مصاريف ثابتة شهرية (كهرباء، إنترنت…)', 'Fixed monthly costs'), recurringFixed, L('من تبويب الثابتة', 'from the Recurring tab'))}
            {row(L('مرتبات المساعدين', 'Assistants pay'), asst, L('من قسم المساعدين في الطاقم', 'from Staff → Assistants'))}
            {row(L('مرتبات الحلاقين الثابتة', 'Fixed barber pay'), barbers)}
            {row(L('راتبك', 'Your salary'), owner)}
            {row(L('إجمالي الثابت شهرياً', 'Total fixed / month'), fixedAll, undefined, true)}
            {row(L('الدخل اللي يعدّي بيه الصفر (تعادل)', 'Break-even income'), breakEven, L(`بعد ${Math.round(v * 100)}% مصروفات متغيرة`, `after ${Math.round(v * 100)}% variable costs`), true)}
            {row(L('الدخل المطلوب لهدفك', 'Income needed for your goal'), required, undefined, true)}
          </div>
        </CardBody></Card>
      </section>

      {/* تلميح */}
      <section className="space-y-2">
        <h2 className="text-lg font-bold text-espresso">{L('إزاي تحسب هدفك صح؟', 'How to set your goal')}</h2>
        <Card className="border-gold/40 bg-gold/10"><CardBody className="space-y-2 p-4 text-sm">
          <ol className="list-decimal space-y-1.5 ps-5 text-ink-70">
            <li>{L('اتأكد إن كل مصاريفك الثابتة مكتوبة (إيجار، كهرباء، إنترنت، اشتراكات) في تبويب الثابتة.', 'Make sure all fixed costs are in the Recurring tab.')}</li>
            <li>{L('اكتب راتبك الحقيقي: ده مصروف مش ربح. من غيره المحل بيبان مكسب وهو لأ.', 'Enter your real salary: it is a cost, not profit.')}</li>
            <li>{L('الهدف = الربح اللي فوق ده كله، وده اللي بيكبّر المحل (تجهيزات، فرع، ادخار).', 'Goal = the profit above all that, which grows the business.')}</li>
            <li>{L('المقترح للبداية: ربح يساوي حوالي 20% من دخل التعادل.', 'A good start: profit around 20% of break-even income.')}</li>
            <li>{L('راجع الرقم كل 3 شهور وزوّده 10% لو حققته مرتين ورا بعض.', 'Review every 3 months and raise it 10% after hitting it twice in a row.')}</li>
          </ol>
          {breakEven > 0 ? (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span>{L('مقترح لك:', 'Suggested:')} <b className="font-latin">{egp(suggestedGoal)}</b></span>
              <Button size="sm" variant="secondary" onClick={() => set({ goal: String(suggestedGoal) })}>{L('استخدم المقترح', 'Use suggestion')}</Button>
            </div>
          ) : null}
        </CardBody></Card>
      </section>

      {/* صناديق */}
      <section className="space-y-2">
        <h2 className="text-lg font-bold text-espresso">{L('توزيع الربح (صناديق)', 'Profit split (boxes)')}</h2>
        <Card><CardBody className="space-y-2 p-4 text-sm">
          {d.settings && d.settings.alloc.length > 0 ? (
            <>
              <ul className="flex flex-wrap gap-2">
                {d.settings.alloc.map((a) => <li key={a.id} className="rounded-pill bg-sand px-3 py-1 text-xs">{a.name} <span className="font-latin font-bold">{a.pct}%</span></li>)}
              </ul>
              <p className="text-xs text-ink-70">{L('بتتعدّل من تبويب الميزانية (تقسيم الربح). ده المكان الوحيد للصناديق دلوقتي.', 'Edit it in the Budget tab (profit split). This is now the single place for boxes.')}</p>
            </>
          ) : (
            <>
              <p className="text-ink-70">{L('لسه مفيش صناديق. المقترح: ادخار 15% · تطوير 15% · طوارئ 10%.', 'No boxes yet. Suggested: savings 15% · development 15% · emergency 10%.')}</p>
              <Button size="sm" variant="secondary" loading={setAlloc.isPending} onClick={() => setAlloc.mutate()}>{L('املأها بالمقترح', 'Fill with suggestion')}</Button>
            </>
          )}
        </CardBody></Card>
      </section>
    </div>
  );
}

function fetchKey(ym: string): [string, string] {
  const b = monthBounds(ym);
  return [b.from, b.to];
}

function Stat({ label, value, bad }: { label: string; value: string; bad?: boolean }) {
  return (
    <div className="rounded-btn bg-white/70 p-2.5">
      <p className="text-[11px] text-ink-70">{label}</p>
      <p className={cn('mt-0.5 font-latin text-base font-bold', bad ? 'text-danger' : 'text-espresso')}>{value}</p>
    </div>
  );
}
