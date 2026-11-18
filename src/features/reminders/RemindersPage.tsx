import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, MessageCircle } from 'lucide-react';
import { addDays } from 'date-fns';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import type { BookingWithRelations, Settings } from '@/types/database';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { cairoDayBounds, cairoDateString, toCairo, formatCairoTime, formatCairoDateShort } from '@/lib/time';
import { useAdminNotifications, type AdminNotification } from '@/hooks/useAdminNotifications';
import { buildWhatsAppUrl, fillTemplate } from '@/lib/whatsapp';
import { mapError } from '@/lib/errors';
import { cn } from '@/lib/cn';
import { first } from '@/lib/booking';

type Tab = 'today' | 'tomorrow' | 'upcoming';

function RemindersSection() {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>('upcoming');
  const [notSentOnly, setNotSentOnly] = useState(true);
  const [focusIndex, setFocusIndex] = useState(0);

  const range = useMemo(() => {
    if (tab === 'today') return cairoDayBounds(new Date());
    if (tab === 'tomorrow') return cairoDayBounds(addDays(new Date(), 1));
    // Upcoming: today → +14 days
    const start = cairoDayBounds(new Date()).start;
    const end = cairoDayBounds(addDays(new Date(), 14)).end;
    return { start, end };
  }, [tab]);

  const settingsQuery = useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const { data, error } = await supabase.from('settings').select('*').single();
      if (error) throw error;
      return data as Settings;
    },
    staleTime: 60_000,
  });

  const bookingsQuery = useQuery({
    queryKey: ['reminders', tab, range.start, range.end],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bookings')
        .select('*, profile:profiles!bookings_user_id_fkey(full_name, phone)')
        .eq('status', 'confirmed')
        .gte('start_at', range.start)
        .lte('start_at', range.end)
        .order('start_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as BookingWithRelations[];
    },
    staleTime: 15_000,
  });

  const markSent = useMutation({
    mutationFn: async (bookingId: string) => {
      const { error } = await supabase.rpc('admin_mark_reminder_sent', { p_booking_id: bookingId });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['reminders'] });
      setFocusIndex((i) => i + 1);
    },
    onError: (e) => toast.error(mapError(e, t)),
  });

  const settings = settingsQuery.data;
  const locale = i18n.language;
  const bookings = useMemo(() => {
    const all = bookingsQuery.data ?? [];
    return notSentOnly ? all.filter((b) => !b.reminder_sent_at) : all;
  }, [bookingsQuery.data, notSentOnly]);

  const buildMessage = (booking: BookingWithRelations, type: 'reminder' | 'confirmation' | 'cancellation') => {
    if (!settings) return '';
    const templateKey = {
      reminder: locale === 'ar' ? settings.reminder_template_ar : settings.reminder_template_en,
      confirmation: locale === 'ar' ? settings.confirmation_template_ar : settings.confirmation_template_en,
      cancellation: locale === 'ar' ? settings.cancellation_template_ar : settings.cancellation_template_en,
    }[type];

    return fillTemplate(templateKey, {
      name: first(booking.profile)?.full_name ?? '',
      time: formatCairoTime(booking.start_at, locale),
      date: formatCairoDateShort(booking.start_at),
      service: locale === 'ar' ? booking.service_name_ar : booking.service_name_en,
      shop: settings.shop_name,
    });
  };

  const openWhatsApp = (booking: BookingWithRelations, type: 'reminder' | 'confirmation' | 'cancellation') => {
    const phone = first(booking.profile)?.phone ?? '';
    const message = buildMessage(booking, type);
    const url = buildWhatsAppUrl(phone, message);
    if (!url) {
      toast.error(t('reminders.noPhone'));
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
    if (type === 'reminder') void markSent.mutate(booking.id);
  };

  return (
    <div className="space-y-4">
      <div className="border-b border-default pb-4">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-gold font-latin">WhatsApp</p>
        <h1 className="mt-1 text-2xl font-bold text-espresso">{t('reminders.title')}</h1>
        <p className="mt-2 max-w-2xl text-sm text-ink-70">{t('reminders.howBody')}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant={tab === 'today' ? 'primary' : 'ghost'} size="sm" onClick={() => setTab('today')}>
          {t('reminders.today')}
        </Button>
        <Button variant={tab === 'tomorrow' ? 'primary' : 'ghost'} size="sm" onClick={() => setTab('tomorrow')}>
          {t('reminders.tomorrow')}
        </Button>
        <Button variant={tab === 'upcoming' ? 'primary' : 'ghost'} size="sm" onClick={() => setTab('upcoming')}>
          {t('reminders.upcoming')}
        </Button>
        <Button
          variant={notSentOnly ? 'primary' : 'ghost'}
          size="sm"
          onClick={() => setNotSentOnly((v) => !v)}
        >
          {t('reminders.notSent')}
        </Button>
      </div>

      {bookingsQuery.isLoading ? (
        <Skeleton className="h-48" />
      ) : bookings.length === 0 ? (
        <div className="space-y-2 py-8 text-center">
          <p className="text-ink-70">{t('reminders.empty')}</p>
          <p className="text-sm text-ink-70">{t('reminders.emptyHint')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {bookings.map((booking, i) => {
            const sent = !!booking.reminder_sent_at;
            const preview = buildMessage(booking, 'reminder');
            return (
              <div
                key={booking.id}
                className={cn(
                  'rounded-card border bg-white p-4',
                  sent && 'opacity-60',
                  i === focusIndex && 'ring-2 ring-gold/30',
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">{first(booking.profile)?.full_name}</p>
                    <p className="text-sm font-latin text-ink-70">
                      {formatCairoDateShort(booking.start_at)} · {formatCairoTime(booking.start_at, locale)} —{' '}
                      {first(booking.profile)?.phone}
                    </p>
                    <p className="text-sm text-ink-70">
                      {locale === 'ar' ? booking.service_name_ar : booking.service_name_en}
                    </p>
                  </div>
                  {sent ? <Check className="size-5 text-success shrink-0" /> : null}
                </div>
                <p className="mt-2 text-xs text-ink-70 bg-sand/40 rounded-btn p-2 line-clamp-2">
                  {t('reminders.preview')}: {preview}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    variant="primary"
                    size="md"
                    disabled={sent}
                    onClick={() => openWhatsApp(booking, 'reminder')}
                  >
                    <MessageCircle className="size-4" />
                    {t('reminders.sendReminder')}
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => openWhatsApp(booking, 'confirmation')}>
                    {t('reminders.sendConfirmation')}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => openWhatsApp(booking, 'cancellation')}>
                    {t('reminders.sendCancellation')}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

type NotifBooking = {
  id: string;
  start_at: string;
  service_name_ar: string;
  service_name_en: string;
  guest_name: string | null;
  profile: { full_name: string | null } | { full_name: string | null }[] | null;
};

function labelForKind(kind: string, isAr: boolean): string {
  if (kind.includes('cancel')) return isAr ? 'إلغاء' : 'Cancelled';
  if (kind.includes('move') || kind.includes('resched')) return isAr ? 'تغيير معاد' : 'Rescheduled';
  return isAr ? 'حجز جديد' : 'New booking';
}

function NewBookingsSection() {
  const { i18n } = useTranslation();
  const navigate = useNavigate();
  const isAr = i18n.language?.startsWith('ar');
  const { data = [], unread, markOne } = useAdminNotifications();

  const items: AdminNotification[] = useMemo(
    () =>
      data
        .filter((n) => (n.kind ?? '').startsWith('booking') || n.entity === 'booking')
        .slice(0, 40),
    [data],
  );

  const ids = useMemo(
    () => Array.from(new Set(items.map((n) => n.entity_id).filter((x): x is string => !!x))),
    [items],
  );

  const bookingsQuery = useQuery({
    queryKey: ['notif-bookings', ids],
    enabled: ids.length > 0,
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from('bookings')
        .select('id, start_at, service_name_ar, service_name_en, guest_name, profile:profiles!bookings_user_id_fkey(full_name)')
        .in('id', ids);
      if (error) throw error;
      return (rows ?? []) as unknown as NotifBooking[];
    },
    staleTime: 15_000,
  });

  const byId = useMemo(
    () => new Map((bookingsQuery.data ?? []).map((b) => [b.id, b])),
    [bookingsQuery.data],
  );

  const open = (n: AdminNotification) => {
    if (!n.is_read) markOne.mutate(n.id);
    const b = n.entity_id ? byId.get(n.entity_id) : undefined;
    if (b) {
      navigate(`/?date=${cairoDateString(toCairo(b.start_at))}&booking=${b.id}`);
    } else {
      navigate('/bookings');
    }
  };

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-espresso">{isAr ? 'الجديدة' : 'New'}</h2>
        {unread > 0 ? (
          <span className="rounded-full bg-gold px-2.5 py-0.5 text-xs font-semibold text-espresso">
            {unread}
          </span>
        ) : null}
      </div>

      {items.length === 0 ? (
        <p className="py-4 text-sm text-ink-70">{isAr ? 'مفيش حجوزات جديدة دلوقتي' : 'No new bookings right now'}</p>
      ) : (
        <ul className="space-y-2">
          {items.map((n) => {
            const b = n.entity_id ? byId.get(n.entity_id) : undefined;
            const name = (b ? first(b.profile)?.full_name || b.guest_name : null) || (isAr ? n.title_ar : n.title_en);
            const service = b
              ? isAr ? b.service_name_ar : b.service_name_en
              : (isAr ? n.body_ar : n.body_en) ?? '';
            return (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => open(n)}
                  className={cn(
                    'flex w-full items-start gap-3 rounded-card border p-4 text-start transition-colors hover:bg-sand/40',
                    n.is_read ? 'border-default bg-white' : 'border-gold/50 bg-gold/10',
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      {!n.is_read ? <span className="size-2 shrink-0 rounded-full bg-gold" aria-hidden /> : null}
                      <p className="truncate font-semibold text-espresso">{name}</p>
                      <span className="shrink-0 rounded-btn bg-sand px-2 py-0.5 text-[11px] text-ink-70">
                        {labelForKind(n.kind ?? '', !!isAr)}
                      </span>
                    </div>
                    {service ? <p className="mt-1 truncate text-sm text-ink-70">{service}</p> : null}
                    {b ? (
                      <p className="mt-1 text-sm font-latin text-espresso">
                        {isAr ? 'الموعد: ' : 'Appointment: '}
                        {formatCairoDateShort(b.start_at)} · {formatCairoTime(b.start_at, i18n.language)}
                      </p>
                    ) : null}
                    <p className="mt-1 text-xs text-ink-70">
                      {isAr ? 'اتحجز: ' : 'Booked: '}
                      <span className="font-latin">
                        {formatCairoDateShort(n.created_at)} · {formatCairoTime(n.created_at, i18n.language)}
                      </span>
                    </p>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export function RemindersPage() {
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith('ar');
  return (
    <div className="space-y-10">
      <NewBookingsSection />
      <section className="space-y-3">
        <h2 className="text-lg font-bold text-espresso">{isAr ? 'التذكيرات' : 'Reminders'}</h2>
        <RemindersSection />
      </section>
    </div>
  );
}
