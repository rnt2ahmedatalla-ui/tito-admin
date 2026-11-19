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
  type AllocItem,
  type Category,
  type StockItem,
  type Recurring,
  type FinData,
  type Wallet,
  type WalletKind,
} from './useFinance';

type TabId = 'overview' | 'expenses' | 'recurring' | 'budget' | 'inventory' | 'wallets' | 'closing' | 'categories';

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
    { id: 'recurring', label: L('الثابتة', 'Recurring') },
    { id: 'budget', label: L('الميزانية', 'Budget') },
    { id: 'inventory', label: L('المخزون', 'Inventory') },
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
      <Guide />
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
      ) : tab === 'recurring' ? (
        <RecurringTab d={d} />
      ) : tab === 'budget' ? (
        <BudgetTab d={d} />
      ) : tab === 'inventory' ? (
        <InventoryTab d={d} />
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
  const { L } = useLang();
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
      {d.items.filter((i) => i.is_active && i.qty <= i.min_qty).length > 0 ? (
        <p className="rounded-btn border border-danger/30 bg-danger/5 p-3 text-sm text-danger">
          ⚠️ {L('مخزون قرّب يخلص:', 'Low stock:')} {d.items.filter((i) => i.is_active && i.qty <= i.min_qty).map((i) => i.name).join('، ')}
        </p>
      ) : null}

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
      </section>

      <Trend d={d} />
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

/* ───────────── دليل الاستخدام ───────────── */
function Guide() {
  const { L } = useLang();
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem('fin-guide-seen') !== '1';
    } catch {
      return true;
    }
  });
  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (!next) {
      try {
        localStorage.setItem('fin-guide-seen', '1');
      } catch {
        /* ignore */
      }
    }
  };
  const steps: Array<[string, string, string, string]> = [
    ['١', L('اضبط البداية', 'Set up'), L('من "المحافظ": حط الرصيد الافتتاحي لكل محفظة (الكاش في الدرج، رصيد الإنستا، الادخار).', 'In Wallets: enter each wallet\'s opening balance.'), ''],
    ['٢', L('سجّل المصروفات', 'Log expenses'), L('من "المصروفات": اكتب المبلغ واختار التصنيف والمحفظة. دخل الحجوزات بيتسجل لوحده.', 'In Expenses: amount, category, wallet. Booking income is automatic.'), ''],
    ['٣', L('الثابتة بتتخصم لوحدها', 'Fixed costs auto-post'), L('من "الثابتة": ضيف الإيجار والإنترنت والكهرباء مرة واحدة، وهتتسجل كل شهر في يومها. وتقدر تعمل تحويل شهري تلقائي للادخار.', 'In Recurring: add rent, internet etc. once; they post monthly. You can also auto-transfer to savings.'), ''],
    ['٤', L('اقفل اليوم', 'Close the day'), L('آخر اليوم من "الإقفال اليومي": عدّ الكاش اللي في الدرج واكتبه، والنظام يقولك زيادة ولا عجز.', 'At day end: count the drawer cash and enter it.'), ''],
    ['٥', L('تابع الأرباح', 'Track profit'), L('من "نظرة عامة": أرصدة المحافظ، صافي ربح الشهر، ومقارنة آخر 6 شهور.', 'Overview: balances, monthly profit, 6-month trend.'), ''],
  ];
  return (
    <div className="rounded-card border border-gold/40 bg-gold/10">
      <button onClick={toggle} className="flex w-full items-center justify-between gap-2 p-3 text-start" aria-expanded={open}>
        <span className="font-semibold text-espresso">💡 {L('إزاي أستخدم النظام؟', 'How to use this')}</span>
        <span className="text-sm text-ink-70">{open ? L('إخفاء', 'Hide') : L('إظهار', 'Show')}</span>
      </button>
      {open ? (
        <ol className="space-y-2.5 border-t border-gold/30 p-3">
          {steps.map(([n, title, body]) => (
            <li key={n} className="flex gap-3">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-gold font-latin text-sm font-bold text-espresso">{n}</span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-espresso">{title}</span>
                <span className="block text-xs leading-relaxed text-ink-70">{body}</span>
              </span>
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}

/* ───────────── المصروفات الثابتة ───────────── */
function RecurringTab({ d }: { d: FinData }) {
  const { L } = useLang();
  const main = d.wallets.find((w) => w.is_main) ?? d.wallets[0];
  const walletById = new Map<string, Wallet>(d.wallets.map((w): [string, Wallet] => [w.id, w]));
  const catById = new Map<string, Category>(d.categories.map((c): [string, Category] => [c.id, c]));
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<'expense' | 'transfer'>('expense');
  const [amount, setAmount] = useState('');
  const [catId, setCatId] = useState('');
  const [walletId, setWalletId] = useState('');
  const [toId, setToId] = useState('');
  const [day, setDay] = useState('1');
  const [start, setStart] = useState(todayCairo());

  const startEdit = (r: Recurring | null) => {
    setEditId(r ? r.id : 'new');
    setName(r?.name ?? '');
    setKind(r?.kind ?? 'expense');
    setAmount(r ? String(r.amount) : '');
    setCatId(r?.category_id ?? '');
    setWalletId(r?.wallet_id ?? '');
    setToId(r?.to_wallet_id ?? '');
    setDay(String(r?.day_of_month ?? 1));
    setStart(r?.start_date ?? todayCairo());
  };
  const save = useFinMutation(
    async () => {
      const n = Number(amount);
      const dd = Math.round(Number(day));
      if (!name.trim()) throw bad('اكتب الاسم');
      if (!(n > 0)) throw bad('اكتب مبلغ صحيح');
      if (!(dd >= 1 && dd <= 31)) throw bad('اليوم من 1 لـ 31');
      const w = walletId || main?.id || null;
      if (kind === 'transfer' && (!toId || toId === w)) throw bad('اختار محفظة الادخار (غير المحفظة المسحوب منها)');
      const row = {
        name: name.trim(), kind, amount: n, day_of_month: dd, start_date: start,
        category_id: kind === 'expense' ? catId || null : null,
        wallet_id: w, to_wallet_id: kind === 'transfer' ? toId : null,
      };
      const r = editId === 'new'
        ? await untypedDb.from('fin_recurring').insert(row)
        : await untypedDb.from('fin_recurring').update(row).eq('id', editId as string);
      if (r.error) throw r.error;
      // يسجّل المستحق من دلوقتي (لو اليوم عدّى)
      try {
        await (untypedDb.rpc as unknown as (fn: string) => Promise<unknown>)('fin_apply_recurring');
      } catch {
        /* ignore */
      }
    },
    L('اتحفظ', 'Saved'),
    () => setEditId(null),
  );
  const toggle = useFinMutation(async (r: Recurring) => {
    const { error } = await untypedDb.from('fin_recurring').update({ is_active: !r.is_active }).eq('id', r.id);
    if (error) throw error;
  }, L('تمام', 'Done'));
  const del = useFinMutation(async (id: string) => {
    const { error } = await untypedDb.from('fin_recurring').delete().eq('id', id);
    if (error) throw error;
  }, L('اتمسح', 'Deleted'));

  if (!d.recurringReady) {
    return <p className="rounded-btn bg-sand/50 p-3 text-sm">{L('محتاج تشغّل ملف finance-recurring.sql في Supabase الأول.', 'Run finance-recurring.sql in Supabase first.')}</p>;
  }
  const monthlyTotal = d.recurring.filter((r) => r.is_active && r.kind === 'expense').reduce((s, r) => s + r.amount, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold text-espresso">{L('المصروفات الثابتة', 'Recurring')}</h2>
          <p className="text-xs text-ink-70">{L('بتتسجل لوحدها كل شهر في اليوم اللي تحدده.', 'Posted automatically each month.')}</p>
        </div>
        <Button size="sm" variant="secondary" onClick={() => startEdit(null)}>{L('+ ثابت', '+ Add')}</Button>
      </div>
      <p className="rounded-btn bg-sand/40 p-2.5 text-sm">
        {L('إجمالي الثابت شهرياً:', 'Fixed per month:')} <span className="font-latin font-bold text-espresso">{formatEGP(monthlyTotal)}</span>
      </p>

      {d.recurring.length === 0 ? (
        <p className="text-sm text-ink-70">{L('لسه مفيش. جرّب تضيف الإيجار أو الإنترنت.', 'None yet. Try adding rent or internet.')}</p>
      ) : (
        <ul className="divide-y divide-bark/10 rounded-card border border-default bg-white">
          {d.recurring.map((r) => (
            <li key={r.id} className={cn('flex items-start justify-between gap-3 p-3 text-sm', !r.is_active && 'opacity-50')}>
              <span className="min-w-0 break-words">
                <span className="block font-medium text-espresso">{r.name}{r.kind === 'transfer' ? ` · ${L('تحويل للادخار', 'Auto-save')}` : ''}</span>
                <span className="block text-xs text-ink-70">
                  {L(`يوم ${r.day_of_month} كل شهر`, `Day ${r.day_of_month} monthly`)} ·{' '}
                  {r.kind === 'transfer'
                    ? `${(r.wallet_id && walletById.get(r.wallet_id)?.name) || ''} → ${(r.to_wallet_id && walletById.get(r.to_wallet_id)?.name) || ''}`
                    : `${(r.category_id && catById.get(r.category_id)?.name) || L('بدون تصنيف', 'Uncategorized')} · ${(r.wallet_id && walletById.get(r.wallet_id)?.name) || ''}`}
                </span>
              </span>
              <span className="flex shrink-0 flex-col items-end gap-1">
                <span className="font-latin font-semibold">{formatEGP(r.amount)}</span>
                <span className="flex gap-2">
                  <button className="text-xs text-gold underline" onClick={() => startEdit(r)}>{L('تعديل', 'Edit')}</button>
                  <button className="text-xs text-ink-70 underline" onClick={() => toggle.mutate(r)}>{r.is_active ? L('إيقاف', 'Pause') : L('تشغيل', 'Resume')}</button>
                  <button
                    className="text-xs text-danger underline"
                    onClick={() => { if (window.confirm(L('تمسح الثابت ده؟ اللي اتسجّل قبل كده هيفضل.', 'Delete? Past entries stay.'))) del.mutate(r.id); }}
                  >{L('مسح', 'Delete')}</button>
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}

      {editId ? (
        <Card><CardBody className="space-y-3 p-4">
          <div className="flex gap-2">
            {(['expense', 'transfer'] as const).map((k) => (
              <button
                key={k}
                onClick={() => setKind(k)}
                className={cn('flex-1 rounded-btn px-3 py-2 text-sm font-medium', kind === k ? 'bg-gold text-espresso' : 'bg-sand/60 text-ink-70')}
              >
                {k === 'expense' ? L('مصروف ثابت', 'Fixed expense') : L('ادخار تلقائي', 'Auto-save')}
              </button>
            ))}
          </div>
          <Input label={L('الاسم (مثلاً: إيجار المحل)', 'Name')} value={name} onChange={(e) => setName(e.target.value)} />
          <Input label={L('المبلغ كل شهر', 'Monthly amount')} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          {kind === 'expense' ? (
            <div>
              <label className="text-sm font-medium text-ink-70">{L('التصنيف', 'Category')}</label>
              <select className={cn(selectCls, 'mt-1')} value={catId} onChange={(e) => setCatId(e.target.value)}>
                <option value="">— {L('اختار', 'Select')} —</option>
                {d.categories.filter((c) => c.is_active && c.kind === 'expense').map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          ) : null}
          <div>
            <label className="text-sm font-medium text-ink-70">{kind === 'expense' ? L('بيتخصم من', 'Paid from') : L('بيتحوّل من', 'From')}</label>
            <select className={cn(selectCls, 'mt-1')} value={walletId || main?.id || ''} onChange={(e) => setWalletId(e.target.value)}>
              {d.wallets.filter((w) => w.is_active).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
          {kind === 'transfer' ? (
            <div>
              <label className="text-sm font-medium text-ink-70">{L('إلى (الادخار أو التطوير)', 'To')}</label>
              <select className={cn(selectCls, 'mt-1')} value={toId} onChange={(e) => setToId(e.target.value)}>
                <option value="">— {L('اختار', 'Select')} —</option>
                {d.wallets.filter((w) => w.is_active).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </div>
          ) : null}
          <Input label={L('يوم الشهر (1–31)', 'Day of month')} inputMode="numeric" value={day} onChange={(e) => setDay(e.target.value)} />
          <Input type="date" label={L('يبدأ من', 'Starts')} value={start} onChange={(e) => setStart(e.target.value)} />
          <div className="flex gap-2">
            <Button variant="secondary" className="w-full" onClick={() => setEditId(null)}>{L('إلغاء', 'Cancel')}</Button>
            <Button className="w-full" loading={save.isPending} onClick={() => save.mutate(undefined as never)}>{L('حفظ', 'Save')}</Button>
          </div>
        </CardBody></Card>
      ) : null}
    </div>
  );
}

/* ───────────── اتجاه آخر 6 شهور ───────────── */
function Trend({ d }: { d: FinData }) {
  const { L } = useLang();
  const months = useMemo(() => {
    const out: string[] = [];
    const [y0 = 2026, m0 = 1] = todayCairo().slice(0, 7).split('-').map(Number);
    for (let i = 5; i >= 0; i--) {
      const t = new Date(Date.UTC(y0, m0 - 1 - i, 1));
      out.push(`${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}`);
    }
    return out;
  }, []);
  const q = useQuery({
    queryKey: ['fin-month', 'trend', months[0]],
    retry: false,
    queryFn: async () => Promise.all(months.map((m) => fetchIncome(monthBounds(m).from, monthBounds(m).to))),
  });
  const catById = new Map<string, Category>(d.categories.map((c): [string, Category] => [c.id, c]));
  const rows = months.map((m, i) => {
    const { from, to } = monthBounds(m);
    let exp = 0;
    let extra = 0;
    for (const t of d.txs) {
      if (t.tx_date < from || t.tx_date > to) continue;
      if (t.kind === 'income') extra += t.amount;
      else if (t.kind === 'expense') {
        const b = (t.category_id && catById.get(t.category_id)?.bucket) || 'other';
        if (b !== 'owner_draw') exp += t.amount;
      }
    }
    const inc = (q.data?.[i]?.grand_total ?? 0) + extra;
    return { m, inc, exp, net: inc - exp };
  });
  const max = Math.max(1, ...rows.flatMap((r) => [r.inc, r.exp]));
  const cur = rows[rows.length - 1];
  const prev = rows[rows.length - 2];
  const delta = cur && prev && prev.net !== 0 ? Math.round(((cur.net - prev.net) / Math.abs(prev.net)) * 100) : null;

  return (
    <section className="space-y-2">
      <h2 className="text-lg font-bold text-espresso">{L('آخر 6 شهور', 'Last 6 months')}</h2>
      {delta !== null ? (
        <p className="text-sm text-ink-70">
          {L('صافي الربح مقارنة بالشهر اللي فات:', 'Net vs last month:')}{' '}
          <span className={cn('font-latin font-bold', delta >= 0 ? 'text-green-700' : 'text-danger')}>{delta > 0 ? '+' : ''}{delta}%</span>
        </p>
      ) : null}
      <div className="rounded-card border border-default bg-white p-3">
        <div className="flex h-36 items-end justify-between gap-1.5" dir="ltr">
          {rows.map((r) => (
            <div key={r.m} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
              <div className="flex h-full w-full items-end justify-center gap-0.5">
                <div className="w-1/2 max-w-4 rounded-t bg-gold" style={{ height: `${Math.max(2, (r.inc / max) * 100)}%` }} title={`${L('دخل', 'Income')} ${r.inc}`} />
                <div className="w-1/2 max-w-4 rounded-t bg-bark/50" style={{ height: `${Math.max(2, (r.exp / max) * 100)}%` }} title={`${L('مصروف', 'Expenses')} ${r.exp}`} />
              </div>
              <span className="font-latin text-[10px] text-ink-70">{r.m.slice(5)}</span>
            </div>
          ))}
        </div>
        <div className="mt-2 flex gap-4 text-xs text-ink-70">
          <span className="flex items-center gap-1"><span className="size-2.5 rounded-sm bg-gold" />{L('الدخل', 'Income')}</span>
          <span className="flex items-center gap-1"><span className="size-2.5 rounded-sm bg-bark/50" />{L('المصروفات', 'Expenses')}</span>
        </div>
        <ul className="mt-2 divide-y divide-bark/10 text-xs">
          {[...rows].reverse().map((r) => (
            <li key={r.m} className="flex items-center justify-between gap-2 py-1.5">
              <span className="font-latin">{r.m}</span>
              <span className={cn('font-latin font-semibold', r.net >= 0 ? 'text-espresso' : 'text-danger')}>{L('صافي', 'Net')} {formatEGP(r.net)}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ───────────── الميزانية وتقسيم الربح ───────────── */
function BudgetTab({ d }: { d: FinData }) {
  const { L } = useLang();
  const main = d.wallets.find((w) => w.is_main) ?? d.wallets[0];
  const [ym, setYm] = useState(todayCairo().slice(0, 7));
  const { from, to } = monthBounds(ym);
  const incomeQ = useQuery({ queryKey: ['fin-month', from, to], queryFn: () => fetchIncome(from, to), retry: false });

  const expenseCats = d.categories.filter((c) => c.kind === 'expense' && c.is_active);
  const spent = new Map<string, number>();
  let expTotal = 0;
  let extraIncome = 0;
  for (const t of d.txs) {
    if (t.tx_date < from || t.tx_date > to) continue;
    if (t.kind === 'income') extraIncome += t.amount;
    if (t.kind !== 'expense' || !t.category_id) continue;
    spent.set(t.category_id, (spent.get(t.category_id) ?? 0) + t.amount);
  }
  const bucketOf = new Map<string, Bucket>(d.categories.map((c): [string, Bucket] => [c.id, c.bucket]));
  for (const t of d.txs) {
    if (t.kind === 'expense' && t.tx_date >= from && t.tx_date <= to && (t.category_id ? bucketOf.get(t.category_id) : 'other') !== 'owner_draw') expTotal += t.amount;
  }
  const net = (incomeQ.data?.grand_total ?? 0) + extraIncome - expTotal;

  // الميزانية
  const [edits, setEdits] = useState<Record<string, string>>({});
  const budgetOf = (id: string) => (edits[id] !== undefined ? Number(edits[id]) || 0 : d.budgets.get(id) ?? 0);
  const totalBudget = expenseCats.filter((c) => c.bucket !== 'owner_draw').reduce((s, c) => s + budgetOf(c.id), 0);
  const saveBudget = useFinMutation(
    async () => {
      const rows = Object.entries(edits).map(([category_id, v]) => ({ category_id, amount: Math.max(0, Number(v) || 0) }));
      if (rows.length === 0) throw bad('مفيش تعديلات');
      const { error } = await untypedDb.from('fin_budgets').upsert(rows);
      if (error) throw error;
    },
    L('اتحفظت الميزانية', 'Budget saved'),
    () => setEdits({}),
  );

  // تقسيم الربح
  const [alloc, setAlloc] = useState<AllocItem[]>(d.settings?.alloc ?? []);
  const pctSum = alloc.reduce((s, a) => s + (Number(a.pct) || 0), 0);
  const targetWallet = (a: AllocItem): Wallet | undefined => {
    if (a.wallet_id) return d.wallets.find((w) => w.id === a.wallet_id);
    if (a.kind === 'savings' || a.kind === 'development') return d.wallets.find((w) => w.kind === a.kind && w.is_active);
    return undefined;
  };
  const saveAlloc = useFinMutation(async () => {
    if (pctSum > 100) throw bad('مجموع النسب أكبر من 100%');
    const { error } = await untypedDb.from('fin_settings').update({ alloc }).eq('id', 1);
    if (error) throw error;
  }, L('اتحفظ التقسيم', 'Split saved'));
  const moveNow = useFinMutation(async (a: AllocItem) => {
    const w = targetWallet(a);
    const amt = Math.floor((net * (Number(a.pct) || 0)) / 100);
    if (!main || !w || amt <= 0) throw bad('مفيش محفظة هدف أو الربح صفر');
    const { error } = await untypedDb.from('fin_transactions').insert({
      tx_date: todayCairo(), kind: 'transfer', amount: amt, wallet_id: main.id, to_wallet_id: w.id, note: `تقسيم ربح ${ym}: ${a.name}`,
    });
    if (error) throw error;
  }, L('اتحوّل', 'Transferred'));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h2 className="text-lg font-bold text-espresso">{L('الميزانية', 'Budget')}</h2>
        <Input type="month" label={L('الشهر', 'Month')} value={ym} onChange={(e) => e.target.value && setYm(e.target.value)} />
      </div>

      {!d.extraReady ? (
        <p className="rounded-btn bg-sand/50 p-3 text-sm">{L('محتاج تشغّل ملف finance-f3-f4.sql في Supabase الأول.', 'Run finance-f3-f4.sql first.')}</p>
      ) : (
        <>
          <section className="space-y-2">
            <p className="text-sm text-ink-70">
              {L('حط حد شهري لكل تصنيف، والنظام يحذّرك لما تقرّب منه.', 'Set a monthly limit per category.')}
            </p>
            <ul className="divide-y divide-bark/10 rounded-card border border-default bg-white">
              {expenseCats.filter((c) => c.bucket !== 'owner_draw').map((c) => {
                const sp = spent.get(c.id) ?? 0;
                const b = budgetOf(c.id);
                const ratio = b > 0 ? sp / b : 0;
                return (
                  <li key={c.id} className="space-y-1.5 p-3">
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="min-w-0 break-words font-medium text-espresso">{c.name}</span>
                      <span className="w-24 shrink-0">
                        <input
                          inputMode="decimal"
                          aria-label={L('الميزانية', 'Budget')}
                          placeholder="0"
                          value={edits[c.id] ?? (d.budgets.get(c.id) ? String(d.budgets.get(c.id)) : '')}
                          onChange={(e) => setEdits((p) => ({ ...p, [c.id]: e.target.value }))}
                          className="min-h-9 w-full rounded-btn border border-bark/20 bg-white px-2 text-center font-latin text-sm"
                        />
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-sand/60">
                      <div
                        className={cn('h-full rounded-full', ratio > 1 ? 'bg-danger' : ratio > 0.8 ? 'bg-amber-500' : 'bg-gold')}
                        style={{ width: `${Math.min(100, Math.max(sp > 0 ? 3 : 0, ratio * 100))}%` }}
                      />
                    </div>
                    <p className={cn('text-xs', ratio > 1 ? 'font-semibold text-danger' : 'text-ink-70')}>
                      {L('صرفت', 'Spent')} <span className="font-latin">{formatEGP(sp)}</span>
                      {b > 0 ? <> {L('من', 'of')} <span className="font-latin">{formatEGP(b)}</span>{ratio > 1 ? ` · ${L('تعدّيت الميزانية', 'over budget')}` : ratio > 0.8 ? ` · ${L('قربت تخلص', 'almost used')}` : ''}</> : null}
                    </p>
                  </li>
                );
              })}
            </ul>
            <p className="text-sm text-ink-70">
              {L('إجمالي الميزانية:', 'Total budget:')} <span className="font-latin font-bold text-espresso">{formatEGP(totalBudget)}</span> · {L('المصروف الفعلي:', 'Spent:')}{' '}
              <span className="font-latin font-bold text-espresso">{formatEGP(expTotal)}</span>
            </p>
            <Button className="w-full" loading={saveBudget.isPending} disabled={Object.keys(edits).length === 0} onClick={() => saveBudget.mutate(undefined as never)}>
              {L('حفظ الميزانية', 'Save budget')}
            </Button>
          </section>

          <section className="space-y-3">
            <div>
              <h2 className="text-lg font-bold text-espresso">{L('تقسيم صافي الربح', 'Profit split')}</h2>
              <p className="text-xs text-ink-70">
                {L('نسب مقترحة (ادخار 20% · تطوير 10% · طوارئ 10% · مالك 60%) تقدر تعدّلها. صافي ربح الشهر:', 'Suggested split, editable. Net profit:')}{' '}
                <span className="font-latin font-bold text-espresso">{formatEGP(net)}</span>
              </p>
            </div>
            <ul className="space-y-2">
              {alloc.map((a, i) => {
                const amt = Math.max(0, Math.floor((net * (Number(a.pct) || 0)) / 100));
                const tw = targetWallet(a);
                return (
                  <li key={a.id} className="space-y-2 rounded-card border border-default bg-white p-3">
                    <div className="flex items-end gap-2">
                      <div className="min-w-0 flex-1">
                        <Input label={L('الاسم', 'Name')} value={a.name} onChange={(e) => setAlloc((p) => p.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                      </div>
                      <div className="w-20 shrink-0">
                        <Input label="%" inputMode="decimal" value={String(a.pct)} onChange={(e) => setAlloc((p) => p.map((x, j) => (j === i ? { ...x, pct: Number(e.target.value) || 0 } : x)))} />
                      </div>
                      <button className="mb-2 px-1 text-danger" aria-label={L('مسح', 'Remove')} onClick={() => setAlloc((p) => p.filter((_, j) => j !== i))}>✕</button>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="font-latin font-bold text-espresso">{formatEGP(amt)}</span>
                      {a.kind !== 'owner' ? (
                        <span className="flex min-w-0 items-center gap-2">
                          <select
                            className="min-h-9 min-w-0 rounded-btn border border-bark/20 bg-white px-2 text-xs"
                            value={a.wallet_id ?? tw?.id ?? ''}
                            onChange={(e) => setAlloc((p) => p.map((x, j) => (j === i ? { ...x, wallet_id: e.target.value || null } : x)))}
                          >
                            <option value="">{L('بدون محفظة', 'No wallet')}</option>
                            {d.wallets.filter((w) => w.is_active).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                          </select>
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={!tw || amt <= 0}
                            onClick={() => { if (window.confirm(L(`تحوّل ${amt} جنيه لـ ${tw?.name ?? ''}؟`, `Transfer ${amt} to ${tw?.name ?? ''}?`))) moveNow.mutate(a); }}
                          >{L('حوّل', 'Move')}</Button>
                        </span>
                      ) : <span className="text-xs text-ink-70">{L('بتسحبها لنفسك (سحب المالك)', 'Your draw')}</span>}
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className="flex items-center justify-between gap-2">
              <Button size="sm" variant="secondary" onClick={() => setAlloc((p) => [...p, { id: `a${Date.now()}`, name: '', pct: 0, kind: 'other' }])}>{L('+ بند', '+ Item')}</Button>
              <span className={cn('text-sm font-semibold', pctSum > 100 ? 'text-danger' : 'text-ink-70')}>{L('المجموع', 'Total')}: <span className="font-latin">{pctSum}%</span></span>
            </div>
            <Button className="w-full" loading={saveAlloc.isPending} onClick={() => saveAlloc.mutate(undefined as never)}>{L('حفظ التقسيم', 'Save split')}</Button>
          </section>
        </>
      )}
    </div>
  );
}

/* ───────────── المخزون ───────────── */
function InventoryTab({ d }: { d: FinData }) {
  const { L } = useLang();
  const main = d.wallets.find((w) => w.is_main) ?? d.wallets[0];
  const supplyCat = d.categories.find((c) => c.kind === 'expense' && c.bucket === 'operating' && c.name.includes('مستلزمات'));
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('قطعة');
  const [minQty, setMinQty] = useState('0');
  const [openQty, setOpenQty] = useState('0');
  const [mv, setMv] = useState<{ id: string; sign: 1 | -1 } | null>(null);
  const [qty, setQty] = useState('');
  const [cost, setCost] = useState('');
  const [note, setNote] = useState('');
  const [asExpense, setAsExpense] = useState(true);

  const startEdit = (it: StockItem | null) => {
    setEditId(it ? it.id : 'new');
    setName(it?.name ?? '');
    setUnit(it?.unit ?? 'قطعة');
    setMinQty(String(it?.min_qty ?? 0));
    setOpenQty('0');
  };
  const saveItem = useFinMutation(
    async () => {
      if (!name.trim()) throw bad('اكتب اسم الصنف');
      const row = { name: name.trim(), unit: unit.trim() || 'قطعة', min_qty: Math.max(0, Number(minQty) || 0) };
      if (editId === 'new') {
        const r = await untypedDb.from('fin_items').insert(row).select('id').single();
        if (r.error) throw r.error;
        const q = Number(openQty) || 0;
        if (q > 0) {
          const m = await untypedDb.from('fin_item_moves').insert({ item_id: (r.data as { id: string }).id, delta: q, note: 'رصيد افتتاحي' });
          if (m.error) throw m.error;
        }
      } else {
        const r = await untypedDb.from('fin_items').update(row).eq('id', editId as string);
        if (r.error) throw r.error;
      }
    },
    L('اتحفظ', 'Saved'),
    () => setEditId(null),
  );
  const toggle = useFinMutation(async (it: StockItem) => {
    const { error } = await untypedDb.from('fin_items').update({ is_active: !it.is_active }).eq('id', it.id);
    if (error) throw error;
  }, L('تمام', 'Done'));
  const move = useFinMutation(
    async () => {
      if (!mv) return;
      const q = Number(qty);
      if (!(q > 0)) throw bad('اكتب الكمية');
      const m = await untypedDb.from('fin_item_moves').insert({ item_id: mv.id, delta: mv.sign * q, note: note.trim() || null });
      if (m.error) throw m.error;
      const c = Number(cost);
      if (mv.sign === 1 && c > 0) {
        await untypedDb.from('fin_items').update({ last_cost: c / q }).eq('id', mv.id);
        if (asExpense && main) {
          const t = await untypedDb.from('fin_transactions').insert({
            tx_date: todayCairo(), kind: 'expense', amount: c, wallet_id: main.id, category_id: supplyCat?.id ?? null,
            note: `شراء مخزون: ${d.items.find((i) => i.id === mv.id)?.name ?? ''}`,
          });
          if (t.error) throw t.error;
        }
      }
    },
    L('اتسجّلت الحركة', 'Recorded'),
    () => { setMv(null); setQty(''); setCost(''); setNote(''); },
  );

  if (!d.extraReady) {
    return <p className="rounded-btn bg-sand/50 p-3 text-sm">{L('محتاج تشغّل ملف finance-f3-f4.sql في Supabase الأول.', 'Run finance-f3-f4.sql first.')}</p>;
  }
  const low = d.items.filter((i) => i.is_active && i.qty <= i.min_qty);
  const stockValue = d.items.filter((i) => i.is_active).reduce((s, i) => s + Math.max(0, i.qty) * i.last_cost, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold text-espresso">{L('المخزون والمستلزمات', 'Inventory')}</h2>
          <p className="text-xs text-ink-70">{L('شفرات، شامبو، فوط... سجّل الشراء والاستهلاك وهيتنبّه لما يقل.', 'Track supplies; get a warning when low.')}</p>
        </div>
        <Button size="sm" variant="secondary" onClick={() => startEdit(null)}>{L('+ صنف', '+ Item')}</Button>
      </div>
      {low.length > 0 ? (
        <p className="rounded-btn border border-danger/30 bg-danger/5 p-3 text-sm text-danger">
          ⚠️ {L('قرّب يخلص:', 'Running low:')} {low.map((i) => i.name).join('، ')}
        </p>
      ) : null}
      <p className="text-sm text-ink-70">{L('قيمة المخزون تقريباً:', 'Approx. stock value:')} <span className="font-latin font-bold text-espresso">{formatEGP(stockValue)}</span></p>

      {d.items.length === 0 ? (
        <p className="text-sm text-ink-70">{L('لسه مفيش أصناف.', 'No items yet.')}</p>
      ) : (
        <ul className="divide-y divide-bark/10 rounded-card border border-default bg-white">
          {d.items.map((it) => {
            const isLow = it.qty <= it.min_qty;
            return (
              <li key={it.id} className={cn('space-y-2 p-3 text-sm', !it.is_active && 'opacity-50')}>
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0 break-words font-medium text-espresso">{it.name}</span>
                  <span className={cn('shrink-0 font-latin font-bold', isLow ? 'text-danger' : 'text-espresso')}>
                    {it.qty} <span className="text-xs font-normal">{it.unit}</span>
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <button className="rounded-btn bg-gold/20 px-2.5 py-1 font-medium" onClick={() => { setMv({ id: it.id, sign: 1 }); setQty(''); setCost(''); }}>+ {L('شراء', 'Buy')}</button>
                  <button className="rounded-btn bg-sand/60 px-2.5 py-1 font-medium" onClick={() => { setMv({ id: it.id, sign: -1 }); setQty(''); }}>− {L('استهلاك', 'Use')}</button>
                  <button className="text-gold underline" onClick={() => startEdit(it)}>{L('تعديل', 'Edit')}</button>
                  <button className="text-ink-70 underline" onClick={() => toggle.mutate(it)}>{it.is_active ? L('إخفاء', 'Hide') : L('إظهار', 'Show')}</button>
                  <span className="ms-auto text-ink-70">{L('الحد الأدنى', 'Min')} <span className="font-latin">{it.min_qty}</span></span>
                </div>
                {mv?.id === it.id ? (
                  <div className="space-y-2 rounded-btn bg-sand/30 p-3">
                    <Input label={mv.sign === 1 ? L('الكمية المشتراة', 'Quantity bought') : L('الكمية المستهلكة', 'Quantity used')} inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} />
                    {mv.sign === 1 ? (
                      <>
                        <Input label={L('إجمالي التكلفة (اختياري)', 'Total cost (optional)')} inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} />
                        <label className="flex items-center gap-2 text-xs text-ink-70">
                          <input type="checkbox" className="size-4 accent-[#c9953f]" checked={asExpense} onChange={(e) => setAsExpense(e.target.checked)} />
                          {L('سجّلها كمصروف من درج الكاش', 'Also record as an expense')}
                        </label>
                      </>
                    ) : null}
                    <Input label={L('ملاحظة', 'Note')} value={note} onChange={(e) => setNote(e.target.value)} />
                    <div className="flex gap-2">
                      <Button variant="secondary" className="w-full" onClick={() => setMv(null)}>{L('إلغاء', 'Cancel')}</Button>
                      <Button className="w-full" loading={move.isPending} onClick={() => move.mutate(undefined as never)}>{L('تسجيل', 'Save')}</Button>
                    </div>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {editId ? (
        <Card><CardBody className="space-y-3 p-4">
          <Input label={L('اسم الصنف', 'Item name')} value={name} onChange={(e) => setName(e.target.value)} />
          <Input label={L('الوحدة (قطعة، علبة، لتر...)', 'Unit')} value={unit} onChange={(e) => setUnit(e.target.value)} />
          <Input label={L('الحد الأدنى (نبّهني لما يقل عنه)', 'Alert when at or below')} inputMode="decimal" value={minQty} onChange={(e) => setMinQty(e.target.value)} />
          {editId === 'new' ? <Input label={L('الكمية الحالية', 'Current quantity')} inputMode="decimal" value={openQty} onChange={(e) => setOpenQty(e.target.value)} /> : null}
          <div className="flex gap-2">
            <Button variant="secondary" className="w-full" onClick={() => setEditId(null)}>{L('إلغاء', 'Cancel')}</Button>
            <Button className="w-full" loading={saveItem.isPending} onClick={() => saveItem.mutate(undefined as never)}>{L('حفظ', 'Save')}</Button>
          </div>
        </CardBody></Card>
      ) : null}
    </div>
  );
}
