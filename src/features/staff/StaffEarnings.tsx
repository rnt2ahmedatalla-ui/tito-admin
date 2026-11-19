import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Star, Wallet } from 'lucide-react';
import { Card, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import { untypedDb } from '@/features/payments/useFinanceBoxes';
import { formatEGP } from '@/lib/money';
import { CAIRO_TZ } from '@/lib/time';
import { fromZonedTime } from 'date-fns-tz';
import { cn } from '@/lib/cn';
import { useStaff } from './StaffPage';

type B = {
  start_at: string;
  status: string;
  price_egp: number;
  staff_id: string | null;
  user_id: string | null;
  rate_token: string | null;
  service_name_ar: string | null;
  service_name_en: string | null;
};
type Comm = { id: string; commission_pct: number; base_salary: number };

/** بداية ونهاية شهر بتوقيت القاهرة (offset = 0 الشهر ده، -1 اللي فات) */
function monthRange(offset: number): { from: string; to: string; label: Date } {
  const nowCairo = new Date(new Date().toLocaleString('en-US', { timeZone: CAIRO_TZ }));
  const y = nowCairo.getFullYear();
  const m = nowCairo.getMonth() + offset;
  const start = new Date(y, m, 1, 0, 0, 0);
  const end = new Date(y, m + 1, 1, 0, 0, 0);
  return { from: fromZonedTime(start, CAIRO_TZ).toISOString(), to: fromZonedTime(end, CAIRO_TZ).toISOString(), label: start };
}

/** دخل كل حلاق: عدد الحلاقات، الإيراد، نسبته ومرتبه، التقييم والغياب. النسبة والمرتب بتتعدّل من هنا */
export function StaffEarnings() {
  const { i18n } = useTranslation();
  const isAr = !!i18n.language?.startsWith('ar');
  const L = (ar: string, en: string) => (isAr ? ar : en);
  const qc = useQueryClient();
  const staff = (useStaff().data ?? []).filter((m) => m.is_active);
  const [offset, setOffset] = useState(0);
  const [sel, setSel] = useState<string>('all');
  const [sort, setSort] = useState<'revenue' | 'cuts' | 'rating' | 'name'>('revenue');
  const range = useMemo(() => monthRange(offset), [offset]);
  const [edit, setEdit] = useState<Record<string, { pct: string; sal: string }>>({});

  const comm = useQuery({
    queryKey: ['staff-commission'],
    retry: false,
    queryFn: async (): Promise<Comm[]> => {
      const { data, error } = await untypedDb.from('staff').select('id, commission_pct, base_salary');
      if (error) throw error;
      return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
        id: String(r.id),
        commission_pct: Number(r.commission_pct ?? 0),
        base_salary: Number(r.base_salary ?? 0),
      }));
    },
  });

  const q = useQuery({
    queryKey: ['staff-earnings', range.from],
    staleTime: 60_000,
    queryFn: async () => {
      const rows: B[] = [];
      for (let p = 0; p < 10; p += 1) {
        const { data, error } = await untypedDb
          .from('bookings')
          .select('start_at, status, price_egp, staff_id, user_id, rate_token, service_name_ar, service_name_en')
          .gte('start_at', range.from)
          .lt('start_at', range.to)
          .order('start_at', { ascending: true })
          .range(p * 1000, p * 1000 + 999);
        if (error) throw error;
        const got = (data ?? []) as B[];
        rows.push(...got);
        if (got.length < 1000) break;
      }
      const rev = await untypedDb.from('reviews').select('rate_token, rating').gte('created_at', range.from).limit(3000);
      const ratings = new Map<string, number>();
      ((rev.data ?? []) as Array<{ rate_token: string | null; rating: number }>).forEach((r) => {
        if (r.rate_token) ratings.set(r.rate_token, r.rating);
      });
      return { rows, ratings };
    },
  });

  const ownerId = (useStaff().data ?? []).find((m) => m.is_owner)?.id ?? null;

  const save = useMutation({
    mutationFn: async (v: { id: string; pct: number; sal: number }) => {
      const { error } = await untypedDb.from('staff').update({ commission_pct: v.pct, base_salary: v.sal }).eq('id', v.id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      toast.success(L('اتحفظ', 'Saved'));
      setEdit((p) => {
        const n = { ...p };
        delete n[v.id];
        return n;
      });
      void qc.invalidateQueries({ queryKey: ['staff-commission'] });
    },
    onError: () => toast.error(L('معرفتش أحفظ. اتأكد إنك شغّلت ملف features-v35.sql.', 'Could not save. Make sure features-v35.sql was run.')),
  });

  const stats = useMemo(() => {
    const rows = q.data?.rows ?? [];
    return staff.map((m) => {
      const mine = rows.filter((b) => (b.staff_id ?? ownerId) === m.id);
      const done = mine.filter((b) => b.status === 'completed');
      const revenue = done.reduce((s, b) => s + Number(b.price_egp || 0), 0);
      const customers = new Set(done.map((b) => b.user_id).filter(Boolean)).size;
      const rs = mine.map((b) => (b.rate_token ? q.data?.ratings.get(b.rate_token) : undefined)).filter((x): x is number => typeof x === 'number');
      const svc = new Map<string, number>();
      done.forEach((b) => {
        const k = (isAr ? b.service_name_ar : b.service_name_en) ?? b.service_name_ar ?? '—';
        svc.set(k, (svc.get(k) ?? 0) + 1);
      });
      const top = [...svc.entries()].sort((a, b) => b[1] - a[1])[0];
      return {
        m,
        cuts: done.length,
        revenue,
        customers,
        avg: done.length ? revenue / done.length : 0,
        noShow: mine.filter((b) => b.status === 'no_show').length,
        cancelled: mine.filter((b) => b.status === 'cancelled').length,
        rating: rs.length ? rs.reduce((s, n) => s + n, 0) / rs.length : null,
        ratingCount: rs.length,
        top: top ? `${top[0]} (${top[1]})` : null,
      };
    });
  }, [q.data, staff, ownerId, isAr]);

  const shown = useMemo(() => {
    const list = sel === 'all' ? stats : stats.filter((x) => x.m.id === sel);
    const by = {
      revenue: (a: (typeof stats)[number], b: (typeof stats)[number]) => b.revenue - a.revenue,
      cuts: (a: (typeof stats)[number], b: (typeof stats)[number]) => b.cuts - a.cuts,
      rating: (a: (typeof stats)[number], b: (typeof stats)[number]) => (b.rating ?? -1) - (a.rating ?? -1),
      name: (a: (typeof stats)[number], b: (typeof stats)[number]) => a.m.name.localeCompare(b.m.name),
    }[sort];
    return [...list].sort(by);
  }, [stats, sel, sort]);

  if (staff.length === 0) return null;
  const monthName = range.label.toLocaleDateString(isAr ? 'ar-EG' : 'en-GB', { month: 'long', year: 'numeric' });

  return (
    <Card>
      <CardBody className="space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Wallet className="size-5 shrink-0 text-gold" aria-hidden />
            <h2 className="text-lg font-bold text-espresso">{L('دخل وأداء كل حلاق', 'Barber earnings & stats')}</h2>
          </div>
          <div className="flex gap-1.5">
            <Button size="sm" variant={offset === 0 ? 'primary' : 'secondary'} onClick={() => setOffset(0)}>{L('الشهر ده', 'This month')}</Button>
            <Button size="sm" variant={offset === -1 ? 'primary' : 'secondary'} onClick={() => setOffset(-1)}>{L('الشهر اللي فات', 'Last month')}</Button>
          </div>
        </div>
        <p className="text-xs text-ink-70">
          {monthName} — {L('الإيراد = أسعار الحلاقات اللي اتعملت فعلاً (حالة "تمت"). المستحق = المرتب الثابت + النسبة × الإيراد.', 'Revenue = completed bookings. Due = base salary + commission × revenue.')}
        </p>
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" variant={sel === 'all' ? 'primary' : 'secondary'} onClick={() => setSel('all')}>{L('الكل', 'All')}</Button>
          {staff.map((m) => (
            <Button key={m.id} size="sm" variant={sel === m.id ? 'primary' : 'secondary'} onClick={() => setSel(m.id)}>
              {m.name}
            </Button>
          ))}
        </div>
        {sel === 'all' && staff.length > 1 ? (
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-ink-70">
            <span>{L('الترتيب:', 'Sort:')}</span>
            {([['revenue', L('الإيراد', 'Revenue')], ['cuts', L('عدد الحلاقات', 'Cuts')], ['rating', L('التقييم', 'Rating')], ['name', L('الاسم', 'Name')]] as const).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setSort(k)}
                className={cn('min-h-8 rounded-pill border px-3 text-xs', sort === k ? 'border-gold bg-gold/20 font-semibold text-espresso' : 'border-default')}
              >
                {label}
              </button>
            ))}
          </div>
        ) : null}
        {q.isLoading ? (
          <Skeleton className="h-40" />
        ) : q.isError ? (
          <p className="text-sm text-danger">{L('مقدرناش نحمّل البيانات.', 'Could not load data.')}</p>
        ) : (
          <div className={cn("grid gap-3", sel === "all" && "md:grid-cols-2")}>
            {shown.map((s) => {
              const c = comm.data?.find((x) => x.id === s.m.id);
              const pct = c?.commission_pct ?? 0;
              const sal = c?.base_salary ?? 0;
              const due = sal + (s.revenue * pct) / 100;
              const e = edit[s.m.id];
              return (
                <div key={s.m.id} className="min-w-0 space-y-3 rounded-card border border-default p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate font-bold text-espresso">{s.m.name}</p>
                    {s.rating !== null ? (
                      <span className="inline-flex shrink-0 items-center gap-1 text-sm text-espresso">
                        <Star className="size-4 fill-gold text-gold" aria-hidden />
                        <span className="font-latin">{s.rating.toFixed(1)}</span>
                        <span className="text-xs text-ink-70">({s.ratingCount})</span>
                      </span>
                    ) : null}
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-center">
                    <Stat label={L('حلاقات', 'Cuts')} value={String(s.cuts)} />
                    <Stat label={L('الإيراد', 'Revenue')} value={formatEGP(s.revenue)} />
                    <Stat label={L('عملاء مختلفين', 'Unique clients')} value={String(s.customers)} />
                    <Stat label={L('متوسط الحلاقة', 'Avg cut')} value={formatEGP(Math.round(s.avg))} />
                  </div>
                  <p className="text-xs text-ink-70">
                    {L('غياب', 'No-shows')}: <span className="font-latin">{s.noShow}</span> · {L('إلغاء', 'Cancelled')}: <span className="font-latin">{s.cancelled}</span>
                    {s.top ? <> · {L('الأكتر طلباً', 'Top service')}: {s.top}</> : null}
                  </p>
                  <div className="rounded-btn bg-gold/10 p-2 text-center">
                    <p className="text-xs text-ink-70">{L('مستحقاته عن الشهر', 'Due for the month')}</p>
                    <p className="font-latin text-xl font-bold text-espresso">{formatEGP(Math.round(due))}</p>
                    <p className="text-xs text-ink-70">
                      {L('مرتب', 'Salary')} {formatEGP(sal)} + {pct}% {L('من الإيراد', 'of revenue')}
                    </p>
                  </div>
                  {comm.isError ? (
                    <p className="text-xs text-danger">{L('شغّل ملف features-v35.sql عشان تحدد النسبة والمرتب.', 'Run features-v35.sql to set commission & salary.')}</p>
                  ) : (
                    <div className={cn('grid grid-cols-2 gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end')}>
                      <Input
                        label={L('النسبة %', 'Commission %')}
                        type="number"
                        min={0}
                        max={100}
                        inputMode="decimal"
                        value={e?.pct ?? String(pct)}
                        onChange={(ev) => setEdit((p) => ({ ...p, [s.m.id]: { pct: ev.target.value, sal: p[s.m.id]?.sal ?? String(sal) } }))}
                      />
                      <Input
                        label={L('مرتب ثابت', 'Base salary')}
                        type="number"
                        min={0}
                        inputMode="decimal"
                        value={e?.sal ?? String(sal)}
                        onChange={(ev) => setEdit((p) => ({ ...p, [s.m.id]: { pct: p[s.m.id]?.pct ?? String(pct), sal: ev.target.value } }))}
                      />
                      <Button
                        className="col-span-2 sm:col-span-1"
                        loading={save.isPending}
                        disabled={!e}
                        onClick={() =>
                          save.mutate({
                            id: s.m.id,
                            pct: Math.min(100, Math.max(0, Number(e?.pct ?? pct) || 0)),
                            sal: Math.max(0, Number(e?.sal ?? sal) || 0),
                          })
                        }
                      >
                        {L('حفظ', 'Save')}
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-btn bg-sand/50 p-2">
      <p className="truncate font-latin text-base font-bold text-espresso">{value}</p>
      <p className="truncate text-xs text-ink-70">{label}</p>
    </div>
  );
}
