import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Card, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import { untypedDb } from '@/features/payments/useFinanceBoxes';
import { formatEGP } from '@/lib/money';
import { cn } from '@/lib/cn';
import {
  BUCKET_LABEL,
  KIND_LABEL,
  computeBalances,
  fetchIncome,
  monthBounds,
  todayCairo,
  useFinData,
  type Bucket,
  type Category,
  type FinData,
  type Wallet,
  type WalletKind,
} from './useFinance';

type TabId = 'overview' | 'expenses' | 'wallets' | 'closing' | 'categories';

const selectCls = 'min-h-11 w-full rounded-btn border border-bark/20 bg-white px-3 text-sm text-espresso';

function useLang() {
  const { i18n } = useTranslation();
  const isAr = !!i18n.language?.startsWith('ar');
  return { isAr, L: (ar: string, en: string) => (isAr ? ar : en) };
}

function useFinMutation<T>(fn: (v: T) => Promise<void>, okMsg: string, after?: () => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      toast.success(okMsg);
      void qc.invalidateQueries({ queryKey: ['fin-data'] });
      void qc.invalidateQueries({ queryKey: ['fin-month'] });
      after?.();
    },
    onError: (e) => {
      const m = (e as Error).message;
      toast.error(m.startsWith('MSG:') ? m.slice(4) : 'حصلت مشكلة، حاول تاني');
    },
  });
}
const bad = (msg: string) => new Error(`MSG:${msg}`);

export function FinancePage() {
  const { L } = useLang();
  const [tab, setTab] = useState<TabId>('overview');
  const q = useFinData();

  const tabs: Array<{ id: TabId; label: string }> = [
    { id: 'overview', label: L('نظرة عامة', 'Overview') },
    { id: 'expenses', label: L('المصروفات', 'Expenses') },
    { id: 'wallets', label: L('المحافظ', 'Wallets') },
    { id: 'closing', label: L('الإقفال اليومي', 'Daily closing') },
    { id: 'categories', label: L('التصنيفات', 'Categories') },
  ];

  if (q.isError) {
    return (
      <div className="space-y-3">
        <h1 className="text-xl font-bold text-espresso">{L('المالية', 'Finance')}</h1>
        <p className="rounded-btn bg-sand/50 p-3 text-sm">{L('محتاج تشغّل ملف finance-f1.sql في Supabase الأول.', 'Run finance-f1.sql in Supabase first.')}</p>
      </div>
    );
  }
  const d = q.data;

  return (
    <div className="min-w-0 space-y-4">
      <h1 className="text-xl font-bold text-espresso">{L('المالية', 'Finance')}</h1>
      <div role="tablist" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'shrink-0 rounded-btn px-3.5 py-2 text-sm font-medium transition-colors',
              tab === t.id ? 'bg-gold text-espresso' : 'bg-sand/60 text-ink-70',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      {!d ? (
        <Skeleton className="h-40" />
      ) : tab === 'overview' ? (
        <Overview d={d} />
      ) : tab === 'expenses' ? (
        <Expenses d={d} />
      ) : tab === 'wallets' ? (
        <Wallets d={d} />
      ) : tab === 'closing' ? (
        <Closing d={d} />
      ) : (
        <Categories d={d} />
      )}
    </div>
  );
}

/* ───────────── نظرة عامة ───────────── */
function Overview({ d }: { d: FinData }) {
  const { L, isAr } = useLang();
  const [ym, setYm] = useState(todayCairo().slice(0, 7));
  const { from, to } = monthBounds(ym);
  const incomeQ = useQuery({ queryKey: ['fin-month', from, to], queryFn: () => fetchIncome(from, to), retry: false });
  const bal = useMemo(() => computeBalances(d), [d]);
  const catById = new Map<string, Category>(d.categories.map((c): [string, Category] => [c.id, c]));
  const walletsActive = d.wallets.filter((w) => w.is_active);
  const totalBal = walletsActive.reduce((s, w) => s + (bal.get(w.id) ?? 0), 0);

  const monthTx = d.txs.filter((t) => t.tx_date >= from && t.tx_date <= to);
  const byBucket: Record<Bucket, number> = { operating: 0, development: 0, owner_draw: 0, other: 0 };
  const byCat = new Map<string, number>();
  let extraIncome = 0;
  for (const t of monthTx) {
    if (t.kind === 'expense') {
      const c = t.category_id ? catById.get(t.category_id) : undefined;
      byBucket[c?.bucket ?? 'other'] += t.amount;
      const key = c?.name ?? L('بدون تصنيف', 'Uncategorized');
      byCat.set(key, (byCat.get(key) ?? 0) + t.amount);
    } else if (t.kind === 'income') extraIncome += t.amount;
  }
  const income = (incomeQ.data?.grand_total ?? 0) + extraIncome;
  const expenses = byBucket.operating + byBucket.development + byBucket.other;
  const net = income - expenses;
  const afterDraw = net - byBucket.owner_draw;
  const cats = [...byCat.entries()].sort((a, b) => b[1] - a[1]);
  const maxCat = cats[0]?.[1] ?? 1;

  return (
    <div className="space-y-5">
      <section className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-bold text-espresso">{L('أرصدة المحافظ', 'Wallet balances')}</h2>
          <p className="font-latin text-lg font-bold text-espresso">{formatEGP(totalBal)}</p>
        </div>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {walletsActive.map((w) => (
            <Card key={w.id} className={w.is_main ? 'border-gold/40 bg-gold/10' : undefined}>
              <CardBody className="p-3">
                <p className="truncate text-xs text-ink-70">{w.name}</p>
                <p className="mt-1 font-latin text-lg font-semibold text-espresso">{formatEGP(bal.get(w.id) ?? 0)}</p>
              </CardBody>
            </Card>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 className="text-lg font-bold text-espresso">{L('الأرباح والخسائر', 'Profit & loss')}</h2>
          <Input type="month" label={L('الشهر', 'Month')} value={ym} onChange={(e) => e.target.value && setYm(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <Card><CardBody className="p-3">
            <p className="text-xs text-ink-70">{L('الدخل', 'Income')}</p>
            <p className="mt-1 font-latin text-lg font-semibold text-espresso">{formatEGP(income)}</p>
            <p className="text-[11px] text-ink-70">{L('حجوزات ومنتجات + دخل يدوي', 'Bookings, products + manual income')}</p>
          </CardBody></Card>
          <Card><CardBody className="p-3">
            <p className="text-xs text-ink-70">{L('المصروفات', 'Expenses')}</p>
            <p className="mt-1 font-latin text-lg font-semibold text-espresso">{formatEGP(expenses)}</p>
            <p className="text-[11px] text-ink-70">{L(`تشغيل ${formatEGP(byBucket.operating)} · تطوير ${formatEGP(byBucket.development)}`, `Op ${formatEGP(byBucket.operating)} · Dev ${formatEGP(byBucket.development)}`)}</p>
          </CardBody></Card>
          <Card className={net >= 0 ? 'border-gold/40 bg-gold/10' : 'border-danger/30 bg-danger/5'}><CardBody className="p-3">
            <p className="text-xs text-ink-70">{L('صافي الربح', 'Net profit')}</p>
            <p className="mt-1 font-latin text-xl font-bold text-espresso">{formatEGP(net)}</p>
          </CardBody></Card>
          <Card><CardBody className="p-3">
            <p className="text-xs text-ink-70">{L('بعد سحب المالك', 'After owner draws')}</p>
            <p className="mt-1 font-latin text-lg font-semibold text-espresso">{formatEGP(afterDraw)}</p>
            <p className="text-[11px] text-ink-70">{L(`سحبت ${formatEGP(byBucket.owner_draw)}`, `Drew ${formatEGP(byBucket.owner_draw)}`)}</p>
          </CardBody></Card>
        </div>
        <p className="text-xs text-ink-70">
          {L('التحويل للادخار أو التطوير مش مصروف: هو نقل فلوس بين محافظك. الصرف الفعلي على التطوير بيتسجل مصروف بتصنيف "تطوير".', 'Transfers to savings/development are not expenses; they just move money between wallets.')}
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-bold text-espresso">{L('المصروفات حسب التصنيف', 'Expenses by category')}</h2>
        {cats.length === 0 ? (
          <p className="text-sm text-ink-70">{L('مفيش مصروفات متسجلة الشهر ده.', 'No expenses this month.')}</p>
        ) : (
          <ul className="space-y-2">
            {cats.map(([name, v]) => (
              <li key={name} className="space-y-1">
                <div className="flex justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate">{name}</span>
                  <span className="shrink-0 font-latin font-semibold">{formatEGP(v)}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-sand/60">
                  <div className="h-full rounded-full bg-gold" style={{ width: `${Math.max(3, (v / maxCat) * 100)}%` }} />
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="hidden">{isAr ? '' : ''}</p>
      </section>
    </div>
  );
}

/* ───────────── المصروفات ───────────── */
function Expenses({ d }: { d: FinData }) {
  const { L } = useLang();
  const main = d.wallets.find((w) => w.is_main) ?? d.wallets[0];
  const [kind, setKind] = useState<'expense' | 'income'>('expense');
  const [amount, setAmount] = useState('');
  const [catId, setCatId] = useState('');
  const [walletId, setWalletId] = useState('');
  const [date, setDate] = useState(todayCairo());
  const [note, setNote] = useState('');
  const [ym, setYm] = useState(todayCairo().slice(0, 7));
  const { from, to } = monthBounds(ym);

  const cats = d.categories.filter((c) => c.is_active && c.kind === kind);
  const catById = new Map<string, Category>(d.categories.map((c): [string, Category] => [c.id, c]));
  const walletById = new Map<string, Wallet>(d.wallets.map((w): [string, Wallet] => [w.id, w]));

  const add = useFinMutation(
    async () => {
      const n = Number(amount);
      if (!(n > 0)) throw bad('اكتب مبلغ صحيح');
      const w = walletId || main?.id;
      if (!w) throw bad('اختار المحفظة');
      const { error } = await untypedDb.from('fin_transactions').insert({
        tx_date: date, kind, amount: n, wallet_id: w, category_id: catId || null, note: note.trim() || null,
      });
      if (error) throw error;
    },
    L('اتسجّل', 'Saved'),
    () => { setAmount(''); setNote(''); },
  );
  const del = useFinMutation(async (id: string) => {
    const { error } = await untypedDb.from('fin_transactions').delete().eq('id', id);
    if (error) throw error;
  }, L('اتمسح', 'Deleted'));

  const list = d.txs.filter((t) => (t.kind === 'expense' || t.kind === 'income') && t.tx_date >= from && t.tx_date <= to);
  const total = list.reduce((s, t) => s + (t.kind === 'expense' ? t.amount : 0), 0);

  return (
    <div className="space-y-5">
      <Card>
        <CardBody className="space-y-3 p-4">
          <div className="flex gap-2">
            {(['expense', 'income'] as const).map((k) => (
              <button
                key={k}
                onClick={() => { setKind(k); setCatId(''); }}
                className={cn('flex-1 rounded-btn px-3 py-2 text-sm font-medium', kind === k ? 'bg-gold text-espresso' : 'bg-sand/60 text-ink-70')}
              >
                {k === 'expense' ? L('مصروف', 'Expense') : L('دخل آخر', 'Other income')}
              </button>
            ))}
          </div>
          <Input label={L('المبلغ (جنيه)', 'Amount (EGP)')} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <div>
            <label className="text-sm font-medium text-ink-70">{L('التصنيف', 'Category')}</label>
            <select className={cn(selectCls, 'mt-1')} value={catId} onChange={(e) => setCatId(e.target.value)}>
              <option value="">— {L('اختار', 'Select')} —</option>
              {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium text-ink-70">{kind === 'expense' ? L('اتدفع من', 'Paid from') : L('دخل في', 'Received in')}</label>
            <select className={cn(selectCls, 'mt-1')} value={walletId || main?.id || ''} onChange={(e) => setWalletId(e.target.value)}>
              {d.wallets.filter((w) => w.is_active).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
          <Input type="date" label={L('التاريخ', 'Date')} value={date} onChange={(e) => setDate(e.target.value)} />
          <Input label={L('ملاحظة (اختياري)', 'Note (optional)')} value={note} onChange={(e) => setNote(e.target.value)} />
          <Button className="w-full" loading={add.isPending} onClick={() => add.mutate(undefined as never)}>{L('تسجيل', 'Save')}</Button>
        </CardBody>
      </Card>

      <section className="space-y-2">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 className="text-lg font-bold text-espresso">{L('حركات الشهر', 'This month')}</h2>
          <Input type="month" label={L('الشهر', 'Month')} value={ym} onChange={(e) => e.target.value && setYm(e.target.value)} />
        </div>
        <p className="text-sm text-ink-70">{L('إجمالي المصروفات:', 'Total expenses:')} <span className="font-latin font-semibold text-espresso">{formatEGP(total)}</span></p>
        {list.length === 0 ? (
          <p className="text-sm text-ink-70">{L('مفيش حركات.', 'Nothing yet.')}</p>
        ) : (
          <ul className="divide-y divide-bark/10 rounded-card border border-default bg-white">
            {list.map((t) => (
              <li key={t.id} className="flex items-start justify-between gap-3 p-3 text-sm">
                <span className="min-w-0 break-words">
                  <span className="block font-medium text-espresso">{(t.category_id && catById.get(t.category_id)?.name) || L('بدون تصنيف', 'Uncategorized')}</span>
                  <span className="block text-xs text-ink-70">
                    <span className="font-latin">{t.tx_date}</span> · {(t.wallet_id && walletById.get(t.wallet_id)?.name) || ''}
                    {t.note ? ` · ${t.note}` : ''}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className={cn('font-latin font-semibold', t.kind === 'income' ? 'text-green-700' : 'text-espresso')}>
                    {t.kind === 'income' ? '+' : '−'}{formatEGP(t.amount)}
                  </span>
                  <button
                    className="rounded px-2 py-1 text-xs text-danger"
                    onClick={() => { if (window.confirm(L('تمسح الحركة دي؟', 'Delete this entry?'))) del.mutate(t.id); }}
                    aria-label={L('مسح', 'Delete')}
                  >✕</button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/* ───────────── المحافظ ───────────── */
function Wallets({ d }: { d: FinData }) {
  const { L } = useLang();
  const bal = useMemo(() => computeBalances(d), [d]);
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<WalletKind>('cash');
  const [opening, setOpening] = useState('0');

  const startEdit = (w: Wallet | null) => {
    setEditId(w ? w.id : 'new');
    setName(w?.name ?? '');
    setKind(w?.kind ?? 'cash');
    setOpening(String(w?.opening_balance ?? 0));
  };
  const saveWallet = useFinMutation(
    async () => {
      if (!name.trim()) throw bad('اكتب اسم المحفظة');
      const row = { name: name.trim(), kind, opening_balance: Number(opening) || 0 };
      const r = editId === 'new'
        ? await untypedDb.from('fin_wallets').insert({ ...row, sort: d.wallets.length + 1 })
        : await untypedDb.from('fin_wallets').update(row).eq('id', editId as string);
      if (r.error) throw r.error;
    },
    L('اتحفظت', 'Saved'),
    () => setEditId(null),
  );
  const toggle = useFinMutation(async (w: Wallet) => {
    if (w.is_main) throw bad('درج الكاش الأساسي مينفعش يتقفل');
    const { error } = await untypedDb.from('fin_wallets').update({ is_active: !w.is_active }).eq('id', w.id);
    if (error) throw error;
  }, L('تمام', 'Done'));

  // تحويل بين المحافظ
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [amt, setAmt] = useState('');
  const [tdate, setTdate] = useState(todayCairo());
  const [tnote, setTnote] = useState('');
  const active = d.wallets.filter((w) => w.is_active);
  const transfer = useFinMutation(
    async () => {
      const n = Number(amt);
      const f = from || active[0]?.id;
      if (!(n > 0) || !f || !to) throw bad('اختار المحفظتين واكتب المبلغ');
      if (f === to) throw bad('اختار محفظتين مختلفتين');
      const { error } = await untypedDb.from('fin_transactions').insert({
        tx_date: tdate, kind: 'transfer', amount: n, wallet_id: f, to_wallet_id: to, note: tnote.trim() || null,
      });
      if (error) throw error;
    },
    L('اتحوّلت', 'Transferred'),
    () => { setAmt(''); setTnote(''); },
  );

  // إعدادات ربط الدخل
  const [cashW, setCashW] = useState(d.settings?.cash_wallet_id ?? '');
  const [onlineW, setOnlineW] = useState(d.settings?.online_wallet_id ?? '');
  const [start, setStart] = useState(d.settings?.tracking_start ?? todayCairo());
  const saveSettings = useFinMutation(async () => {
    const { error } = await untypedDb.from('fin_settings').upsert({
      id: 1, tracking_start: start, cash_wallet_id: cashW || null, online_wallet_id: onlineW || null,
    });
    if (error) throw error;
  }, L('اتحفظت الإعدادات', 'Settings saved'));

  return (
    <div className="space-y-5">
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-espresso">{L('محافظك', 'Your wallets')}</h2>
          <Button size="sm" variant="secondary" onClick={() => startEdit(null)}>{L('+ محفظة', '+ Wallet')}</Button>
        </div>
        <ul className="divide-y divide-bark/10 rounded-card border border-default bg-white">
          {d.wallets.map((w: Wallet) => (
            <li key={w.id} className={cn('flex items-center justify-between gap-3 p-3 text-sm', !w.is_active && 'opacity-50')}>
              <span className="min-w-0">
                <span className="block truncate font-medium text-espresso">{w.name}{w.is_main ? ' ★' : ''}</span>
                <span className="block text-xs text-ink-70">{L(KIND_LABEL[w.kind].ar, KIND_LABEL[w.kind].en)}</span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <span className="font-latin font-semibold">{formatEGP(bal.get(w.id) ?? 0)}</span>
                <button className="rounded px-2 py-1 text-xs text-gold underline" onClick={() => startEdit(w)}>{L('تعديل', 'Edit')}</button>
                {!w.is_main ? (
                  <button className="rounded px-2 py-1 text-xs text-ink-70 underline" onClick={() => toggle.mutate(w)}>
                    {w.is_active ? L('إيقاف', 'Hide') : L('تشغيل', 'Show')}
                  </button>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
        {editId ? (
          <Card><CardBody className="space-y-3 p-4">
            <Input label={L('اسم المحفظة', 'Wallet name')} value={name} onChange={(e) => setName(e.target.value)} />
            <div>
              <label className="text-sm font-medium text-ink-70">{L('النوع', 'Type')}</label>
              <select className={cn(selectCls, 'mt-1')} value={kind} onChange={(e) => setKind(e.target.value as WalletKind)}>
                {(Object.keys(KIND_LABEL) as WalletKind[]).map((k) => <option key={k} value={k}>{L(KIND_LABEL[k].ar, KIND_LABEL[k].en)}</option>)}
              </select>
            </div>
            <Input label={L('الرصيد الافتتاحي (اللي فيها دلوقتي)', 'Opening balance')} inputMode="decimal" value={opening} onChange={(e) => setOpening(e.target.value)} />
            <div className="flex gap-2">
              <Button variant="secondary" className="w-full" onClick={() => setEditId(null)}>{L('إلغاء', 'Cancel')}</Button>
              <Button className="w-full" loading={saveWallet.isPending} onClick={() => saveWallet.mutate(undefined as never)}>{L('حفظ', 'Save')}</Button>
            </div>
          </CardBody></Card>
        ) : null}
      </section>

      <Card>
        <CardBody className="space-y-3 p-4">
          <p className="font-semibold text-espresso">{L('تحويل بين المحافظ (مثلاً للادخار أو التطوير)', 'Transfer between wallets')}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <label className="text-sm font-medium text-ink-70">{L('من', 'From')}</label>
              <select className={cn(selectCls, 'mt-1')} value={from || active[0]?.id || ''} onChange={(e) => setFrom(e.target.value)}>
                {active.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-ink-70">{L('إلى', 'To')}</label>
              <select className={cn(selectCls, 'mt-1')} value={to} onChange={(e) => setTo(e.target.value)}>
                <option value="">— {L('اختار', 'Select')} —</option>
                {active.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </div>
          </div>
          <Input label={L('المبلغ', 'Amount')} inputMode="decimal" value={amt} onChange={(e) => setAmt(e.target.value)} />
          <Input type="date" label={L('التاريخ', 'Date')} value={tdate} onChange={(e) => setTdate(e.target.value)} />
          <Input label={L('ملاحظة', 'Note')} value={tnote} onChange={(e) => setTnote(e.target.value)} />
          <Button className="w-full" loading={transfer.isPending} onClick={() => transfer.mutate(undefined as never)}>{L('تحويل', 'Transfer')}</Button>
        </CardBody>
      </Card>

      <Card>
        <CardBody className="space-y-3 p-4">
          <p className="font-semibold text-espresso">{L('ربط دخل الحجوزات بالمحافظ', 'Where booking income lands')}</p>
          <div>
            <label className="text-sm font-medium text-ink-70">{L('دخل الكاش والمنتجات يدخل في', 'Cash & product income goes to')}</label>
            <select className={cn(selectCls, 'mt-1')} value={cashW} onChange={(e) => setCashW(e.target.value)}>
              <option value="">—</option>
              {d.wallets.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium text-ink-70">{L('دخل إنستاباي وفودافون كاش يدخل في', 'InstaPay / Vodafone income goes to')}</label>
            <select className={cn(selectCls, 'mt-1')} value={onlineW} onChange={(e) => setOnlineW(e.target.value)}>
              <option value="">—</option>
              {d.wallets.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
          <Input type="date" label={L('بدء حساب الأرصدة من تاريخ', 'Track balances from')} value={start} onChange={(e) => setStart(e.target.value)} />
          <p className="text-xs text-ink-70">
            {L('الأرصدة = الرصيد الافتتاحي + دخل الحجوزات من التاريخ ده + حركاتك. لو عدّلت التاريخ، حط الرصيد الافتتاحي للمحافظ على نفس اليوم.', 'Balance = opening + booking income since this date + your entries.')}
          </p>
          <Button className="w-full" variant="secondary" loading={saveSettings.isPending} onClick={() => saveSettings.mutate(undefined as never)}>{L('حفظ الإعدادات', 'Save settings')}</Button>
        </CardBody>
      </Card>
    </div>
  );
}

/* ───────────── الإقفال اليومي ───────────── */
function Closing({ d }: { d: FinData }) {
  const { L } = useLang();
  const bal = useMemo(() => computeBalances(d), [d]);
  const main = d.wallets.find((w) => w.is_main) ?? d.wallets[0];
  const expected = main ? bal.get(main.id) ?? 0 : 0;
  const [counted, setCounted] = useState('');
  const [note, setNote] = useState('');
  const [settle, setSettle] = useState(true);
  const c = counted.trim() === '' ? null : Number(counted);
  const diff = c === null || Number.isNaN(c) ? null : Math.round((c - expected) * 100) / 100;

  const save = useFinMutation(
    async () => {
      if (!main || diff === null || c === null) throw bad('اكتب الكاش اللي عديته');
      const today = todayCairo();
      const { error } = await untypedDb.from('fin_closings').insert({
        close_date: today, wallet_id: main.id, expected_cash: expected, counted_cash: c, diff, note: note.trim() || null,
      });
      if (error) throw error;
      if (settle && diff !== 0) {
        const r = await untypedDb.from('fin_transactions').insert({
          tx_date: today, kind: 'adjust', amount: diff, wallet_id: main.id, note: `تسوية إقفال ${today}`,
        });
        if (r.error) throw r.error;
      }
    },
    L('اتسجّل الإقفال', 'Closing saved'),
    () => { setCounted(''); setNote(''); },
  );

  return (
    <div className="space-y-5">
      <Card>
        <CardBody className="space-y-3 p-4">
          <p className="font-semibold text-espresso">{L('إقفال اليوم', 'Close today')}</p>
          <div className="rounded-btn bg-sand/40 p-3 text-center">
            <p className="text-xs text-ink-70">{L(`المفروض في ${main?.name ?? 'الدرج'}`, `Expected in ${main?.name ?? 'drawer'}`)}</p>
            <p className="font-latin text-2xl font-bold text-espresso">{formatEGP(expected)}</p>
          </div>
          <Input label={L('الكاش اللي عديته فعلاً', 'Cash you counted')} inputMode="decimal" value={counted} onChange={(e) => setCounted(e.target.value)} />
          {diff !== null ? (
            <p className={cn('rounded-btn p-2 text-center text-sm font-semibold', diff === 0 ? 'bg-green-50 text-green-800' : diff > 0 ? 'bg-gold/15 text-espresso' : 'bg-danger/10 text-danger')}>
              {diff === 0 ? L('مظبوط ✅', 'Balanced ✅') : diff > 0 ? L(`زيادة ${formatEGP(diff)}`, `Over by ${formatEGP(diff)}`) : L(`عجز ${formatEGP(-diff)}`, `Short by ${formatEGP(-diff)}`)}
            </p>
          ) : null}
          <Input label={L('ملاحظة (سبب الفرق مثلاً)', 'Note')} value={note} onChange={(e) => setNote(e.target.value)} />
          <label className="flex items-center gap-2 text-sm text-ink-70">
            <input type="checkbox" className="size-4 accent-[#c9953f]" checked={settle} onChange={(e) => setSettle(e.target.checked)} />
            {L('سوّي رصيد الدرج على اللي اتعدّ', 'Adjust drawer balance to the counted amount')}
          </label>
          <Button className="w-full" loading={save.isPending} disabled={diff === null} onClick={() => save.mutate(undefined as never)}>{L('تسجيل الإقفال', 'Save closing')}</Button>
        </CardBody>
      </Card>

      <section className="space-y-2">
        <h2 className="text-lg font-bold text-espresso">{L('سجل الإقفال', 'History')}</h2>
        {d.closings.length === 0 ? (
          <p className="text-sm text-ink-70">{L('لسه مفيش إقفالات.', 'No closings yet.')}</p>
        ) : (
          <ul className="divide-y divide-bark/10 rounded-card border border-default bg-white">
            {d.closings.map((r) => (
              <li key={r.id} className="flex items-start justify-between gap-3 p-3 text-sm">
                <span className="min-w-0">
                  <span className="block font-latin font-medium text-espresso">{r.close_date}</span>
                  <span className="block text-xs text-ink-70">
                    {L('المفروض', 'Expected')} <span className="font-latin">{formatEGP(r.expected_cash)}</span> · {L('معدود', 'Counted')} <span className="font-latin">{formatEGP(r.counted_cash)}</span>
                    {r.note ? ` · ${r.note}` : ''}
                  </span>
                </span>
                <span className={cn('shrink-0 font-latin font-semibold', r.diff === 0 ? 'text-green-700' : r.diff > 0 ? 'text-espresso' : 'text-danger')}>
                  {r.diff > 0 ? '+' : ''}{formatEGP(r.diff)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/* ───────────── التصنيفات ───────────── */
function Categories({ d }: { d: FinData }) {
  const { L } = useLang();
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<'expense' | 'income'>('expense');
  const [bucket, setBucket] = useState<Bucket>('operating');

  const startEdit = (c: Category | null) => {
    setEditId(c ? c.id : 'new');
    setName(c?.name ?? '');
    setKind(c?.kind ?? 'expense');
    setBucket(c?.bucket ?? 'operating');
  };
  const save = useFinMutation(
    async () => {
      if (!name.trim()) throw bad('اكتب اسم التصنيف');
      const row = { name: name.trim(), kind, bucket };
      const r = editId === 'new'
        ? await untypedDb.from('fin_categories').insert({ ...row, sort: d.categories.length + 1 })
        : await untypedDb.from('fin_categories').update(row).eq('id', editId as string);
      if (r.error) throw r.error;
    },
    L('اتحفظ', 'Saved'),
    () => setEditId(null),
  );
  const toggle = useFinMutation(async (c: Category) => {
    const { error } = await untypedDb.from('fin_categories').update({ is_active: !c.is_active }).eq('id', c.id);
    if (error) throw error;
  }, L('تمام', 'Done'));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-espresso">{L('تصنيفات المصروفات', 'Categories')}</h2>
        <Button size="sm" variant="secondary" onClick={() => startEdit(null)}>{L('+ تصنيف', '+ Category')}</Button>
      </div>
      <p className="text-xs text-ink-70">
        {L('النوع بيحدد مكان المصروف في الأرباح: تشغيل وتطوير وأخرى بتتخصم من الربح، وسحب المالك بيتعرض لوحده بعد صافي الربح.', 'The type decides how the entry affects profit.')}
      </p>
      <ul className="divide-y divide-bark/10 rounded-card border border-default bg-white">
        {d.categories.map((c: Category) => (
          <li key={c.id} className={cn('flex items-center justify-between gap-3 p-3 text-sm', !c.is_active && 'opacity-50')}>
            <span className="min-w-0">
              <span className="block break-words font-medium text-espresso">{c.name}</span>
              <span className="block text-xs text-ink-70">
                {c.kind === 'income' ? L('دخل', 'Income') : L(BUCKET_LABEL[c.bucket].ar, BUCKET_LABEL[c.bucket].en)}
              </span>
            </span>
            <span className="flex shrink-0 gap-2">
              <button className="rounded px-2 py-1 text-xs text-gold underline" onClick={() => startEdit(c)}>{L('تعديل', 'Edit')}</button>
              <button className="rounded px-2 py-1 text-xs text-ink-70 underline" onClick={() => toggle.mutate(c)}>
                {c.is_active ? L('إخفاء', 'Hide') : L('إظهار', 'Show')}
              </button>
            </span>
          </li>
        ))}
      </ul>
      {editId ? (
        <Card><CardBody className="space-y-3 p-4">
          <Input label={L('اسم التصنيف', 'Name')} value={name} onChange={(e) => setName(e.target.value)} />
          <div>
            <label className="text-sm font-medium text-ink-70">{L('النوع', 'Kind')}</label>
            <select className={cn(selectCls, 'mt-1')} value={kind} onChange={(e) => setKind(e.target.value as 'expense' | 'income')}>
              <option value="expense">{L('مصروف', 'Expense')}</option>
              <option value="income">{L('دخل', 'Income')}</option>
            </select>
          </div>
          {kind === 'expense' ? (
            <div>
              <label className="text-sm font-medium text-ink-70">{L('بيتحسب كـ', 'Counts as')}</label>
              <select className={cn(selectCls, 'mt-1')} value={bucket} onChange={(e) => setBucket(e.target.value as Bucket)}>
                {(Object.keys(BUCKET_LABEL) as Bucket[]).map((b) => <option key={b} value={b}>{L(BUCKET_LABEL[b].ar, BUCKET_LABEL[b].en)}</option>)}
              </select>
            </div>
          ) : null}
          <div className="flex gap-2">
            <Button variant="secondary" className="w-full" onClick={() => setEditId(null)}>{L('إلغاء', 'Cancel')}</Button>
            <Button className="w-full" loading={save.isPending} onClick={() => save.mutate(undefined as never)}>{L('حفظ', 'Save')}</Button>
          </div>
        </CardBody></Card>
      ) : null}
    </div>
  );
}
