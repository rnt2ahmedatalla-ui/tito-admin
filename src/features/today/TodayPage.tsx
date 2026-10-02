import { useMemo, useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import { addDays, getDaysInMonth, startOfMonth, getDay } from 'date-fns';
import { supabase } from '@/lib/supabase';
import type { BookingWithRelations, DashboardStats, WorkingHours } from '@/types/database';
import { Card, CardBody } from '@/components/ui/Card';
import { KpiSkeleton, Skeleton } from '@/components/ui/Skeleton';
import { StatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { BookingDetailPanel } from '@/components/booking/BookingDetailPanel';
import {
  cairoDayBounds,
  cairoWeekBounds,
  cairoRangeBounds,
  cairoDateString,
  formatCairoTime,
  toCairo,
  hourLabel,
} from '@/lib/time';
import { formatEGPCompact } from '@/lib/money';
import { cn } from '@/lib/cn';
import { first } from '@/lib/booking';

type ViewMode = 'day' | 'three' | 'week';

export function TodayPage() {
  const { t, i18n } = useTranslation();
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [viewMode, setViewMode] = useState<ViewMode>('day');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerMonth, setPickerMonth] = useState(() => startOfMonth(new Date()));
  const [selectedBooking, setSelectedBooking] = useState<BookingWithRelations | null>(null);
  const nowLineRef = useRef<HTMLDivElement>(null);

  const bounds =
    viewMode === 'day'
      ? cairoDayBounds(selectedDate)
      : viewMode === 'three'
        ? cairoRangeBounds(selectedDate, 3)
        : cairoWeekBounds(selectedDate);

  const dayCount = viewMode === 'day' ? 1 : viewMode === 'three' ? 3 : 7;
  const stepDays = viewMode === 'day' ? 1 : viewMode === 'three' ? 3 : 7;

  const statsQuery = useQuery({
    queryKey: ['dashboard-stats', bounds.start, bounds.end],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_dashboard_stats', {
        p_from: cairoDateString(toCairo(bounds.start)),
        p_to: cairoDateString(toCairo(bounds.end)),
      });
      if (error) throw error;
      return data as DashboardStats;
    },
    staleTime: 15_000,
  });

  const bookingsQuery = useQuery({
    queryKey: ['bookings', 'today', bounds.start, bounds.end],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bookings')
        .select('*, profile:profiles!bookings_user_id_fkey(full_name, phone), payment:payments(*), extras:booking_extras(id, name_ar, name_en, price_egp)')
        .gte('start_at', bounds.start)
        .lte('start_at', bounds.end)
        .order('start_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as BookingWithRelations[];
    },
    staleTime: 15_000,
  });

  const hoursQuery = useQuery({
    queryKey: ['working_hours'],
    queryFn: async () => {
      const { data, error } = await supabase.from('working_hours').select('*');
      if (error) throw error;
      return (data ?? []) as WorkingHours[];
    },
    staleTime: 60_000,
  });

  const bookings = (bookingsQuery.data ?? []).filter(
    (b) => b.status !== 'cancelled' && b.status !== 'expired',
  );
  const stats = statsQuery.data;

  const hours = useMemo(() => {
    const rows = (hoursQuery.data ?? []).filter((h) => !h.is_closed);
    if (rows.length === 0) return Array.from({ length: 14 }, (_, i) => i + 8);
    const parseHour = (time: string) => Number(String(time).slice(0, 2));
    const openH = Math.min(...rows.map((h) => parseHour(h.open_time)));
    const closeH = Math.max(...rows.map((h) => parseHour(h.close_time)));
    const start = Number.isFinite(openH) ? Math.max(0, openH) : 8;
    const end = Number.isFinite(closeH) ? Math.min(23, Math.max(start, closeH)) : 21;
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  }, [hoursQuery.data]);

  useEffect(() => {
    if (viewMode === 'day' && nowLineRef.current) {
      nowLineRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [viewMode, bookings.length]);

  const now = toCairo(new Date());
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const isToday = cairoDateString(selectedDate) === cairoDateString(new Date());

  const pickerDays = useMemo(() => {
    const first = startOfMonth(pickerMonth);
    // weekStartsOn Saturday = 6 for Egypt feel; getDay: 0=Sun
    const lead = (getDay(first) + 1) % 7; // Sat=0
    const total = getDaysInMonth(pickerMonth);
    const cells: Array<Date | null> = [];
    for (let i = 0; i < lead; i++) cells.push(null);
    for (let d = 1; d <= total; d++) {
      cells.push(new Date(pickerMonth.getFullYear(), pickerMonth.getMonth(), d));
    }
    return cells;
  }, [pickerMonth]);

  const dayLabels = t('hours.days', { returnObjects: true }) as string[];

  const renderDayColumn = (day: Date, compact = false) => {
    const dayStr = cairoDateString(day);
    const dayBookings = bookings.filter((b) => cairoDateString(toCairo(b.start_at)) === dayStr);
    return (
      <Card key={dayStr} className="min-h-24">
        <CardBody className={cn('p-2', !compact && 'space-y-1')}>
          <p className="mb-1 font-latin text-xs text-ink-70">{dayStr}</p>
          {dayBookings.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => setSelectedBooking(b)}
              className="mb-1 w-full rounded bg-sand/60 px-1 py-0.5 text-start text-xs hover:bg-sand"
            >
              {formatCairoTime(b.start_at, i18n.language)}
              {!compact ? (
                <span className="ms-1 truncate">
                  {first(b.profile)?.full_name?.split(' ')[0] ?? ''}
                </span>
              ) : null}
            </button>
          ))}
        </CardBody>
      </Card>
    );
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-default pb-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-gold font-latin">Ops</p>
          <h1 className="mt-1 text-2xl font-bold text-espresso">{t('today.title')}</h1>
        </div>
        <div className="flex flex-wrap gap-1">
          <Button variant={viewMode === 'day' ? 'primary' : 'ghost'} size="sm" onClick={() => setViewMode('day')}>
            {t('today.dayView')}
          </Button>
          <Button variant={viewMode === 'three' ? 'primary' : 'ghost'} size="sm" onClick={() => setViewMode('three')}>
            {t('today.threeDayView')}
          </Button>
          <Button variant={viewMode === 'week' ? 'primary' : 'ghost'} size="sm" onClick={() => setViewMode('week')}>
            {t('today.weekView')}
          </Button>
        </div>
      </div>

      <div className="relative flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => setSelectedDate((d) => addDays(d, -stepDays))}>
          <ChevronRight className="size-4 rtl:-scale-x-100" />
        </Button>
        <button
          type="button"
          onClick={() => {
            setPickerMonth(startOfMonth(selectedDate));
            setPickerOpen((v) => !v);
          }}
          className="inline-flex items-center gap-2 rounded-btn border border-bark/20 bg-white px-3 py-2 font-latin text-sm font-medium text-espresso hover:border-gold"
        >
          <CalendarDays className="size-4 text-gold" />
          {cairoDateString(selectedDate)}
        </button>
        <Button variant="ghost" size="sm" onClick={() => setSelectedDate((d) => addDays(d, stepDays))}>
          <ChevronLeft className="size-4 rtl:-scale-x-100" />
        </Button>
        <Button variant="secondary" size="sm" onClick={() => setSelectedDate(new Date())}>
          {t('today.jumpToday')}
        </Button>

        {pickerOpen ? (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setPickerOpen(false)} />
            <div className="absolute start-0 top-12 z-50 w-72 rounded-card border border-bark/15 bg-white p-3 shadow-lg">
              <div className="mb-2 flex items-center justify-between">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setPickerMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
                >
                  <ChevronRight className="size-4 rtl:-scale-x-100" />
                </Button>
                <p className="font-latin text-sm font-semibold">
                  {pickerMonth.getFullYear()}-{String(pickerMonth.getMonth() + 1).padStart(2, '0')}
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setPickerMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
                >
                  <ChevronLeft className="size-4 rtl:-scale-x-100" />
                </Button>
              </div>
              <div className="mb-1 grid grid-cols-7 gap-1 text-center text-[10px] text-ink-70">
                {dayLabels.map((label) => (
                  <span key={label}>{label.slice(0, 2)}</span>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {pickerDays.map((day, idx) =>
                  day ? (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        setSelectedDate(day);
                        setPickerOpen(false);
                      }}
                      className={cn(
                        'rounded-btn py-1.5 font-latin text-sm',
                        cairoDateString(day) === cairoDateString(selectedDate)
                          ? 'bg-gold text-espresso font-semibold'
                          : 'hover:bg-sand',
                      )}
                    >
                      {day.getDate()}
                    </button>
                  ) : (
                    <span key={idx} />
                  ),
                )}
              </div>
            </div>
          </>
        ) : null}
      </div>

      {statsQuery.isLoading ? (
        <KpiSkeleton />
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            { label: t('today.bookingsToday'), value: stats?.bookings_count ?? 0 },
            { label: t('today.pendingPayment'), value: stats?.pending_payment_count ?? 0 },
            { label: t('today.confirmedIncome'), value: formatEGPCompact(stats?.confirmed_income ?? 0) },
            { label: t('today.noShows'), value: stats?.no_show_count ?? 0 },
          ].map((kpi) => (
            <Card key={kpi.label}>
              <CardBody className="p-3">
                <p className="text-xs text-ink-70">{kpi.label}</p>
                <p className="mt-1 font-latin text-xl font-semibold">{kpi.value}</p>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      {bookingsQuery.isLoading ? (
        <Skeleton className="h-96" />
      ) : viewMode === 'day' ? (
        <Card>
          <CardBody className="overflow-x-auto p-0">
            <div className="relative min-w-[320px]">
              {hours.map((hour) => {
                const hourStart = hour * 60;
                const hourBookings = bookings.filter((b) => toCairo(b.start_at).getHours() === hour);
                return (
                  <div key={hour} className="relative grid min-h-16 grid-cols-[60px_1fr] border-b border-bark/10">
                    <div className="border-e border-bark/10 p-2 font-latin text-xs text-ink-70">
                      {hourLabel(hour)}
                    </div>
                    <div className="relative p-1">
                      {isToday && hour === now.getHours() ? (
                        <div
                          ref={nowLineRef}
                          className="absolute inset-x-0 z-10 border-t-2 border-gold"
                          style={{ top: `${((nowMinutes - hourStart) / 60) * 100}%` }}
                        >
                          <span className="absolute -top-3 start-0 text-xs font-medium text-gold">
                            {t('today.now')}
                          </span>
                        </div>
                      ) : null}
                      {hourBookings.map((b) => (
                        <button
                          key={b.id}
                          type="button"
                          onClick={() => setSelectedBooking(b)}
                          className="mb-1 w-full rounded-btn bg-sand/80 p-2 text-start text-sm transition-colors hover:bg-sand"
                          style={{ minHeight: `${Math.max(1, b.duration_minutes / 15) * 24}px` }}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate font-medium">
                              {first(b.profile)?.full_name?.split(' ')[0] ?? '—'}
                            </span>
                            <StatusBadge status={b.status} />
                          </div>
                          <p className="font-latin text-xs text-ink-70">
                            {formatCairoTime(b.start_at, i18n.language)}
                          </p>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardBody>
        </Card>
      ) : (
        <div className={cn('grid gap-1', viewMode === 'three' ? 'grid-cols-3' : 'grid-cols-7')}>
          {Array.from({ length: dayCount }).map((_, i) =>
            renderDayColumn(addDays(toCairo(bounds.start), i), viewMode === 'week'),
          )}
        </div>
      )}

      {!bookingsQuery.isLoading && bookings.length === 0 ? (
        <p className="py-8 text-center text-ink-70">{t('today.noBookings')}</p>
      ) : null}

      <BookingDetailPanel
        booking={selectedBooking}
        open={!!selectedBooking}
        onClose={() => setSelectedBooking(null)}
      />
    </div>
  );
}
