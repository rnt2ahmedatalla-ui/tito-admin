import { useMemo, useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { addDays } from 'date-fns';
import { supabase } from '@/lib/supabase';
import type { BookingWithRelations, DashboardStats } from '@/types/database';
import { Card, CardBody } from '@/components/ui/Card';
import { KpiSkeleton, Skeleton } from '@/components/ui/Skeleton';
import { StatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { BookingDetailPanel } from '@/components/booking/BookingDetailPanel';
import {
  cairoDayBounds,
  cairoWeekBounds,
  cairoDateString,
  formatCairoTime,
  toCairo,
  hourLabel,
} from '@/lib/time';
import { formatEGPCompact } from '@/lib/money';
import { cn } from '@/lib/cn';
import { first } from '@/lib/booking';

export function TodayPage() {
  const { t, i18n } = useTranslation();
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [viewMode, setViewMode] = useState<'day' | 'week'>('day');
  const [selectedBooking, setSelectedBooking] = useState<BookingWithRelations | null>(null);
  const nowLineRef = useRef<HTMLDivElement>(null);

  const bounds = viewMode === 'day'
    ? cairoDayBounds(selectedDate)
    : cairoWeekBounds(selectedDate);

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
        .select('*, profile:profiles(full_name, phone), payment:payments(*)')
        .gte('start_at', bounds.start)
        .lte('start_at', bounds.end)
        .order('start_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as BookingWithRelations[];
    },
    staleTime: 15_000,
  });

  const bookings = bookingsQuery.data ?? [];
  const stats = statsQuery.data;

  const hours = useMemo(() => Array.from({ length: 14 }, (_, i) => i + 8), []);

  useEffect(() => {
    if (viewMode === 'day' && nowLineRef.current) {
      nowLineRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [viewMode, bookings.length]);

  const now = toCairo(new Date());
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const isToday = cairoDateString(selectedDate) === cairoDateString(new Date());

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{t('today.title')}</h1>
        <div className="flex gap-1">
          <Button
            variant={viewMode === 'day' ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => setViewMode('day')}
          >
            {t('today.dayView')}
          </Button>
          <Button
            variant={viewMode === 'week' ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => setViewMode('week')}
          >
            {t('today.weekView')}
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => setSelectedDate((d) => addDays(d, -1))}>
          <ChevronRight className="size-4 rtl:-scale-x-100" />
        </Button>
        <span className="font-latin text-sm">{cairoDateString(selectedDate)}</span>
        <Button variant="ghost" size="sm" onClick={() => setSelectedDate((d) => addDays(d, 1))}>
          <ChevronLeft className="size-4 rtl:-scale-x-100" />
        </Button>
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
                <p className="text-xl font-semibold font-latin mt-1">{kpi.value}</p>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      {bookingsQuery.isLoading ? (
        <Skeleton className="h-96" />
      ) : viewMode === 'day' ? (
        <Card>
          <CardBody className="p-0 overflow-x-auto">
            <div className="relative min-w-[320px]">
              {hours.map((hour) => {
                const hourStart = hour * 60;
                const hourBookings = bookings.filter((b) => {
                  const start = toCairo(b.start_at);
                  return start.getHours() === hour;
                });

                return (
                  <div key={hour} className="grid grid-cols-[60px_1fr] border-b border-bark/10 min-h-16 relative">
                    <div className="p-2 text-xs text-ink-70 font-latin border-e border-bark/10">
                      {hourLabel(hour)}
                    </div>
                    <div className="p-1 relative">
                      {isToday && hour === now.getHours() ? (
                        <div
                          ref={nowLineRef}
                          className="absolute inset-x-0 border-t-2 border-gold z-10"
                          style={{ top: `${((nowMinutes - hourStart) / 60) * 100}%` }}
                        >
                          <span className="absolute -top-3 start-0 text-xs text-gold font-medium">
                            {t('today.now')}
                          </span>
                        </div>
                      ) : null}
                      {hourBookings.map((b) => (
                        <button
                          key={b.id}
                          type="button"
                          onClick={() => setSelectedBooking(b)}
                          className="mb-1 w-full rounded-btn bg-sand/80 p-2 text-start text-sm hover:bg-sand transition-colors"
                          style={{ minHeight: `${Math.max(1, b.duration_minutes / 15) * 24}px` }}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium truncate">
                              {first(b.profile)?.full_name?.split(' ')[0] ?? '—'}
                            </span>
                            <StatusBadge status={b.status} />
                          </div>
                          <p className="text-xs text-ink-70 font-latin">
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
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: 7 }).map((_, i) => {
            const day = addDays(toCairo(bounds.start), i);
            const dayStr = cairoDateString(day);
            const dayBookings = bookings.filter(
              (b) => cairoDateString(toCairo(b.start_at)) === dayStr,
            );
            return (
              <Card key={i} className="min-h-24">
                <CardBody className="p-2">
                  <p className="text-xs font-latin text-ink-70 mb-1">{dayStr.slice(8)}</p>
                  {dayBookings.map((b) => (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => setSelectedBooking(b)}
                      className={cn(
                        'mb-1 w-full rounded px-1 py-0.5 text-xs text-start',
                        'bg-sand/60 hover:bg-sand',
                      )}
                    >
                      {formatCairoTime(b.start_at, i18n.language)}
                    </button>
                  ))}
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}

      {!bookingsQuery.isLoading && bookings.length === 0 ? (
        <p className="text-center text-ink-70 py-8">{t('today.noBookings')}</p>
      ) : null}

      <BookingDetailPanel
        booking={selectedBooking}
        open={!!selectedBooking}
        onClose={() => setSelectedBooking(null)}
      />
    </div>
  );
}
