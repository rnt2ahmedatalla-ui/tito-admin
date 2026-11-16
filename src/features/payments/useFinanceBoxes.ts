import { useQuery } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

export type FinanceBox = { id: string; name: string; pct: number };

/** الجدول جديد ومش في ملف الأنواع، فبنستخدم العميل بدون أنواع هنا بس */
export const untypedDb = supabase as unknown as SupabaseClient;

export function sanitizeBoxes(raw: unknown): FinanceBox[] {
  if (!Array.isArray(raw)) return [];
  const out: FinanceBox[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    const name = typeof r.name === 'string' ? r.name.trim().slice(0, 30) : '';
    const pct = Number(r.pct);
    if (!name || !Number.isFinite(pct) || pct < 0 || pct > 100) continue;
    out.push({
      id: typeof r.id === 'string' && r.id ? r.id : `box-${out.length + 1}`,
      name,
      pct,
    });
  }
  return out;
}

export function useFinanceBoxes() {
  return useQuery({
    queryKey: ['finance-boxes'],
    queryFn: async (): Promise<FinanceBox[]> => {
      const { data, error } = await untypedDb
        .from('admin_finance_boxes')
        .select('boxes')
        .eq('id', 1)
        .maybeSingle();
      if (error) throw error;
      return sanitizeBoxes((data as { boxes?: unknown } | null)?.boxes);
    },
    retry: false,
    staleTime: 30_000,
  });
}

/** كل صندوق = نسبته من الإجمالي، والباقي = الإجمالي ناقص مجموع الصناديق */
export function computeBoxes(total: number, boxes: FinanceBox[]) {
  const items = boxes.map((b) => ({ ...b, amount: Math.round((total * b.pct) / 100) }));
  const used = items.reduce((sum, b) => sum + b.amount, 0);
  const pctSum = boxes.reduce((sum, b) => sum + b.pct, 0);
  return {
    items,
    remainderAmount: total - used,
    remainderPct: Math.max(0, Math.round((100 - pctSum) * 100) / 100),
  };
}
