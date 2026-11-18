import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, Check, MessageCircle, Users } from 'lucide-react';
import { addDays } from 'date-fns';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import type { BookingWithRelations, CustomerSearchResult, Settings } from '@/types/database';
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
  const [sentFilter, setSentFilter] = useState<'all' | 'unsent' | 'sent'>('unsent');
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
  const isAr = locale.startsWith('ar');
  const L = (ar: string, en: string) => (isAr ? ar : en);

  const counts = useMemo(() => {
    const all = bookingsQuery.data ?? [];
    const sentCount = all.filter((b) => !!b.reminder_sent_at).length;
    return { all: all.length, sent: sentCount, unsent: all.length - sentCount };
  }, [bookingsQuery.data]);

  const bookings = useMemo(() => {
    const all = bookingsQuery.data ?? [];
    if (sentFilter === 'unsent') return all.filter((b) => !b.reminder_sent_at);
    if (sentFilter === 'sent') return all.filter((b) => !!b.reminder_sent_at);
    return all;
  }, [bookingsQuery.data, sentFilter]);

  const sentLabel = (iso: string) => {
    const time = formatCairoTime(iso, locale);
    const sameDay = cairoDateString(new Date(iso)) === cairoDateString(new Date());
    return sameDay
      ? L(`اتبعت الساعة ${time}`, `Sent at ${time}`)
      : L(`اتبعت ${formatCairoDateShort(iso)} الساعة ${time}`, `Sent ${formatCairoDateShort(iso)} at ${time}`);
  };

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
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant={sentFilter === 'all' ? 'primary' : 'ghost'} size="sm" onClick={() => setSentFilter('all')}>
          {L('الكل', 'All')} <span className="font-latin">({counts.all})</span>
        </Button>
        <Button variant={sentFilter === 'unsent' ? 'primary' : 'ghost'} size="sm" onClick={() => setSentFilter('unsent')}>
          {t('reminders.notSent')} <span className="font-latin">({counts.unsent})</span>
        </Button>
        <Button variant={sentFilter === 'sent' ? 'primary' : 'ghost'} size="sm" onClick={() => setSentFilter('sent')}>
          {L('اتبعت', 'Sent')} <span className="font-latin">({counts.sent})</span>
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
                  sent && 'bg-sand/30',
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
                  {sent && booking.reminder_sent_at ? (
                    <div className="flex shrink-0 flex-col items-end gap-0.5 text-end">
                      <Check className="size-5 text-success" />
                      <span className="text-[11px] font-medium text-success">{sentLabel(booking.reminder_sent_at)}</span>
                    </div>
                  ) : null}
                </div>
                <p className="mt-2 text-xs text-ink-70 bg-sand/40 rounded-btn p-2 line-clamp-2">
                  {t('reminders.preview')}: {preview}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    variant={sent ? 'secondary' : 'primary'}
                    size="md"
                    onClick={() => openWhatsApp(booking, 'reminder')}
                  >
                    <MessageCircle className="size-4" />
                    {sent ? L('ابعت تاني', 'Send again') : t('reminders.sendReminder')}
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

function eventLabel(kind: string, isAr: boolean): string {
  if (kind.includes('cancel')) return isAr ? 'اتلغى' : 'Cancelled';
  if (kind.includes('move') || kind.includes('resched')) return isAr ? 'اتغير المعاد' : 'Rescheduled';
  return isAr ? 'اتحجز' : 'Booked';
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
                      {eventLabel(n.kind ?? '', !!isAr)}: 
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


const CUSTOMER_URL = import.meta.env.VITE_CUSTOMER_URL || 'https://tito-customer.vercel.app';
const INACTIVE_OPTIONS = [7, 15, 30, 60];
const CONTACTED_KEY = 'tito.inactive.contacted';

function readContacted(): Record<string, string> {
  try {
    const raw = window.localStorage.getItem(CONTACTED_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function InactiveSection() {
  const { i18n } = useTranslation();
  const isAr = !!i18n.language?.startsWith('ar');
  const L = (ar: string, en: string) => (isAr ? ar : en);
  const [days, setDays] = useState(15);
  const [contacted, setContacted] = useState<Record<string, string>>(readContacted);

  const settingsQuery = useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const { data, error } = await supabase.from('settings').select('*').single();
      if (error) throw error;
      return data as Settings;
    },
    staleTime: 60_000,
  });

  // كل العملاء (الدالة بترجع آخر زيارة لكل عميل)
  const customersQuery = useQuery({
    queryKey: ['inactive-customers'],
    queryFn: async () => {
      const all: CustomerSearchResult[] = [];
      const pageSize = 100;
      for (let page = 0; page < 20; page += 1) {
        const { data, error } = await supabase.rpc('admin_search_customers', {
          p_q: '',
          p_limit: pageSize,
          p_offset: page * pageSize,
        });
        if (error) throw error;
        const rows = (data ?? []) as CustomerSearchResult[];
        all.push(...rows);
        if (rows.length < pageSize) break;
      }
      return all;
    },
    staleTime: 60_000,
  });

  // اللي عنده حجز جاي مش غايب
  const upcomingQuery = useQuery({
    queryKey: ['inactive-upcoming-ids'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bookings')
        .select('user_id')
        .in('status', ['confirmed', 'pending_payment'])
        .gte('start_at', new Date().toISOString());
      if (error) throw error;
      return new Set((data ?? []).map((r) => r.user_id as string | null).filter((x): x is string => !!x));
    },
    staleTime: 60_000,
  });

  const list = useMemo(() => {
    const upcoming = upcomingQuery.data ?? new Set<string>();
    const now = Date.now();
    return (customersQuery.data ?? [])
      .filter((c) => !c.is_blocked && !!c.phone && !!c.last_visit && !upcoming.has(c.id))
      .map((c) => ({ c, away: Math.floor((now - new Date(c.last_visit as string).getTime()) / 86_400_000) }))
      .filter((x) => x.away >= days)
      .sort((a, b) => b.away - a.away);
  }, [customersQuery.data, upcomingQuery.data, days]);

  const sendMessage = (c: CustomerSearchResult, away: number) => {
    const shop = settingsQuery.data?.shop_name || 'tito';
    const link = `${CUSTOMER_URL}/book`;
    const name = c.full_name || '';
    const message = isAr
      ? `أهلاً ${name} 👋\nوحشتنا في ${shop}! بقالك ${away} يوم ما زرتناش. تحب نحجزلك معاد؟\nتقدر تحجز من هنا: ${link}`
      : `Hi ${name} 👋\nWe miss you at ${shop}! It has been ${away} days since your last visit. Would you like to book your next appointment?\nBook here: ${link}`;
    const url = buildWhatsAppUrl(c.phone ?? '', message);
    if (!url) {
      toast.error(L('العميل مفيش عنده رقم واتساب صالح', 'This customer has no valid WhatsApp number'));
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
    const next = { ...contacted, [c.id]: new Date().toISOString() };
    setContacted(next);
    try {
      window.localStorage.setItem(CONTACTED_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };

  const isLoading = customersQuery.isLoading || upcomingQuery.isLoading;

  return (
    <div className="space-y-4">
      <div className="border-b border-default pb-4">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-gold font-latin">WhatsApp</p>
        <h1 className="mt-1 text-2xl font-bold text-espresso">{L('العملاء الغايبين', 'Inactive customers')}</h1>
        <p className="mt-2 max-w-2xl text-sm text-ink-70">
          {L(
            'العملاء اللي ماحجزوش من فترة، ومعاهم رسالة واتساب جاهزة ترجّعهم.',
            'Customers who have not booked for a while, with a ready WhatsApp message to bring them back.',
          )}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-ink-70">{L('بقالهم', 'Away for')}</span>
        {INACTIVE_OPTIONS.map((n) => (
          <Button key={n} variant={days === n ? 'primary' : 'ghost'} size="sm" onClick={() => setDays(n)}>
            <span className="font-latin">{n}</span> {L('يوم أو أكتر', 'days or more')}
          </Button>
        ))}
      </div>

      {isLoading ? (
        <Skeleton className="h-48" />
      ) : customersQuery.isError ? (
        <p className="text-sm text-danger">{L('حصلت مشكلة في تحميل العملاء', 'Could not load customers')}</p>
      ) : list.length === 0 ? (
        <p className="py-8 text-center text-ink-70">
          {L('مفيش عملاء غايبين في المدة دي', 'No inactive customers for this period')}
        </p>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-ink-70">
            <span className="font-latin font-semibold text-espresso">{list.length}</span> {L('عميل', 'customers')}
          </p>
          {list.slice(0, 100).map(({ c, away }) => {
            const doneAt = contacted[c.id];
            return (
              <div key={c.id} className="rounded-card border border-default bg-white p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-espresso">{c.full_name || '—'}</p>
                    <p className="mt-0.5 font-latin text-sm text-ink-70" dir="ltr">
                      {c.phone}
                    </p>
                    <p className="mt-1 text-sm text-ink-70">
                      {L('آخر زيارة', 'Last visit')}:{' '}
                      <span className="font-latin">{c.last_visit ? formatCairoDateShort(c.last_visit) : '—'}</span>{' '}
                      ({L('من', '')} <span className="font-latin">{away}</span> {L('يوم', 'days ago')})
                    </p>
                  </div>
                  {doneAt ? (
                    <div className="flex shrink-0 flex-col items-end gap-0.5 text-end">
                      <Check className="size-5 text-success" />
                      <span className="text-[11px] font-medium text-success">
                        {L('اتبعتله', 'Messaged')} {formatCairoDateShort(doneAt)}
                      </span>
                    </div>
                  ) : null}
                </div>
                <div className="mt-3">
                  <Button variant={doneAt ? 'secondary' : 'primary'} size="md" onClick={() => sendMessage(c, away)}>
                    <MessageCircle className="size-4" />
                    {doneAt ? L('ابعت تاني', 'Send again') : L('ابعت رسالة', 'Send message')}
                  </Button>
                </div>
              </div>
            );
          })}
          {list.length > 100 ? (
            <p className="text-center text-xs text-ink-70">
              {L('بنعرض أول 100 عميل بس', 'Showing the first 100 customers only')}
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}

export function RemindersPage() {
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith('ar');
  const [section, setSection] = useState<'new' | 'reminders' | 'inactive'>('new');
  const { unread } = useAdminNotifications();

  const tabs = [
    { key: 'new' as const, label: isAr ? 'الجديدة' : 'New', icon: Bell, badge: unread },
    { key: 'reminders' as const, label: isAr ? 'التذكيرات' : 'Reminders', icon: MessageCircle, badge: 0 },
    { key: 'inactive' as const, label: isAr ? 'الغايبين' : 'Inactive', icon: Users, badge: 0 },
  ];

  return (
    <div className="space-y-4">
      {/* تبويبين فوق: كل واحد بيفتح قسمه لوحده، من غير ما تنزل تحت */}
      <div className="grid grid-cols-3 gap-2 rounded-card border border-default bg-white p-1.5">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = section === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setSection(tab.key)}
              className={cn(
                'relative flex items-center justify-center gap-2 rounded-btn px-3 py-2.5 text-sm font-semibold transition-colors',
                active ? 'bg-gold text-espresso' : 'text-ink-70 hover:bg-sand/50 hover:text-espresso',
              )}
            >
              <Icon className="size-4" aria-hidden />
              {tab.label}
              {tab.badge > 0 ? (
                <span className="ms-1 rounded-full bg-espresso px-2 py-0.5 text-[11px] text-cream">
                  {tab.badge}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {section === 'new' ? (
        <div className="rounded-card border border-gold/40 bg-white p-4 sm:p-5">
          <NewBookingsSection />
        </div>
      ) : section === 'inactive' ? (
        <div className="rounded-card border border-default bg-white p-4 sm:p-5">
          <InactiveSection />
        </div>
      ) : (
        <div className="rounded-card border border-default bg-sand/40 p-4 sm:p-5">
          <p className="mb-4 text-xs font-medium uppercase tracking-[0.18em] text-gold font-latin">
            {isAr ? 'رسائل واتساب قبل المعاد' : 'WhatsApp messages before appointments'}
          </p>
          <RemindersSection />
        </div>
      )}
    </div>
  );
}
