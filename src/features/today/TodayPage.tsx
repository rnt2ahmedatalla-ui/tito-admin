import { useMemo, useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, CalendarDays, Plus } from 'lucide-react';
import { addDays, getDaysInMonth, startOfMonth, getDay, parseISO } from 'date-fns';
import { supabase } from '@/lib/supabase';
import type { BookingWithRelations, DashboardStats, TimeOff, WorkingHours } from '@/types/database';
import { Card, CardBody } from '@/components/ui/Card';
import { KpiSkeleton, Skeleton } from '@/components/ui/Skeleton';
import { Button } from '@/components/ui/Button';
import { BookingDetailPanel } from '@/components/booking/BookingDetailPanel';
import { NotificationsBell } from '@/components/layout/NotificationsBell';
import { WalkInModal } from '@/features/walkin/WalkInForm';
import {
  cairoDayBounds,
  cairoWeekBounds,
  cairoRangeBounds,
  cairoDateString,
  formatCairoTime,
  toCairo,
  fromCairoLocal,
  hourLabel,
} from '@/lib/time';
import { formatEGPCompact } from '@/lib/money';
import { cn } from '@/lib/cn';
import { first, isOnlineBooking, isShopBooking } from '@/lib/booking';

type ViewMode = 'day' | 'three' | 'week';

type RecurringBreak = {
  id: string;
  reason: string;
  start_time: string;
  end_time: string;
  days_of_week: number[];
  is_active: boolean;
};

const HOUR_HEIGHT = 80;

function timeToMinutes(time: string): number {
  const [h, m] = String(time).split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function getStatusStyle(status: string) {
  switch (status) {
    case 'confirmed':
      return {
        stripe: 'bg-emerald-500',
        card: 'bg-emerald-50/90 hover:bg-emerald-100/90 border-emerald-200 text-emerald-950',
        badge: 'bg-emerald-100 text-emerald-800',
      };
    case 'pending_payment':
      return {
        stripe: 'bg-amber-500',
        card: 'bg-amber-50/90 hover:bg-amber-100/90 border-amber-200 text-amber-950',
        badge: 'bg-amber-100 text-amber-800',
      };
    case 'completed':
      return {
        stripe: 'bg-sky-500',
        card: 'bg-sky-50/90 hover:bg-sky-100/90 border-sky-200 text-sky-950',
        badge: 'bg-sky-100 text-sky-800',
      };
    case 'no_show':
      return {
        stripe: 'bg-rose-500',
        card: 'bg-rose-50/90 hover:bg-rose-100/90 border-rose-200 text-rose-950',
        badge: 'bg-rose-100 text-rose-800',
      };
    default:
      return {
        stripe: 'bg-zinc-400',
        card: 'bg-zinc-50 hover:bg-zinc-100 border-zinc-200 text-zinc-900',
        badge: 'bg-zinc-100 text-zinc-700',
      };
  }
}

export function TodayPage() {
  const { t, i18n } = useTranslation();
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [viewMode, setViewMode] = useState<ViewMode>('three');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerMonth, setPickerMonth] = useState(() => startOfMonth(new Date()));
  const [selectedBooking, setSelectedBooking] = useState<BookingWithRelations | null>(null);
  const nowLineRef = useRef<HTMLDivElement>(null);

  // Quick Walk-In Booking modal state
  const [walkInOpen, setWalkInOpen] = useState(false);
  const [walkInDate, setWalkInDate] = useState('');
  const [walkInTime, setWalkInTime] = useState('');

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
        .select(
          '*, profile:profiles!bookings_user_id_fkey(full_name, phone), payment:payments(*), extras:booking_extras(id, name_ar, name_en, price_egp)',
        )
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

  const breaksQuery = useQuery({
    queryKey: ['recurring-breaks'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('recurring_breaks')
        .select('*')
        .eq('is_active', true)
        .order('start_time', { ascending: true });
      if (error) throw error;
      return (data ?? []) as RecurringBreak[];
    },
    staleTime: 60_000,
  });

  const timeOffQuery = useQuery({
    queryKey: ['time-off', 'today', bounds.start, bounds.end],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('time_off')
        .select('*')
        .lt('start_at', bounds.end)
        .gt('end_at', bounds.start)
        .order('start_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as TimeOff[];
    },
    staleTime: 30_000,
  });


  const bookings = (bookingsQuery.data ?? []).filter(
    (b) => b.status !== 'cancelled' && b.status !== 'expired',
  );
  const stats = statsQuery.data;
  const breaks = breaksQuery.data ?? [];
  const timeOffs = timeOffQuery.data ?? [];

  const hours = useMemo(() => {
    const rows = (hoursQuery.data ?? []).filter((h) => !h.is_closed);
    if (rows.length === 0) return Array.from({ length: 14 }, (_, i) => i + 9);
    const parseHour = (time: string) => Number(String(time).slice(0, 2));
    const openH = Math.min(...rows.map((h) => parseHour(h.open_time)));
    const closeH = Math.max(...rows.map((h) => parseHour(h.close_time)));
    const start = Number.isFinite(openH) ? Math.max(0, openH) : 9;
    const end = Number.isFinite(closeH) ? Math.min(23, Math.max(start, closeH)) : 22;
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  }, [hoursQuery.data]);

  const gridStartHour = hours[0] ?? 9;
  const gridStartMinutes = gridStartHour * 60;
  const gridEndHour = hours[hours.length - 1] ?? 22;
  const gridEndMinutes = (gridEndHour + 1) * 60;
  const totalGridHeight = hours.length * HOUR_HEIGHT;

  const now = toCairo(new Date());
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  useEffect(() => {
    if (nowLineRef.current) {
      nowLineRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [selectedDate, viewMode]);

  const monthTitle = useMemo(() => {
    const localeCode = i18n.language?.startsWith('ar') ? 'ar-EG' : 'en-US';
    return new Intl.DateTimeFormat(localeCode, {
      month: 'long',
      year: 'numeric',
      timeZone: 'Africa/Cairo',
    }).format(selectedDate);
  }, [selectedDate, i18n.language]);

  const pickerDays = useMemo(() => {
    const firstDay = startOfMonth(pickerMonth);
    const lead = (getDay(firstDay) + 1) % 7;
    const total = getDaysInMonth(pickerMonth);
    const cells: Array<Date | null> = [];
    for (let i = 0; i < lead; i++) cells.push(null);
    for (let d = 1; d <= total; d++) {
      cells.push(new Date(pickerMonth.getFullYear(), pickerMonth.getMonth(), d));
    }
    return cells;
  }, [pickerMonth]);

  const fullDaysSun = (t('hours.days', { returnObjects: true }) as string[]) || [];
  const shortDaysSun = (t('hours.shortDays', { returnObjects: true }) as string[]) || [];
  const dayLabels = useMemo(() => {
    const indices = [6, 0, 1, 2, 3, 4, 5];
    return indices.map((i) => {
      const full = fullDaysSun[i] ?? '';
      let short = shortDaysSun[i];
      if (!short) {
        short = full.startsWith('ال') ? full.slice(2) : full.slice(0, 3);
      }
      return { short, full };
    });
  }, [fullDaysSun, shortDaysSun]);

  const daysList = useMemo(() => {
    const start = toCairo(bounds.start);
    return Array.from({ length: dayCount }).map((_, i) => addDays(start, i));
  }, [bounds.start, dayCount]);

  const blocksForDay = (day: Date) => {
    const dayStr = cairoDateString(day);
    const dow = toCairo(day).getDay();
    const dayBounds = cairoDayBounds(day);
    const dayStart = parseISO(dayBounds.start).getTime();
    const dayEnd = parseISO(dayBounds.end).getTime();

    const isClosed = hoursQuery.data?.find((h) => h.day_of_week === dow)?.is_closed ?? false;
    const dayBreaks = breaks.filter((br) => br.is_active && br.days_of_week.includes(dow));
    const dayOff = timeOffs.filter((to) => {
      const s = parseISO(to.start_at).getTime();
      const e = parseISO(to.end_at).getTime();
      return s < dayEnd && e > dayStart;
    });

    const coversFullDay = (to: (typeof dayOff)[number]) => {
      if (to.all_day) return true;
      const s = parseISO(to.start_at).getTime();
      const e = parseISO(to.end_at).getTime();
      return s <= dayStart && e >= dayEnd;
    };

    return { dayStr, isClosed, dayBreaks, dayOff, dayBounds, dayStart, dayEnd, coversFullDay };
  };

  const handleSlotClick = (day: Date, hour: number) => {
    const dateStr = cairoDateString(day);
    const pad = (n: number) => String(n).padStart(2, '0');
    const localIso = `${dateStr}T${pad(hour)}:00:00`;
    setWalkInDate(dateStr);
    setWalkInTime(fromCairoLocal(new Date(localIso)).toISOString());
    setWalkInOpen(true);
  };

  const handleFabClick = () => {
    const dateStr = cairoDateString(selectedDate);
    const nowH = toCairo(new Date()).getHours();
    const nextH = Math.min(21, Math.max(gridStartHour, nowH + 1));
    const pad = (n: number) => String(n).padStart(2, '0');
    const localIso = `${dateStr}T${pad(nextH)}:00:00`;
    setWalkInDate(dateStr);
    setWalkInTime(fromCairoLocal(new Date(localIso)).toISOString());
    setWalkInOpen(true);
  };

  const locale = i18n.language?.startsWith('ar') ? 'ar' : 'en';

  return (
    <div className="space-y-4">
      {/* Setmore Header with Month/Year Title & Notifications Bell */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-default pb-3.5">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedDate((d) => addDays(d, -stepDays))}
              aria-label="Previous"
            >
              <ChevronRight className="size-4 rtl:-scale-x-100" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedDate((d) => addDays(d, stepDays))}
              aria-label="Next"
            >
              <ChevronLeft className="size-4 rtl:-scale-x-100" />
            </Button>
          </div>

          <div>
            <h1 className="text-xl font-bold capitalize text-espresso sm:text-2xl">{monthTitle}</h1>
          </div>

          <Button
            variant="secondary"
            size="sm"
            className="ms-1 hidden sm:inline-flex"
            onClick={() => setSelectedDate(new Date())}
          >
            {t('today.jumpToday')}
          </Button>

          <button
            type="button"
            onClick={() => {
              setPickerMonth(startOfMonth(selectedDate));
              setPickerOpen((v) => !v);
            }}
            className="inline-flex items-center gap-1.5 rounded-btn border border-bark/20 bg-white px-2.5 py-1.5 font-latin text-xs font-medium text-espresso hover:border-gold"
          >
            <CalendarDays className="size-3.5 text-gold" />
            <span>{cairoDateString(selectedDate)}</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          {/* View mode switcher */}
          <div className="flex rounded-btn border border-bark/20 bg-white p-0.5 shadow-2xs">
            <button
              type="button"
              onClick={() => setViewMode('day')}
              className={cn(
                'rounded-btn px-2.5 py-1 text-xs font-medium transition-colors',
                viewMode === 'day' ? 'bg-gold text-espresso font-semibold' : 'text-ink-70 hover:text-espresso',
              )}
            >
              {t('today.dayView')}
            </button>
            <button
              type="button"
              onClick={() => setViewMode('three')}
              className={cn(
                'rounded-btn px-2.5 py-1 text-xs font-medium transition-colors',
                viewMode === 'three' ? 'bg-gold text-espresso font-semibold' : 'text-ink-70 hover:text-espresso',
              )}
            >
              {t('today.threeDayView')}
            </button>
            <button
              type="button"
              onClick={() => setViewMode('week')}
              className={cn(
                'rounded-btn px-2.5 py-1 text-xs font-medium transition-colors',
                viewMode === 'week' ? 'bg-gold text-espresso font-semibold' : 'text-ink-70 hover:text-espresso',
              )}
            >
              {t('today.weekView')}
            </button>
          </div>

          {/* Notifications bell in calendar header */}
          <div className="shrink-0">
            <NotificationsBell />
          </div>
        </div>
      </div>

      {/* Date picker modal/dropdown */}
      {pickerOpen ? (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setPickerOpen(false)} />
          <div className="absolute start-4 top-28 z-50 w-72 rounded-card border border-bark/15 bg-white p-3 shadow-lg">
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
            <div className="mb-1 grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-ink-70">
              {dayLabels.map((day, idx) => (
                <span
                  key={idx}
                  title={day.full}
                  className="truncate select-none py-0.5"
                >
                  {day.short}
                </span>
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

      {/* KPI Stats Bar */}
      {statsQuery.isLoading ? (
        <KpiSkeleton />
      ) : (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {[
            { label: t('today.bookingsToday'), value: stats?.bookings_count ?? 0 },
            { label: t('today.pendingPayment'), value: stats?.pending_payment_count ?? 0 },
            { label: t('today.confirmedIncome'), value: formatEGPCompact(stats?.confirmed_income ?? 0) },
            { label: t('today.noShows'), value: stats?.no_show_count ?? 0 },
          ].map((kpi) => (
            <Card key={kpi.label} className="border-default bg-white/90">
              <CardBody className="p-2.5">
                <p className="text-xs text-ink-70">{kpi.label}</p>
                <p className="mt-0.5 font-latin text-lg font-bold text-espresso">{kpi.value}</p>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      {/* Setmore Multi-Day Calendar Grid */}
      {bookingsQuery.isLoading ? (
        <Skeleton className="h-[520px] rounded-card" />
      ) : (
        <div className="relative overflow-hidden rounded-card border border-bark/15 bg-white shadow-warm-sm">
          {/* Calendar Scroll Area */}
          <div className="max-h-[calc(100dvh-17rem)] min-h-[460px] overflow-x-auto overflow-y-auto">
            <div className="flex min-w-[340px]">
              {/* Left sticky time axis column */}
              <div className="sticky start-0 z-20 w-14 shrink-0 bg-white border-e border-bark/15 sm:w-16">
                {/* Blank corner cell */}
                <div className="sticky top-0 z-30 h-16 border-b border-bark/15 bg-sand/30" />
                {/* Hour labels */}
                <div style={{ height: totalGridHeight }} className="relative">
                  {hours.map((hour, hIdx) => (
                    <div
                      key={hour}
                      style={{ top: hIdx * HOUR_HEIGHT }}
                      className="absolute inset-x-0 h-20 border-b border-bark/10 pe-1.5 pt-1 text-end font-latin text-[11px] font-medium text-ink-70"
                    >
                      {hourLabel(hour)}
                    </div>
                  ))}
                </div>
              </div>

              {/* Day Columns Container */}
              <div className="flex flex-1">
                {daysList.map((day) => {
                  const dayStr = cairoDateString(day);
                  const isTodayDay = dayStr === cairoDateString(new Date());
                  const { isClosed, dayBreaks, dayOff } = blocksForDay(day);
                  const dayBookings = bookings.filter((b) => cairoDateString(toCairo(b.start_at)) === dayStr);

                  const weekdayShort = new Intl.DateTimeFormat(
                    locale === 'ar' ? 'ar-EG' : 'en-US',
                    { weekday: 'short', timeZone: 'Africa/Cairo' },
                  ).format(day);
                  const dayNumber = toCairo(day).getDate();

                  const minColWidth =
                    viewMode === 'day'
                      ? 'min-w-[240px]'
                      : viewMode === 'three'
                        ? 'min-w-[145px] sm:min-w-[180px]'
                        : 'min-w-[120px]';

                  return (
                    <div
                      key={dayStr}
                      className={cn(
                        'flex flex-1 flex-col border-e border-bark/15 last:border-e-0',
                        minColWidth,
                        isClosed && 'bg-bark/[0.03]',
                      )}
                    >
                      {/* Strong Day Header (Sticky to Top) */}
                      <div
                        className={cn(
                          'sticky top-0 z-10 flex h-16 flex-col items-center justify-center border-b border-bark/15 px-1 py-1.5 transition-colors',
                          isTodayDay ? 'bg-gold/15' : 'bg-white',
                        )}
                      >
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-70">
                          {weekdayShort}
                        </span>
                        <div className="flex items-center gap-1">
                          <span
                            className={cn(
                              'flex size-7 items-center justify-center rounded-full font-latin text-sm font-bold',
                              isTodayDay
                                ? 'bg-gold text-espresso shadow-xs ring-2 ring-gold/40'
                                : 'text-espresso',
                            )}
                          >
                            {dayNumber}
                          </span>
                          {isClosed ? (
                            <span className="rounded bg-bark/10 px-1 py-0.5 text-[9px] font-semibold text-bark">
                              {t('today.closed')}
                            </span>
                          ) : null}
                          {dayOff.length > 0 ? (
                            <span className="rounded bg-amber-100 px-1 py-0.5 text-[9px] font-semibold text-amber-900">
                              {t('today.holiday')}
                            </span>
                          ) : null}
                        </div>
                      </div>

                      {/* Day Column Hours & Bookings */}
                      <div style={{ height: totalGridHeight }} className="relative select-none">
                        {/* Background hour slot lines & Tap-to-add trigger */}
                        {hours.map((hour, hIdx) => (
                          <div
                            key={hour}
                            style={{ top: hIdx * HOUR_HEIGHT }}
                            onClick={() => handleSlotClick(day, hour)}
                            title={t('today.tapToBook')}
                            className="group absolute inset-x-0 h-20 cursor-pointer border-b border-bark/10 transition-colors hover:bg-gold/10"
                          >
                            <span className="absolute end-1 top-1 hidden rounded bg-gold/20 p-0.5 text-gold-dark group-hover:block">
                              <Plus className="size-3" />
                            </span>
                          </div>
                        ))}

                        {/* Closed Day Texture Overlay */}
                        {isClosed ? (
                          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-bark/[0.04]">
                            <span className="rotate-45 select-none rounded bg-white/80 px-2 py-1 text-xs font-semibold text-bark/60 shadow-xs">
                              {t('today.closed')}
                            </span>
                          </div>
                        ) : null}

                        {/* Recurring Breaks */}
                        {dayBreaks.map((br) => {
                          const sMin = timeToMinutes(br.start_time);
                          const eMin = timeToMinutes(br.end_time);
                          const topPx = Math.max(0, ((sMin - gridStartMinutes) / 60) * HOUR_HEIGHT);
                          const hPx = Math.max(20, ((eMin - sMin) / 60) * HOUR_HEIGHT);
                          return (
                            <div
                              key={br.id}
                              style={{ top: `${topPx}px`, height: `${hPx}px` }}
                              className="pointer-events-none absolute inset-x-1 z-5 overflow-hidden rounded border border-dashed border-bark/30 bg-sand/80 px-1.5 py-0.5 text-[11px] text-ink-70"
                            >
                              <p className="truncate font-semibold">{t('today.break')}</p>
                              <p className="font-latin text-[10px] text-ink-70/80">
                                {String(br.start_time).slice(0, 5)}–{String(br.end_time).slice(0, 5)}
                              </p>
                            </div>
                          );
                        })}

                        {/* Time-off Blocks */}
                        {dayOff.map((to) => {
                          const sLocal = toCairo(to.start_at);
                          const eLocal = toCairo(to.end_at);
                          const sMin = to.all_day ? gridStartMinutes : sLocal.getHours() * 60 + sLocal.getMinutes();
                          const eMin = to.all_day ? gridEndMinutes : eLocal.getHours() * 60 + eLocal.getMinutes();
                          const topPx = Math.max(0, ((sMin - gridStartMinutes) / 60) * HOUR_HEIGHT);
                          const hPx = Math.max(22, ((eMin - sMin) / 60) * HOUR_HEIGHT);
                          return (
                            <div
                              key={to.id}
                              style={{ top: `${topPx}px`, height: `${hPx}px` }}
                              className="pointer-events-none absolute inset-x-1 z-5 overflow-hidden rounded border border-dashed border-gold/50 bg-gold/20 px-1.5 py-0.5 text-[11px] text-bark"
                            >
                              <p className="truncate font-semibold">{t('today.holiday')}</p>
                              {to.reason ? <p className="truncate text-[10px]">{to.reason}</p> : null}
                            </div>
                          );
                        })}

                        {/* Booking Cards in Time Slots */}
                        {dayBookings.map((b) => {
                          const bLocal = toCairo(b.start_at);
                          const bStartMin = bLocal.getHours() * 60 + bLocal.getMinutes();
                          const topPx = Math.max(0, ((bStartMin - gridStartMinutes) / 60) * HOUR_HEIGHT);
                          const heightPx = Math.max(38, (b.duration_minutes / 60) * HOUR_HEIGHT - 3);
                          const style = getStatusStyle(b.status);
                          const customerName = first(b.profile)?.full_name ?? '—';
                          const serviceName = locale === 'ar' ? b.service_name_ar : b.service_name_en;

                          return (
                            <div
                              key={b.id}
                              style={{ top: `${topPx}px`, height: `${heightPx}px` }}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedBooking(b);
                              }}
                              className={cn(
                                'absolute inset-x-1 z-10 flex cursor-pointer overflow-hidden rounded-md border shadow-2xs transition-all hover:scale-[1.01] hover:shadow-xs',
                                style.card,
                              )}
                            >
                              {/* Colored Status Stripe on edge */}
                              <div className={cn('w-1 shrink-0', style.stripe)} />

                              <div className="flex flex-1 flex-col justify-between overflow-hidden p-1 sm:p-1.5">
                                <div className="min-w-0">
                                    <div className="flex items-center justify-between gap-1">
                                      <p className="truncate text-xs font-bold leading-tight">
                                        {customerName}
                                      </p>
                                      <div className="flex shrink-0 items-center gap-1">
                                        {b.status === 'confirmed' ? (
                                          <span className="shrink-0 rounded bg-emerald-600/15 px-1 py-0.5 text-[9px] font-bold text-emerald-800 border border-emerald-600/30">
                                            {locale === 'ar' ? 'مؤكد' : 'Confirmed'}
                                          </span>
                                        ) : null}
                                        {isOnlineBooking(b) ? (
                                          <span className="shrink-0 rounded bg-sky-600/15 px-1 py-0.5 text-[9px] font-bold text-sky-800 border border-sky-600/30">
                                            {locale === 'ar' ? 'أونلاين' : 'Online'}
                                          </span>
                                        ) : isShopBooking(b) ? (
                                          <span className="shrink-0 rounded bg-amber-600/15 px-1 py-0.5 text-[9px] font-bold text-amber-800 border border-amber-600/30">
                                            {locale === 'ar' ? 'في المحل' : 'Shop'}
                                          </span>
                                        ) : null}
                                      </div>
                                    </div>
                                  <p className="truncate text-[11px] opacity-80">
                                    {serviceName}
                                  </p>
                                </div>
                                <div className="mt-0.5 flex items-center justify-between gap-1 text-[10px] opacity-75 font-latin">
                                  <span>{formatCairoTime(b.start_at, locale)}</span>
                                  <span>{b.duration_minutes}m</span>
                                </div>
                              </div>
                            </div>
                          );
                        })}

                        {/* Current Time Indicator Line */}
                        {isTodayDay && nowMinutes >= gridStartMinutes && nowMinutes <= gridEndMinutes ? (
                          <div
                            ref={nowLineRef}
                            style={{ top: `${((nowMinutes - gridStartMinutes) / 60) * HOUR_HEIGHT}px` }}
                            className="pointer-events-none absolute inset-x-0 z-20 border-t-2 border-red-500"
                          >
                            <span className="absolute -top-2 start-0 size-3.5 -translate-y-1/4 rounded-full bg-red-500 shadow-xs" />
                          </div>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Floating Action Button (+) */}
      <button
        type="button"
        onClick={handleFabClick}
        aria-label={t('today.newBooking')}
        className="fixed bottom-20 end-5 z-30 flex size-13 items-center justify-center rounded-full bg-gold text-espresso shadow-warm-lg transition-transform hover:scale-105 active:scale-95 sm:size-14 lg:bottom-8 lg:end-8"
      >
        <Plus className="size-6 stroke-[2.5]" />
      </button>

      {/* Shared Quick Walk-In Booking Modal */}
      <WalkInModal
        open={walkInOpen}
        onClose={() => setWalkInOpen(false)}
        initialDate={walkInDate}
        initialTime={walkInTime}
      />

      {/* Existing Booking Detail Panel */}
      <BookingDetailPanel
        booking={selectedBooking}
        open={!!selectedBooking}
        onClose={() => setSelectedBooking(null)}
      />
    </div>
  );
}
