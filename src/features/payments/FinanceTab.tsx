import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { DashboardStats } from '@/types/database';
import { Card, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import { formatEGP, formatEGPCompact } from '@/lib/money';
import { cairoDayBounds, cairoDateString, toCairo } from '@/lib/time';
import { computeBoxes, useFinanceBoxes } from './useFinanceBoxes';

type FinanceSummary = {
  online: number;
  cash: number;
  bookings_total: number;
  bookings_count: number;
  products: number;
  grand_total: number;
};

function cairoMonthBounds() {
  const now = toCairo(new Date());
  const from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const to = cairoDateString(new Date());
  return { from, to };
}

export function FinanceTab() {
  const { t } = useTranslation();
  const month = useMemo(() => cairoMonthBounds(), []);
  const [dateFrom, setDateFrom] = useState(month.from);
  const [dateTo, setDateTo] = useState(month.to);

  const statsQuery = useQuery({
    queryKey: ['finance-stats', 'today'],
    queryFn: async () => {
      const todayBounds = cairoDayBounds(new Date());
      const { data, error } = await supabase.rpc('admin_dashboard_stats', {
        p_from: cairoDateString(toCairo(todayBounds.start)),
        p_to: cairoDateString(toCairo(todayBounds.end)),
      });
      if (error) throw error;
      return data as DashboardStats;
    },
    staleTime: 15_000,
  });
  const stats = statsQuery.data;

  const financeQuery = useQuery({
    queryKey: ['finance-summary', dateFrom, dateTo],
    queryFn: async () => {
      const { data: summary, error: finErr } = await supabase.rpc('admin_finance_summary', {
        p_from: dateFrom || null,
        p_to: dateTo || null,
      });
      if (finErr) throw finErr;
      const s = summary as FinanceSummary;
      return {
        online: Number(s.online ?? 0),
        cash: Number(s.cash ?? 0),
        bookings_total: Number(s.bookings_total ?? 0),
        bookings_count: Number(s.bookings_count ?? 0),
        products: Number(s.products ?? 0),
        grand_total: Number(s.grand_total ?? 0),
      } satisfies FinanceSummary;
    },
    staleTime: 15_000,
  });
  const finance = financeQuery.data;

  const boxesQuery = useFinanceBoxes();
  const boxes = boxesQuery.data ?? [];
  const split = computeBoxes(finance?.grand_total ?? 0, boxes);

  return (
    <div className="space-y-6">
      {/* النهاردة */}
      <section className="space-y-2">
        <h2 className="text-lg font-bold text-espresso">{t('payments.todayTitle')}</h2>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {[
            { label: t('today.bookingsToday'), value: stats ? stats.bookings_count : '—' },
            { label: t('today.pendingPayment'), value: stats ? stats.pending_payment_count : '—' },
            { label: t('today.confirmedIncome'), value: stats ? formatEGPCompact(stats.confirmed_income) : '—' },
            { label: t('today.noShows'), value: stats ? stats.no_show_count : '—' },
          ].map((kpi) => (
            <Card key={kpi.label} className="border-default bg-white/90">
              <CardBody className="p-2.5">
                <p className="text-xs text-ink-70">{kpi.label}</p>
                <p className="mt-0.5 font-latin text-lg font-bold text-espresso">{kpi.value}</p>
              </CardBody>
            </Card>
          ))}
        </div>
      </section>

      {/* ملخص الدخل مع فلتر التاريخ */}
      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-bold text-espresso">{t('bookings.financeTitle')}</h2>
          <p className="text-sm text-ink-70">{t('bookings.financeHint')}</p>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <Input
            type="date"
            label={t('bookings.dateFrom')}
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
          <Input
            type="date"
            label={t('bookings.dateTo')}
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              const bounds = cairoMonthBounds();
              setDateFrom(bounds.from);
              setDateTo(bounds.to);
            }}
          >
            {t('bookings.thisMonth')}
          </Button>
        </div>

        {financeQuery.isLoading ? (
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
          </div>
        ) : financeQuery.isError ? (
          <p className="text-sm text-danger">
            {financeQuery.error instanceof Error ? financeQuery.error.message : t('app.noResults')}
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            <Card>
              <CardBody className="p-3">
                <p className="text-xs text-ink-70">{t('bookings.financeOnline')}</p>
                <p className="mt-1 font-latin text-xl font-semibold text-espresso">
                  {formatEGP(finance?.online ?? 0)}
                </p>
              </CardBody>
            </Card>
            <Card>
              <CardBody className="p-3">
                <p className="text-xs text-ink-70">{t('bookings.financeCash')}</p>
                <p className="mt-1 font-latin text-xl font-semibold text-espresso">
                  {formatEGP(finance?.cash ?? 0)}
                </p>
              </CardBody>
            </Card>
            <Card>
              <CardBody className="p-3">
                <p className="text-xs text-ink-70">{t('bookings.financeProducts')}</p>
                <p className="mt-1 font-latin text-xl font-semibold text-espresso">
                  {formatEGP(finance?.products ?? 0)}
                </p>
              </CardBody>
            </Card>
            <Card className="border-gold/40 bg-gold/10">
              <CardBody className="p-3">
                <p className="text-xs text-ink-70">{t('bookings.financeTotal')}</p>
                <p className="mt-1 font-latin text-xl font-bold text-espresso">
                  {formatEGP(finance?.grand_total ?? 0)}
                </p>
                <p className="mt-0.5 text-[11px] text-ink-70">
                  {t('bookings.financeCount', { count: finance?.bookings_count ?? 0 })}
                </p>
              </CardBody>
            </Card>
          </div>
        )}
      </section>

      {/* الصناديق */}
      {boxesQuery.isError || !finance ? null : (
        <section className="space-y-3">
          <div>
            <h2 className="text-lg font-bold text-espresso">{t('payments.boxesTitle')}</h2>
            <p className="text-sm text-ink-70">{t('payments.boxesHint')}</p>
          </div>
          {boxes.length === 0 ? (
            <p className="text-sm text-ink-70">
              {t('payments.boxesEmpty')}{' '}
              <Link to="/more/settings" className="font-semibold text-gold underline">
                {t('payments.boxesEditLink')}
              </Link>
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
              {split.items.map((b) => (
                <Card key={b.id}>
                  <CardBody className="p-3">
                    <p className="text-xs text-ink-70">
                      {b.name} <span className="font-latin">· {b.pct}%</span>
                    </p>
                    <p className="mt-1 font-latin text-xl font-semibold text-espresso">{formatEGP(b.amount)}</p>
                  </CardBody>
                </Card>
              ))}
              <Card className="border-gold/40 bg-gold/10">
                <CardBody className="p-3">
                  <p className="text-xs text-ink-70">
                    {t('payments.boxRemainder')} <span className="font-latin">· {split.remainderPct}%</span>
                  </p>
                  <p className="mt-1 font-latin text-xl font-bold text-espresso">
                    {formatEGP(split.remainderAmount)}
                  </p>
                </CardBody>
              </Card>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
