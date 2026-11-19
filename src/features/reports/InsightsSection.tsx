import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Star } from 'lucide-react';
import { Card, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { untypedDb } from '@/features/payments/useFinanceBoxes';
import { useStaff } from '@/features/staff/StaffPage';
import { formatEGP } from '@/lib/money';
import { toCairo } from '@/lib/time';
import { cn } from '@/lib/cn';

type B = { start_at: string; status: string; price_egp: number; staff_id: string | null; user_id: string | null; rate_token: string | null };

const DAY_ORDER = [6, 0, 1, 2, 3, 4, 5]; // السبت أول الأسبوع
const DAYS_AR = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const DAYS_AR_SHORT = ['أحد', 'إثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'];
const DAYS_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const OCCUPIED = new Set(['confirmed', 'completed', 'no_show', 'pending_payment']);

function hourText(h: number, isAr: boolean) {
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return isAr ? `${h12} ${h < 12 ? 'ص' : 'م'}` : `${h12}${h < 12 ? 'a' : 'p'}`;
}

function HeatMap({ title, rows, hours, isAr }: { title: string; rows: B[]; hours: number[]; isAr: boolean }) {
  const { grid, max, byDay, byHour, total } = useMemo(() => {
    const g = new Map<string, number>();
    const d = new Array<number>(7).fill(0);
    const h = new Map<number, number>();
    let mx = 0;
    let tot = 0;
    for (const r of rows) {
      if (!OCCUPIED.has(r.status)) continue;
      const c = toCairo(r.start_at);
      const key = `${c.getDay()}-${c.getHours()}`;
      const v = (g.get(key) ?? 0) + 1;
      g.set(key, v);
      mx = Math.max(mx, v);
      d[c.getDay()] = (d[c.getDay()] ?? 0) + 1;
      h.set(c.getHours(), (h.get(c.getHours()) ?? 0) + 1);
      tot += 1;
    }
    return { grid: g, max: mx, byDay: d, byHour: h, total: tot };
  }, [rows]);

  const dayName = (i: number) => (isAr ? DAYS_AR[i] : DAYS_EN[i]);
  const activeDays = DAY_ORDER.filter((i) => (byDay[i] ?? 0) > 0);
  const bestDay = [...activeDays].sort((a, b) => (byDay[b] ?? 0) - (byDay[a] ?? 0))[0];
  const quietDay = [...activeDays].sort((a, b) => (byDay[a] ?? 0) - (byDay[b] ?? 0))[0];
  const hoursSorted = [...byHour.entries()].sort((a, b) => b[1] - a[1]);
  const bestHour = hoursSorted[0]?.[0];
  const quietHours = [...hours].sort((x, y) => (byHour.get(x) ?? 0) - (byHour.get(y) ?? 0)).slice(0, 2).sort((x, y) => x - y);

  return (
    <Card className="min-w-0">
      <CardBody className="space-y-3 p-3 sm:p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="min-w-0 truncate font-semibold text-espresso">{title}</p>
          <span className="shrink-0 font-latin text-xs text-ink-70">{total}</span>
        </div>
        {total === 0 ? (
          <p className="text-sm text-ink-70">{isAr ? 'مفيش حجوزات في الفترة دي' : 'No bookings in this period'}</p>
        ) : (
          <>
            <div className="grid grid-cols-[2.25rem_repeat(7,minmax(0,1fr))] gap-[3px]" dir={isAr ? 'rtl' : 'ltr'}>
              <span />
              {DAY_ORDER.map((i) => (
                <span key={i} className="truncate text-center text-[10px] font-medium text-ink-70" title={dayName(i)}>
                  {isAr ? DAYS_AR_SHORT[i] : DAYS_EN[i]?.slice(0, 3)}
                </span>
              ))}
              {hours.map((h) => (
                <FragmentRow key={h} h={h} isAr={isAr} grid={grid} max={max} />
              ))}
            </div>
            <div className="space-y-1 text-xs text-ink-70">
              {bestDay !== undefined ? <p>🔥 {isAr ? 'أزحم يوم' : 'Busiest day'}: <b className="text-espresso">{dayName(bestDay)}</b>{bestHour !== undefined ? ` · ${isAr ? 'أزحم ساعة' : 'peak'} ${hourText(bestHour, isAr)}` : ''}</p> : null}
              {quietDay !== undefined && quietDay !== bestDay ? <p>💤 {isAr ? 'أهدى يوم' : 'Quietest day'}: <b className="text-espresso">{dayName(quietDay)}</b></p> : null}
              {quietHours.length > 0 ? <p>🕒 {isAr ? 'أوقات هادية (مناسبة لعروض)' : 'Quiet hours (good for offers)'}: <b className="text-espresso">{quietHours.map((h) => hourText(h, isAr)).join(isAr ? '، ' : ', ')}</b></p> : null}
            </div>
          </>
        )}
      </CardBody>
    </Card>
  );
}

function FragmentRow({ h, isAr, grid, max }: { h: number; isAr: boolean; grid: Map<string, number>; max: number }) {
  return (
    <>
      <span className="self-center truncate text-[10px] text-ink-70">{hourText(h, isAr)}</span>
      {DAY_ORDER.map((d) => {
        const v = grid.get(`${d}-${h}`) ?? 0;
        const a = v === 0 ? 0 : 0.18 + 0.82 * (v / (max || 1));
        return (
          <span
            key={d}
            className={cn('flex h-6 items-center justify-center rounded-[4px] font-latin text-[10px] font-semibold sm:h-7', v === 0 ? 'bg-sand/50 text-transparent' : 'text-espresso')}
            style={v === 0 ? undefined : { backgroundColor: `rgba(201,149,63,${a.toFixed(2)})` }}
          >
            {v || '·'}
          </span>
        );
      })}
    </>
  );
}

export function InsightsSection() {
  const { i18n } = useTranslation();
  const isAr = !!i18n.language?.startsWith('ar');
  const L = (ar: string, en: string) => (isAr ? ar : en);
  const [days, setDays] = useState(90);
  const staff = (useStaff().data ?? []).filter((m) => m.is_active);

  const q = useQuery({
    queryKey: ['insights', days],
    staleTime: 60_000,
    queryFn: async () => {
      const from = new Date(Date.now() - days * 86400_000).toISOString();
      const bookings: B[] = [];
      for (let p = 0; p < 10; p += 1) {
        const { data, error } = await untypedDb
          .from('bookings')
          .select('start_at, status, price_egp, staff_id, user_id, rate_token')
          .gte('start_at', from)
          .lte('start_at', new Date().toISOString())
          .order('start_at', { ascending: true })
          .range(p * 1000, p * 1000 + 999);
        if (error) throw error;
        const rows = (data ?? []) as B[];
        bookings.push(...rows);
        if (rows.length < 1000) break;
      }
      const rev = await untypedDb.from('reviews').select('rate_token, rating').gte('created_at', from).limit(2000);
      const ratings = new Map<string, number>();
      ((rev.data ?? []) as Array<{ rate_token: string | null; rating: number }>).forEach((r) => {
        if (r.rate_token) ratings.set(r.rate_token, r.rating);
      });
      const nsCount = new Map<string, number>();
      bookings.forEach((b) => {
        if (b.status === 'no_show' && b.user_id) nsCount.set(b.user_id, (nsCount.get(b.user_id) ?? 0) + 1);
      });
      const topIds = [...nsCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
      let names = new Map<string, string>();
      if (topIds.length > 0) {
        const { data } = await untypedDb.from('profiles').select('id, full_name').in('id', topIds.map(([id]) => id));
        names = new Map(((data ?? []) as Array<{ id: string; full_name: string | null }>).map((p) => [p.id, p.full_name ?? '—']));
      }
      return { bookings, ratings, noShows: topIds.map(([id, n]) => ({ id, n, name: names.get(id) ?? '—' })) };
    },
  });

  const hours = useMemo(() => {
    const set = new Set<number>();
    (q.data?.bookings ?? []).forEach((b) => set.add(toCairo(b.start_at).getHours()));
    if (set.size === 0) return [] as number[];
    const lo = Math.min(...set);
    const hi = Math.max(...set);
    return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
  }, [q.data]);

  const perf = useMemo(() => {
    const bookings = q.data?.bookings ?? [];
    return staff.map((m) => {
      const mine = bookings.filter((b) => b.staff_id === m.id);
      const done = mine.filter((b) => b.status === 'completed');
      const rs = mine.map((b) => (b.rate_token ? q.data?.ratings.get(b.rate_token) : undefined)).filter((x): x is number => typeof x === 'number');
      return {
        m,
        total: mine.filter((b) => OCCUPIED.has(b.status)).length,
        done: done.length,
        noShow: mine.filter((b) => b.status === 'no_show').length,
        revenue: done.reduce((s, b) => s + Number(b.price_egp || 0), 0),
        rating: rs.length ? rs.reduce((s, n) => s + n, 0) / rs.length : null,
        ratingCount: rs.length,
      };
    });
  }, [q.data, staff]);

  const multi = staff.length >= 2;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold text-espresso">{L('خريطة الأوقات وأداء الفريق', 'Busy-hours map & team performance')}</h2>
        <div className="flex gap-1.5">
          {[30, 90, 180].map((d) => (
            <Button key={d} size="sm" variant={days === d ? 'primary' : 'secondary'} onClick={() => setDays(d)}>
              {isAr ? `${d} يوم` : `${d}d`}
            </Button>
          ))}
        </div>
      </div>

      {q.isLoading ? (
        <Skeleton className="h-64" />
      ) : q.isError ? (
        <p className="text-sm text-danger">{L('مقدرناش نحمّل البيانات.', 'Could not load data.')}</p>
      ) : (
        <>
          <div className={cn('grid gap-3', multi && 'lg:grid-cols-2')}>
            <HeatMap title={L('المحل كله', 'Whole shop')} rows={q.data?.bookings ?? []} hours={hours} isAr={isAr} />
            {multi
              ? staff.map((m) => (
                  <HeatMap key={m.id} title={m.name} rows={(q.data?.bookings ?? []).filter((b) => b.staff_id === m.id)} hours={hours} isAr={isAr} />
                ))
              : null}
          </div>

          {multi ? (
            <div className="space-y-2">
              <h3 className="font-semibold text-espresso">{L('أداء كل حلاق', 'Performance per barber')}</h3>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {perf.map((p) => (
                  <Card key={p.m.id} className="min-w-0">
                    <CardBody className="space-y-2 p-3">
                      <p className="truncate font-semibold text-espresso">{p.m.name}</p>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="rounded-btn bg-sand/50 px-2 py-1.5"><p className="text-ink-70">{L('الحجوزات', 'Bookings')}</p><p className="font-latin text-sm font-semibold">{p.total}</p></div>
                        <div className="rounded-btn bg-sand/50 px-2 py-1.5"><p className="text-ink-70">{L('اكتملت', 'Completed')}</p><p className="font-latin text-sm font-semibold">{p.done}</p></div>
                        <div className="rounded-btn bg-sand/50 px-2 py-1.5"><p className="text-ink-70">{L('غياب', 'No-shows')}</p><p className="font-latin text-sm font-semibold text-danger">{p.noShow}</p></div>
                        <div className="rounded-btn bg-sand/50 px-2 py-1.5"><p className="text-ink-70">{L('الدخل', 'Revenue')}</p><p className="font-latin text-sm font-semibold">{formatEGP(p.revenue)}</p></div>
                      </div>
                      <p className="flex items-center gap-1 text-xs text-ink-70">
                        <Star className="size-3.5 fill-gold text-gold" />
                        {p.rating === null ? L('لسه مفيش تقييمات', 'No ratings yet') : <span><b className="font-latin text-espresso">{p.rating.toFixed(1)}</b> ({p.ratingCount})</span>}
                      </p>
                    </CardBody>
                  </Card>
                ))}
              </div>
            </div>
          ) : null}

          {(q.data?.noShows ?? []).length > 0 ? (
            <Card>
              <CardBody className="space-y-1 p-3 sm:p-4">
                <p className="font-semibold text-espresso">{L('أكتر العملاء غياباً', 'Most no-shows')}</p>
                {(q.data?.noShows ?? []).map((n) => (
                  <div key={n.id} className="flex items-center justify-between gap-3 border-b border-bark/10 py-1.5 text-sm last:border-0">
                    <span className="min-w-0 truncate text-espresso">{n.name}</span>
                    <span className="shrink-0 font-latin font-semibold text-danger">{n.n}</span>
                  </div>
                ))}
                <p className="pt-1 text-xs text-ink-70">{L('تقدر تفرض عليهم الدفع المسبق من "الباقات والمميزات".', 'You can require prepayment for them from "Packages & features".')}</p>
              </CardBody>
            </Card>
          ) : null}
        </>
      )}
    </div>
  );
}
