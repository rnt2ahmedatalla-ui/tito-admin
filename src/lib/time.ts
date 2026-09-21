import {
  addDays,
  endOfDay,
  parseISO,
  startOfDay,
  startOfWeek,
  endOfWeek,
} from 'date-fns';
import { formatInTimeZone, toZonedTime, fromZonedTime } from 'date-fns-tz';

export const CAIRO_TZ = 'Africa/Cairo';

export function toCairo(date: Date | string): Date {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return toZonedTime(d, CAIRO_TZ);
}

export function fromCairoLocal(date: Date): Date {
  return fromZonedTime(date, CAIRO_TZ);
}

export function formatCairoTime(iso: string, locale: string = 'ar'): string {
  const pattern = locale === 'ar' ? 'h:mm a' : 'h:mm a';
  const formatted = formatInTimeZone(iso, CAIRO_TZ, pattern);
  if (locale === 'ar') {
    return formatted.replace('AM', 'ص').replace('PM', 'م');
  }
  return formatted;
}

export function formatCairoDate(iso: string, locale: string = 'ar'): string {
  const pattern = locale === 'ar' ? 'EEEE d MMMM' : 'EEEE, MMM d';
  return formatInTimeZone(iso, CAIRO_TZ, pattern, { locale: undefined });
}

export function formatCairoDateShort(iso: string): string {
  return formatInTimeZone(iso, CAIRO_TZ, 'd/M/yyyy');
}

export function cairoDayBounds(date: Date): { start: string; end: string } {
  const local = toZonedTime(date, CAIRO_TZ);
  const dayStart = startOfDay(local);
  const dayEnd = endOfDay(local);
  return {
    start: fromZonedTime(dayStart, CAIRO_TZ).toISOString(),
    end: fromZonedTime(dayEnd, CAIRO_TZ).toISOString(),
  };
}

export function cairoWeekBounds(date: Date): { start: string; end: string } {
  const local = toZonedTime(date, CAIRO_TZ);
  const weekStart = startOfWeek(local, { weekStartsOn: 6 });
  const weekEnd = endOfWeek(local, { weekStartsOn: 6 });
  return {
    start: fromZonedTime(startOfDay(weekStart), CAIRO_TZ).toISOString(),
    end: fromZonedTime(endOfDay(weekEnd), CAIRO_TZ).toISOString(),
  };
}

export function cairoDateString(date: Date): string {
  return formatInTimeZone(date, CAIRO_TZ, 'yyyy-MM-dd');
}

export function addCairoDays(date: Date, days: number): Date {
  return addDays(toZonedTime(date, CAIRO_TZ), days);
}

export function minutesSince(iso: string): number {
  const then = parseISO(iso).getTime();
  const now = Date.now();
  return Math.floor((now - then) / 60000);
}

export function formatWaitTime(minutes: number, t: (key: string, opts?: Record<string, unknown>) => string): string {
  if (minutes < 60) return t('time.waitMinutes', { count: minutes });
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (mins === 0) return t('time.waitHours', { count: hours });
  return t('time.waitHoursMinutes', { hours, minutes: mins });
}

export function buildDateRangeQuery(from: string, to: string): { gte: string; lte: string } {
  return { gte: from, lte: to };
}

export function hourLabel(hour: number): string {
  const period = hour < 12 ? 'ص' : 'م';
  const h = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${h}:00 ${period}`;
}

export function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

export function minutesToTime(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
