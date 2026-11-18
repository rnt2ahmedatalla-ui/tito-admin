import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Card, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { formatEGP } from '@/lib/money';
import { toCairo, cairoDateString } from '@/lib/time';

type Row = {
  start_at: string;
  price_egp: number;
  service_name_ar: string;
  service_name_en: string;
  status: string;
};

function topN<K>(m: Map<K, number>, n = 5): [K, number][] {
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
}

export function ReportsPage() {
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith('ar');
  const [days, setDays] = useState<7 | 30>(30);
  const fromIso = useMemo(() => new Date(Date.now() - days * 86400000).toISOString(), [days]);

  const reportQuery = useQuery({
    queryKey: ['reports', days],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bookings')
        .select('start_at, price_egp, service_name_ar, service_name_en, status')
        .gte('start_at', fromIso)
        .in('status', ['confirmed', 'completed']);
      if (error) throw error;
      return (data ?? []) as Row[];
    },
    staleTime: 60_000,
  });

  const rows = reportQuery.data ?? [];

  const services = useMemo(() => {
    const m = new Map<string, number>();
    rows.forEach((r) => {
      const name = isAr ? r.service_name_ar : r.service_name_en;
      m.set(name, (m.get(name) ?? 0) + 1);
    });
    return topN(m);
  }, [rows, isAr]);

  const hours = useMemo(() => {
    const m = new Map<number, number>();
    rows.forEach((r) => {
      const h = toCairo(r.start_at).getHours();
      m.set(h, (m.get(h) ?? 0) + 1);
    });
    return topN(m);
  }, [rows]);

  const bestDays = useMemo(() => {
    const m = new Map<string, number>();
    rows.forEach((r) => {
      const d = cairoDateString(toCairo(r.start_at));
      m.set(d, (m.get(d) ?? 0) + Number(r.price_egp));
    });
    return topN(m);
  }, [rows]);

  const totalIncome = rows.reduce((sum, r) => sum + Number(r.price_egp), 0);

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <Card>
      <CardBody className="space-y-3 p-4">
        <p className="font-semibold text-espresso">{title}</p>
        {children}
      </CardBody>
    </Card>
  );

  const Row1 = ({ left, right }: { left: string; right: string }) => (
    <div className="flex items-center justify-between gap-3 border-b border-bark/10 pb-2 text-sm last:border-0">
      <span className="min-w-0 truncate text-espresso">{left}</span>
      <span className="shrink-0 font-latin font-semibold text-espresso">{right}</span>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-bold text-espresso">{isAr ? 'التقارير' : 'Reports'}</h1>
        <div className="flex gap-2">
          {([7, 30] as const).map((d) => (
            <Button
              key={d}
              size="sm"
              variant={days === d ? 'primary' : 'secondary'}
              onClick={() => setDays(d)}
            >
              {isAr ? `آخر ${d} يوم` : `Last ${d} days`}
            </Button>
          ))}
        </div>
      </div>

      <Card>
        <CardBody className="p-4">
          <p className="text-xs text-ink-70">{isAr ? 'إجمالي الدخل في الفترة' : 'Total income in this period'}</p>
          <p className="mt-1 font-latin text-2xl font-bold text-espresso">{formatEGP(totalIncome)}</p>
          <p className="mt-1 text-xs text-ink-70">
            {isAr ? `عدد الحجوزات: ${rows.length}` : `Bookings: ${rows.length}`}
          </p>
        </CardBody>
      </Card>

      <Section title={isAr ? 'أكتر خدمة' : 'Top services'}>
        {services.length === 0 ? (
          <p className="text-sm text-ink-70">{isAr ? 'مفيش بيانات' : 'No data'}</p>
        ) : (
          services.map(([name, count]) => (
            <Row1 key={name} left={name} right={isAr ? `${count} حجز` : `${count} bookings`} />
          ))
        )}
      </Section>

      <Section title={isAr ? 'أكتر ساعة ضغط' : 'Busiest hours'}>
        {hours.length === 0 ? (
          <p className="text-sm text-ink-70">{isAr ? 'مفيش بيانات' : 'No data'}</p>
        ) : (
          hours.map(([h, count]) => (
            <Row1
              key={h}
              left={`${String(h).padStart(2, '0')}:00`}
              right={isAr ? `${count} حجز` : `${count} bookings`}
            />
          ))
        )}
      </Section>

      <Section title={isAr ? 'أكتر يوم دخل' : 'Best earning days'}>
        {bestDays.length === 0 ? (
          <p className="text-sm text-ink-70">{isAr ? 'مفيش بيانات' : 'No data'}</p>
        ) : (
          bestDays.map(([d, sum]) => <Row1 key={d} left={d} right={formatEGP(sum)} />)
        )}
      </Section>
    </div>
  );
}
