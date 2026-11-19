import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Card, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { untypedDb } from '@/features/payments/useFinanceBoxes';
import { supabase } from '@/lib/supabase';
import { formatCairoDateShort, formatCairoTime } from '@/lib/time';
import { cn } from '@/lib/cn';

type Row = { id: number; at: string; table_name: string; op: 'INSERT' | 'UPDATE' | 'DELETE'; row_id: string | null; changes: Record<string, unknown> | null };

const TABLE_AR: Record<string, string> = {
  bookings: 'حجز', payments: 'دفعة', services: 'خدمة', staff: 'حلاق', working_hours: 'مواعيد العمل', recurring_breaks: 'استراحة',
  time_off: 'إجازة', settings: 'إعدادات المحل', coupons: 'كوبون', products: 'منتج', packages: 'باقة', customer_packages: 'باقة عميل',
  feature_settings: 'مفاتيح المميزات', loyalty_settings: 'إعدادات النقاط', fin_transactions: 'حركة مالية', fin_wallets: 'محفظة',
  fin_categories: 'تصنيف مالي', fin_settings: 'إعدادات المالية', fin_recurring: 'مصروف ثابت', fin_assets: 'أصل/معدة', fin_items: 'صنف مخزون',
  customer_notes: 'ملاحظة عميل',
};
const OP_AR = { INSERT: 'إضافة', UPDATE: 'تعديل', DELETE: 'حذف' } as const;
const OP_EN = { INSERT: 'Added', UPDATE: 'Changed', DELETE: 'Deleted' } as const;
const OP_CLS = { INSERT: 'bg-emerald-100 text-emerald-800', UPDATE: 'bg-sky-100 text-sky-800', DELETE: 'bg-danger/15 text-danger' } as const;

const short = (v: unknown) => {
  if (v === null || v === undefined) return '∅';
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  return s.length > 40 ? s.slice(0, 40) + '…' : s;
};

function summarize(r: Row): string {
  const c = r.changes ?? {};
  const keys = Object.keys(c);
  if (r.op === 'UPDATE') {
    return keys
      .slice(0, 4)
      .map((k) => {
        const pair = c[k] as unknown[];
        return `${k}: ${short(pair?.[0])} ← ${short(pair?.[1])}`;
      })
      .join(' · ') + (keys.length > 4 ? ` +${keys.length - 4}` : '');
  }
  const name = (c.name_ar ?? c.name ?? c.full_name ?? c.code ?? c.note) as unknown;
  return name ? short(name) : keys.slice(0, 4).join('، ');
}

export function AuditPage() {
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith('ar');
  const L = (ar: string, en: string) => (isAr ? ar : en);
  const [limit, setLimit] = useState(60);
  const [table, setTable] = useState('');

  const q = useQuery({
    queryKey: ['audit-log', limit, table],
    retry: false,
    queryFn: async (): Promise<Row[]> => {
      let query = untypedDb.from('audit_log').select('id, at, table_name, op, row_id, changes').order('at', { ascending: false }).limit(limit);
      if (table) query = query.eq('table_name', table);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  // تنظيف السجلات الأقدم من 120 يوم (مرة واحدة عند فتح الصفحة) عشان قاعدة البيانات متكبرش
  useEffect(() => {
    const rpc = supabase.rpc.bind(supabase) as unknown as (fn: string, args?: Record<string, unknown>) => Promise<unknown>;
    void rpc('admin_prune_audit', { p_days: 120 });
  }, []);

  const tables = useMemo(() => Object.keys(TABLE_AR), []);
  if (q.isError) {
    return <p className="rounded-btn bg-sand/50 p-3 text-sm">{L('محتاج تشغّل ملف features-v33.sql في Supabase الأول.', 'Run features-v33.sql in Supabase first.')}</p>;
  }
  const rows = q.data ?? [];

  return (
    <div className="w-full min-w-0 max-w-full space-y-4 overflow-x-clip">
      <h1 className="text-xl font-bold text-espresso">{L('سجل العمليات', 'Activity log')}</h1>
      <p className="text-sm text-ink-70">{L('كل تعديل عملته في النظام: إيه اللي اتغير ومتى. بيتمسح تلقائي بعد 120 يوم.', 'Every change you made: what changed and when. Auto-cleaned after 120 days.')}</p>
      <select
        value={table}
        onChange={(e) => { setTable(e.target.value); setLimit(60); }}
        className="min-h-11 w-full rounded-btn border border-bark/20 bg-white px-3 text-sm text-espresso sm:w-72"
      >
        <option value="">{L('كل الأنواع', 'All types')}</option>
        {tables.map((t) => (
          <option key={t} value={t}>{isAr ? TABLE_AR[t] : t}</option>
        ))}
      </select>

      {q.isLoading ? (
        <Skeleton className="h-40" />
      ) : rows.length === 0 ? (
        <p className="py-10 text-center text-ink-70">{L('مفيش عمليات مسجلة لسه.', 'No activity yet.')}</p>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <Card key={r.id}>
              <CardBody className="space-y-1.5 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className={cn('rounded-pill px-2 py-0.5 text-xs font-semibold', OP_CLS[r.op])}>{isAr ? OP_AR[r.op] : OP_EN[r.op]}</span>
                    <span className="truncate font-semibold text-espresso">{isAr ? TABLE_AR[r.table_name] ?? r.table_name : r.table_name}</span>
                  </div>
                  <span className="font-latin text-xs text-ink-70">{formatCairoDateShort(r.at)} {formatCairoTime(r.at, i18n.language)}</span>
                </div>
                <p className="break-words font-latin text-xs text-ink-70" dir="ltr">{summarize(r)}</p>
              </CardBody>
            </Card>
          ))}
          {rows.length >= limit ? (
            <Button variant="secondary" className="w-full" onClick={() => setLimit((l) => l + 60)}>{L('عرض المزيد', 'Show more')}</Button>
          ) : null}
        </div>
      )}
    </div>
  );
}
