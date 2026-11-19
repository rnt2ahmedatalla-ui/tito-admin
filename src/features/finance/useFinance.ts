import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { untypedDb } from '@/features/payments/useFinanceBoxes';
import { cairoDateString } from '@/lib/time';

export type WalletKind = 'cash' | 'ewallet' | 'bank' | 'savings' | 'development' | 'other';
export type Wallet = {
  id: string;
  name: string;
  kind: WalletKind;
  opening_balance: number;
  is_main: boolean;
  is_active: boolean;
  sort: number;
};
export type Bucket = 'operating' | 'development' | 'owner_draw' | 'other';
export type Category = { id: string; name: string; kind: 'expense' | 'income'; bucket: Bucket; is_active: boolean; sort: number };
export type Tx = {
  id: string;
  tx_date: string;
  kind: 'expense' | 'income' | 'transfer' | 'adjust';
  amount: number;
  wallet_id: string | null;
  to_wallet_id: string | null;
  category_id: string | null;
  note: string | null;
};
export type FinSettings = { tracking_start: string; cash_wallet_id: string | null; online_wallet_id: string | null };
export type Closing = {
  id: string;
  close_date: string;
  expected_cash: number;
  counted_cash: number;
  diff: number;
  note: string | null;
};
export type IncomeSummary = { online: number; cash: number; products: number; grand_total: number; bookings_count: number };

export const BUCKET_LABEL: Record<Bucket, { ar: string; en: string }> = {
  operating: { ar: 'تشغيل', en: 'Operating' },
  development: { ar: 'تطوير', en: 'Development' },
  owner_draw: { ar: 'سحب المالك', en: 'Owner draw' },
  other: { ar: 'أخرى', en: 'Other' },
};
export const KIND_LABEL: Record<WalletKind, { ar: string; en: string }> = {
  cash: { ar: 'كاش', en: 'Cash' },
  ewallet: { ar: 'محفظة إلكترونية', en: 'E-wallet' },
  bank: { ar: 'بنك', en: 'Bank' },
  savings: { ar: 'ادخار', en: 'Savings' },
  development: { ar: 'تطوير', en: 'Development' },
  other: { ar: 'أخرى', en: 'Other' },
};

const num = (v: unknown) => Number(v ?? 0) || 0;

export function todayCairo() {
  return cairoDateString(new Date());
}

export async function fetchIncome(from: string, to: string): Promise<IncomeSummary> {
  const { data, error } = await supabase.rpc('admin_finance_summary', { p_from: from, p_to: to });
  if (error) throw error;
  const s = (data ?? {}) as Record<string, unknown>;
  return {
    online: num(s.online),
    cash: num(s.cash),
    products: num(s.products),
    grand_total: num(s.grand_total),
    bookings_count: num(s.bookings_count),
  };
}

export function useFinData() {
  return useQuery({
    queryKey: ['fin-data'],
    retry: false,
    staleTime: 10_000,
    queryFn: async () => {
      const [w, c, t, s, cl] = await Promise.all([
        untypedDb.from('fin_wallets').select('*').order('sort'),
        untypedDb.from('fin_categories').select('*').order('sort'),
        untypedDb.from('fin_transactions').select('*').order('tx_date', { ascending: false }).order('created_at', { ascending: false }).limit(5000),
        untypedDb.from('fin_settings').select('*').eq('id', 1).maybeSingle(),
        untypedDb.from('fin_closings').select('*').order('close_date', { ascending: false }).limit(60),
      ]);
      for (const r of [w, c, t, s, cl]) if (r.error) throw r.error;
      const wallets = ((w.data ?? []) as Array<Record<string, unknown>>).map((r) => ({
        id: String(r.id), name: String(r.name), kind: r.kind as WalletKind, opening_balance: num(r.opening_balance),
        is_main: !!r.is_main, is_active: !!r.is_active, sort: num(r.sort),
      })) as Wallet[];
      const categories = ((c.data ?? []) as Array<Record<string, unknown>>).map((r) => ({
        id: String(r.id), name: String(r.name), kind: r.kind as 'expense' | 'income', bucket: r.bucket as Bucket,
        is_active: !!r.is_active, sort: num(r.sort),
      })) as Category[];
      const txs = ((t.data ?? []) as Array<Record<string, unknown>>).map((r) => ({
        id: String(r.id), tx_date: String(r.tx_date), kind: r.kind as Tx['kind'], amount: num(r.amount),
        wallet_id: (r.wallet_id as string | null) ?? null, to_wallet_id: (r.to_wallet_id as string | null) ?? null,
        category_id: (r.category_id as string | null) ?? null, note: (r.note as string | null) ?? null,
      })) as Tx[];
      const sr = s.data as Record<string, unknown> | null;
      const settings: FinSettings | null = sr
        ? { tracking_start: String(sr.tracking_start), cash_wallet_id: (sr.cash_wallet_id as string | null) ?? null, online_wallet_id: (sr.online_wallet_id as string | null) ?? null }
        : null;
      const closings = ((cl.data ?? []) as Array<Record<string, unknown>>).map((r) => ({
        id: String(r.id), close_date: String(r.close_date), expected_cash: num(r.expected_cash),
        counted_cash: num(r.counted_cash), diff: num(r.diff), note: (r.note as string | null) ?? null,
      })) as Closing[];
      const income = settings ? await fetchIncome(settings.tracking_start, todayCairo()) : null;
      return { wallets, categories, txs, settings, closings, income };
    },
  });
}

export type FinData = NonNullable<ReturnType<typeof useFinData>['data']>;

/** رصيد كل محفظة = رصيد افتتاحي + الدخل الآلي (من الحجوزات) + الحركات اليدوية */
export function computeBalances(d: FinData): Map<string, number> {
  const bal = new Map<string, number>();
  d.wallets.forEach((w) => bal.set(w.id, w.opening_balance));
  const add = (id: string | null, v: number) => {
    if (id && bal.has(id)) bal.set(id, (bal.get(id) ?? 0) + v);
  };
  if (d.settings && d.income) {
    add(d.settings.cash_wallet_id, d.income.cash + d.income.products);
    add(d.settings.online_wallet_id, d.income.online);
  }
  for (const t of d.txs) {
    if (t.kind === 'income') add(t.wallet_id, t.amount);
    else if (t.kind === 'expense') add(t.wallet_id, -t.amount);
    else if (t.kind === 'adjust') add(t.wallet_id, t.amount);
    else if (t.kind === 'transfer') {
      add(t.wallet_id, -t.amount);
      add(t.to_wallet_id, t.amount);
    }
  }
  return bal;
}

export function monthBounds(ym: string) {
  const [y = 0, m = 1] = ym.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const mm = String(m).padStart(2, '0');
  return { from: `${y}-${mm}-01`, to: `${y}-${mm}-${String(last).padStart(2, '0')}` };
}
