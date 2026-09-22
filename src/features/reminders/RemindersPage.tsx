import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, MessageCircle } from 'lucide-react';
import { addDays } from 'date-fns';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import type { BookingWithRelations, Settings } from '@/types/database';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { cairoDayBounds, formatCairoTime, formatCairoDateShort } from '@/lib/time';
import { buildWhatsAppUrl, fillTemplate } from '@/lib/whatsapp';
import { mapError } from '@/lib/errors';
import { cn } from '@/lib/cn';
import { first } from '@/lib/booking';

type Tab = 'today' | 'tomorrow' | 'upcoming';

export function RemindersPage() {
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
