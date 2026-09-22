import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import type { BookingStatus, BookingWithRelations } from '@/types/database';
import { BOOKING_STATUS } from '@/lib/status';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { StatusBadge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { BookingDetailPanel } from '@/components/booking/BookingDetailPanel';
import { formatCairoTime, formatCairoDateShort } from '@/lib/time';
import { formatEGP } from '@/lib/money';
import { buildCsv } from '@/lib/whatsapp';
import { first } from '@/lib/booking';

const PAGE_SIZE = 25;
const ALL_STATUSES = Object.keys(BOOKING_STATUS) as BookingStatus[];

export function BookingsPage() {
  const { t, i18n } = useTranslation();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<BookingStatus[]>([]);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selected, setSelected] = useState<BookingWithRelations | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(timer);
  }, [search]);

  const {
    data,
    isLoading,
    isError,
    error,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    refetch,
  } = useInfiniteQuery({
    queryKey: ['bookings', 'list', debouncedSearch, statusFilter, dateFrom, dateTo],
    queryFn: async ({ pageParam }) => {
      let query = supabase
        .from('bookings')
        .select(
          '*, profile:profiles!bookings_user_id_fkey(full_name, phone), payment:payments(*)',
          { count: 'exact' },
        )
        .order('start_at', { ascending: false })
        .range(pageParam * PAGE_SIZE, (pageParam + 1) * PAGE_SIZE - 1);

      if (statusFilter.length > 0) query = query.in('status', statusFilter);
      if (dateFrom) query = query.gte('start_at', `${dateFrom}T00:00:00`);
      if (dateTo) query = query.lte('start_at', `${dateTo}T23:59:59`);

      if (debouncedSearch) {
        const { data: customers, error: searchErr } = await supabase.rpc('admin_search_customers', {
          p_q: debouncedSearch,
          p_limit: 50,
          p_offset: 0,
        });
        if (searchErr) throw searchErr;
        const ids = (customers as Array<{ id: string }>).map((c) => c.id);
        if (ids.length === 0) return { rows: [] as BookingWithRelations[], count: 0 };
        query = query.in('user_id', ids);
      }

      const { data: pageRows, error: qErr, count } = await query;
      if (qErr) throw qErr;
      return {
        rows: (pageRows ?? []) as unknown as BookingWithRelations[],
        count: count ?? 0,
      };
    },
    initialPageParam: 0,
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((n, p) => n + p.rows.length, 0);
      if (last.rows.length < PAGE_SIZE || loaded >= last.count) return undefined;
      return pages.length;
    },
    staleTime: 15_000,
  });

  const rows = useMemo(() => data?.pages.flatMap((p) => p.rows) ?? [], [data]);

  const toggleStatus = (status: BookingStatus) => {
    setStatusFilter((prev) =>
      prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status],
    );
  };

  const exportCsv = useCallback(() => {
    const header = ['Name', 'Phone', 'Service', 'Date', 'Time', 'Status', 'Price'];
    const csvRows = rows.map((b) => [
      first(b.profile)?.full_name ?? '',
      first(b.profile)?.phone ?? '',
      i18n.language === 'ar' ? b.service_name_ar : b.service_name_en,
      formatCairoDateShort(b.start_at),
      formatCairoTime(b.start_at, i18n.language),
      b.status,
      String(b.price_egp),
    ]);
    const csv = buildCsv([header, ...csvRows]);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bookings-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(t('app.export'));
  }, [rows, i18n.language, t]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">{t('bookings.title')}</h1>
        <Button variant="secondary" size="sm" onClick={exportCsv} disabled={rows.length === 0}>
          <Download className="size-4" />
          {t('app.export')}
        </Button>
      </div>

      <Input
        placeholder={t('app.search')}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <div className="flex flex-wrap gap-2">
        {ALL_STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => toggleStatus(s)}
            className={`rounded-full border px-2 py-1 text-xs ${
              statusFilter.includes(s) ? 'border-gold bg-gold/10' : 'border-bark/20'
            }`}
          >
            {t(BOOKING_STATUS[s].labelKey)}
          </button>
        ))}
      </div>

      <div className="flex gap-2">
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
      </div>

      {isLoading ? (
        <Skeleton className="h-64" />
      ) : isError ? (
        <div className="space-y-3 py-12 text-center">
          <p className="text-ink-70">
            {error instanceof Error ? error.message : t('app.noResults')}
          </p>
          <Button variant="secondary" size="sm" onClick={() => void refetch()}>
            {t('app.retry', { defaultValue: 'Retry' })}
          </Button>
        </div>
      ) : rows.length === 0 ? (
        <p className="py-12 text-center text-ink-70">{t('app.noResults')}</p>
      ) : (
        <div className="overflow-hidden rounded-card border border-bark/15 bg-white">
          {rows.map((booking) => (
            <button
              key={booking.id}
              type="button"
              onClick={() => setSelected(booking)}
              className="flex w-full items-center justify-between gap-2 border-b border-bark/10 px-4 py-3 text-start last:border-b-0 hover:bg-sand/30"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{first(booking.profile)?.full_name ?? '—'}</p>
                <p className="text-sm text-ink-70 font-latin">
                  {formatCairoDateShort(booking.start_at)}{' '}
                  {formatCairoTime(booking.start_at, i18n.language)}
                  {' · '}
                  {i18n.language === 'ar' ? booking.service_name_ar : booking.service_name_en}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="text-sm font-latin">{formatEGP(booking.price_egp)}</span>
                <StatusBadge status={booking.status} />
              </div>
            </button>
          ))}
        </div>
      )}

      {hasNextPage ? (
        <Button
          variant="secondary"
          loading={isFetchingNextPage}
          onClick={() => void fetchNextPage()}
        >
          {t('app.loadMore')}
        </Button>
      ) : null}

      <BookingDetailPanel booking={selected} open={!!selected} onClose={() => setSelected(null)} />
    </div>
  );
}
