import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Card, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { formatEGP } from '@/lib/money';
import { toCairo, cairoDateString } from '@/lib/time';

type Profile = { full_name: string | null; phone: string | null };
type Row = {
  id: string;
  start_at: string;
  price_egp: number;
  service_name_ar: string;
  service_name_en: string;
  status: string;
  user_id: string | null;
  guest_name: string | null;
  guest_phone: string | null;
  profile: Profile | Profile[] | null;
};

const profileOf = (p: Row['profile']): Profile | null => (Array.isArray(p) ? p[0] ?? null : p);

function topN<K>(m: Map<K, number>, n = 10): [K, number][] {
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
}

function todayStr(offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * 86400000);
  return cairoDateString(toCairo(d.toISOString()));
}

export function ReportsPage() {
  const { i18n } = useTranslation();
  const navigate = useNavigate();
  const isAr = i18n.language?.startsWith('ar');

  const [from, setFrom] = useState(todayStr(-29));
  const [to, setTo] = useState(todayStr(0));
  const [serviceFilter, setServiceFilter] = useState('all');

  const reportQuery = useQuery({
    queryKey: ['reports', from, to],
    enabled: !!from && !!to && from <= to,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bookings')
        .select(
          'id, start_at, price_egp, service_name_ar, service_name_en, status, user_id, guest_name, guest_phone, profile:profiles!bookings_user_id_fkey(full_name, phone)',
        )
        .gte('start_at', new Date(`${from}T00:00:00+02:00`).toISOString())
        .lte('start_at', new Date(`${to}T23:59:59+02:00`).toISOString())
        .in('status', ['confirmed', 'completed'])
        .order('start_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
    staleTime: 60_000,
  });

  const allRows = reportQuery.data ?? [];
  const nameOf = (r: Row) => (isAr ? r.service_name_ar : r.service_name_en);

  const serviceOptions = useMemo(
    () => Array.from(new Set(allRows.map(nameOf))).sort(),
    [allRows, isAr], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const rows = useMemo(
    () => (serviceFilter === 'all' ? allRows : allRows.filter((r) => nameOf(r) === serviceFilter)),
    [allRows, serviceFilter, isAr], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const services = useMemo(() => {
    const m = new Map<string, number>();
    rows.forEach((r) => m.set(nameOf(r), (m.get(nameOf(r)) ?? 0) + 1));
    return topN(m);
  }, [rows, isAr]); // eslint-disable-line react-hooks/exhaustive-deps

  const hours = useMemo(() => {
    const m = new Map<number, number>();
    rows.forEach((r) => {
      const h = toCairo(r.start_at).getHours();
      m.set(h, (m.get(h) ?? 0) + 1);
    });
    return topN(m, 24);
  }, [rows]);

  const bestDays = useMemo(() => {
    const m = new Map<string, number>();
    rows.forEach((r) => {
      const d = cairoDateString(toCairo(r.start_at));
      m.set(d, (m.get(d) ?? 0) + Number(r.price_egp));
    });
    return topN(m);
  }, [rows]);

  // أكتر العملاء: بنجمع الحجوزات حسب العميل (حساب أو رقم)
  const customers = useMemo(() => {
    const m = new Map<string, { name: string; phone: string; visits: number; spent: number }>();
    rows.forEach((r) => {
      const p = profileOf(r.profile);
      const key = r.user_id ?? `g:${r.guest_phone ?? r.id}`;
      const cur = m.get(key) ?? {
        name: p?.full_name || r.guest_name || (isAr ? 'بدون اسم' : 'No name'),
        phone: p?.phone || r.guest_phone || '',
        visits: 0,
        spent: 0,
      };
      cur.visits += 1;
      cur.spent += Number(r.price_egp);
      m.set(key, cur);
    });
    return [...m.values()].sort((a, b) => b.visits - a.visits).slice(0, 15);
  }, [rows, isAr]); // eslint-disable-line react-hooks/exhaustive-deps

  const totalIncome = rows.reduce((sum, r) => sum + Number(r.price_egp), 0);

  const setPreset = (days: number) => {
    setFrom(todayStr(-(days - 1)));
    setTo(todayStr(0));
  };

  const exportCsv = () => {
    const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const header = ['date', 'time', 'customer', 'phone', 'service', 'price_egp', 'status'];
    const lines = rows.map((r) => {
      const p = profileOf(r.profile);
      const c = toCairo(r.start_at);
      const hh = String(c.getHours()).padStart(2, '0');
      const mm = String(c.getMinutes()).padStart(2, '0');
      return [
        cairoDateString(c),
        `${hh}:${mm}`,
        p?.full_name || r.guest_name || '',
        p?.phone || r.guest_phone || '',
        nameOf(r),
        r.price_egp,
        r.status,
      ]
        .map(esc)
        .join(',');
    });
    const csv = '\uFEFF' + [header.join(','), ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tito-report-${from}-to-${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const Block = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <Card>
      <CardBody className="space-y-2 p-4">
        <p className="font-semibold text-espresso">{title}</p>
        {children}
      </CardBody>
    </Card>
  );

  const Line = ({ left, right }: { left: string; right: string }) => (
    <div className="flex items-center justify-between gap-3 border-b border-bark/10 py-2 text-sm last:border-0">
      <span className="min-w-0 truncate text-espresso">{left}</span>
      <span className="shrink-0 font-latin font-semibold text-espresso">{right}</span>
    </div>
  );

  const empty = <p className="text-sm text-ink-70">{isAr ? 'مفيش بيانات في الفترة دي' : 'No data in this period'}</p>;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-espresso">{isAr ? 'تقارير الحجوزات' : 'Booking reports'}</h1>

      <Card>
        <CardBody className="space-y-3 p-4">
          <div className="flex flex-wrap gap-2">
            {[7, 30, 90].map((d) => (
              <Button key={d} size="sm" variant="secondary" onClick={() => setPreset(d)}>
                {isAr ? `آخر ${d} يوم` : `Last ${d} days`}
              </Button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Input label={isAr ? 'من' : 'From'} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            <Input label={isAr ? 'لحد' : 'To'} type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div>
            <label className="text-sm font-medium text-ink-70">{isAr ? 'الخدمة' : 'Service'}</label>
            <select
              className="mt-1 min-h-11 w-full rounded-btn border border-bark/20 bg-white px-3 text-sm text-espresso"
              value={serviceFilter}
              onChange={(e) => setServiceFilter(e.target.value)}
            >
              <option value="all">{isAr ? 'كل الخدمات' : 'All services'}</option>
              {serviceOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          {from > to ? (
            <p className="text-sm text-danger">{isAr ? 'تاريخ البداية لازم يكون قبل النهاية' : 'Start date must be before end date'}</p>
          ) : null}
        </CardBody>
      </Card>

      <Card>
        <CardBody className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <p className="text-xs text-ink-70">{isAr ? 'الدخل في الفترة' : 'Income in this period'}</p>
            <p className="font-latin text-2xl font-bold text-espresso">{formatEGP(totalIncome)}</p>
            <p className="text-xs text-ink-70">{isAr ? `عدد الحجوزات: ${rows.length}` : `Bookings: ${rows.length}`}</p>
          </div>
          <Button size="sm" variant="secondary" disabled={rows.length === 0} onClick={exportCsv}>
            {isAr ? 'نزّل الداتا (Excel/CSV)' : 'Download data (CSV)'}
          </Button>
        </CardBody>
      </Card>

      <Block title={isAr ? 'أكتر العملاء زيارة' : 'Top customers by visits'}>
        {customers.length === 0 ? empty : customers.map((c, i) => (
          <button
            key={`${c.phone}-${i}`}
            type="button"
            onClick={() => navigate(`/more/customers?q=${encodeURIComponent(c.phone || c.name)}`)}
            className="block w-full border-b border-bark/10 py-2.5 text-start last:border-0 hover:bg-sand/40"
          >
            <span className="block break-words font-semibold text-espresso">
              {i + 1}. {c.name}
            </span>
            <span className="mt-0.5 block text-xs text-ink-70 font-latin">
              {isAr ? `${c.visits} زيارة · ${formatEGP(c.spent)}` : `${c.visits} visits · ${formatEGP(c.spent)}`}
            </span>
          </button>
        ))}
      </Block>

      <Block title={isAr ? 'أكتر خدمة' : 'Top services'}>
        {services.length === 0 ? empty : services.map(([name, count]) => (
          <Line key={name} left={name} right={isAr ? `${count} حجز` : `${count} bookings`} />
        ))}
      </Block>

      <Block title={isAr ? 'ساعات الضغط' : 'Busiest hours'}>
        {hours.length === 0 ? empty : hours.map(([h, count]) => (
          <Line
            key={h}
            left={`${String(h).padStart(2, '0')}:00`}
            right={isAr ? `${count} حجز` : `${count} bookings`}
          />
        ))}
      </Block>

      <Block title={isAr ? 'أكتر أيام دخل' : 'Best earning days'}>
        {bestDays.length === 0 ? empty : bestDays.map(([d, sum]) => (
          <Line key={d} left={d} right={formatEGP(sum)} />
        ))}
      </Block>
    </div>
  );
}
