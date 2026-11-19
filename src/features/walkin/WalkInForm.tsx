import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { z } from 'zod';
import { Check, MessageCircle, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Service } from '@/types/database';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { formatCairoDate, formatCairoTime, fromCairoLocal } from '@/lib/time';
import { buildWhatsAppUrl } from '@/lib/whatsapp';
import { formatEGP } from '@/lib/money';
import { mapError } from '@/lib/errors';

const phoneSchema = z.string().regex(/^01[0125][0-9]{8}$/);

function hhmmFromIso(iso: string): string {
  return formatCairoTime(iso, 'en').slice(0, 5);
}

function addOneHour(hhmm: string): string {
  const [h = 0, m = 0] = hhmm.split(':').map(Number);
  const total = (h * 60 + m + 60) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

type Mode = 'booking' | 'event';
type Customer = { id: string; full_name?: string | null; name?: string | null; phone?: string | null };

export interface WalkInFormProps {
  initialDate?: string;
  initialTime?: string;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export function WalkInForm({
  initialDate = '',
  initialTime = '',
  onSuccess,
  onCancel,
}: WalkInFormProps) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const isAr = i18n.language?.startsWith('ar');
  const locale = isAr ? 'ar' : 'en';

  const [mode, setMode] = useState<Mode>('booking');
  const [isNewCustomer, setIsNewCustomer] = useState(true);
  const [customerQ, setCustomerQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [picked, setPicked] = useState<Customer | null>(null);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [serviceId, setServiceId] = useState('');
  const [extraIds, setExtraIds] = useState<string[]>([]);
  const [date, setDate] = useState(initialDate);
  const [time, setTime] = useState(initialTime);
  const [paidCash, setPaidCash] = useState(true);
  const [slots, setSlots] = useState<string[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  // بعد الحجز: رسالة جاهزة تتعدّل وتتبعت للعميل
  const [done, setDone] = useState<{ phone: string; message: string } | null>(null);

  // بيانات الوقت المقفول
  const [eventTitle, setEventTitle] = useState('');
  const [eventStart, setEventStart] = useState(() => (initialTime ? hhmmFromIso(initialTime) : ''));
  const [eventEnd, setEventEnd] = useState(() => (initialTime ? addOneHour(hhmmFromIso(initialTime)) : ''));

  useEffect(() => {
    if (initialDate) setDate(initialDate);
    if (initialTime) setTime(initialTime);
  }, [initialDate, initialTime]);

  // لما تضغط على معاد في التقويم، بداية الوقت المقفول بتتملى أوتوماتيك
  useEffect(() => {
    if (!initialTime) return;
    const start = hhmmFromIso(initialTime);
    setEventStart(start);
    setEventEnd(addOneHour(start));
  }, [initialTime]);

  // تأخير البحث عشان ما يتبعتش مع كل حرف
  useEffect(() => {
    const id = setTimeout(() => setDebouncedQ(customerQ.trim()), 300);
    return () => clearTimeout(id);
  }, [customerQ]);

  const { data: services = [] } = useQuery({
    queryKey: ['services'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('services')
        .select('*')
        .eq('is_active', true)
        .eq('is_extra', false)
        .order('sort_order');
      if (error) throw error;
      return data as Service[];
    },
    staleTime: 60_000,
  });

  const { data: extras = [] } = useQuery({
    queryKey: ['services', 'extras-active'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('services')
        .select('*')
        .eq('is_active', true)
        .eq('is_extra', true)
        .order('sort_order');
      if (error) throw error;
      return data as Service[];
    },
    staleTime: 60_000,
  });

  const { data: found = [], isFetching: searching } = useQuery({
    queryKey: ['walkin-customers', debouncedQ],
    enabled: mode === 'booking' && !isNewCustomer && debouncedQ.length >= 2,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_search_customers', {
        p_q: debouncedQ,
        p_limit: 8,
        p_offset: 0,
      });
      if (error) throw error;
      return (data ?? []) as unknown as Customer[];
    },
    staleTime: 15_000,
  });

  const pickCustomer = (c: Customer) => {
    setPicked(c);
    setName(c.full_name ?? c.name ?? '');
    setPhone(c.phone ?? '');
    setCustomerQ('');
  };

  const clearCustomer = () => {
    setPicked(null);
    setName('');
    setPhone('');
  };

  const loadSlots = async () => {
    if (!date || !serviceId) return;
    setLoadingSlots(true);
    try {
      const { data, error } = await supabase.rpc('get_available_slots', {
        p_date: date,
        p_service_id: serviceId,
      });
      if (error) {
        toast.error(mapError(error, t));
        return;
      }
      const list = (data as Array<{ start_at: string }> | null) ?? [];
      setSlots(list.map((s) => s.start_at));
    } finally {
      setLoadingSlots(false);
    }
  };

  const buildLocalIso = (hhmm: string) => {
    const [h, m] = hhmm.split(':');
    return fromCairoLocal(new Date(`${date}T${h}:${m}:00`)).toISOString();
  };

  const resetAll = () => {
    setName('');
    setPhone('');
    setServiceId('');
    setExtraIds([]);
    setDate('');
    setTime('');
    setPaidCash(true);
    setSlots([]);
    setPicked(null);
    setCustomerQ('');
    setEventTitle('');
    setEventStart('');
    setEventEnd('');
    setLastError(null);
    setConflict(false);
  };

  const createMutation = useMutation({
    mutationFn: async (force: boolean) => {
      if (mode === 'event') {
        if (!date) throw new Error('DATE_REQUIRED');
        if (!eventTitle.trim()) throw new Error('TITLE_REQUIRED');
        if (!eventStart || !eventEnd) throw new Error('TIME_REQUIRED');
        if (eventEnd <= eventStart) throw new Error('END_BEFORE_START');
        const { error } = await supabase.from('time_off').insert({
          start_at: buildLocalIso(eventStart),
          end_at: buildLocalIso(eventEnd),
          reason: eventTitle.trim(),
          all_day: false,
        });
        if (error) throw error;
        return;
      }

      if (!name.trim()) throw new Error('NAME_REQUIRED');
      if (!phoneSchema.safeParse(phone.trim()).success) throw new Error('INVALID_PHONE');
      if (!serviceId) throw new Error('SERVICE_REQUIRED');

      const startAt = time || slots[0];
      if (!startAt) throw new Error('NO_SLOT');

      // الدالة الجديدة بتدعم الإضافات وبتبعت إشعار للعميل. لو لسه ما اتعملتش في قاعدة البيانات بنرجع للقديمة.
      const rpcUntyped = supabase.rpc.bind(supabase) as unknown as (
        fn: string,
        args: Record<string, unknown>,
      ) => Promise<{ error: { message: string } | null }>;
      const base = {
        p_name: name.trim(),
        p_phone: phone.trim(),
        p_service_id: serviceId,
        p_start_at: startAt,
        p_paid_cash: paidCash,
      };
      const ex = await rpcUntyped('admin_create_booking_ex', { ...base, p_extra_ids: extraIds, p_force: force });
      if (!ex.error) return;
      const missing = /admin_create_booking_ex|PGRST202|Could not find the function/i.test(ex.error.message);
      if (!missing) throw ex.error;
      if (extraIds.length > 0) throw new Error('EXTRAS_SQL_MISSING');
      const legacy = force
        ? await rpcUntyped('admin_create_booking_force', base)
        : await supabase.rpc('admin_create_booking', base);
      if (legacy.error) throw legacy.error;
    },
    onSuccess: async () => {
      toast.success(mode === 'event' ? (isAr ? 'تم حفظ الوقت المقفول' : 'Blocked time saved') : t('walkIn.create'));
      void queryClient.invalidateQueries({ queryKey: ['bookings'] });
      void queryClient.invalidateQueries({ queryKey: ['time-off'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      if (mode === 'booking') {
        // نبني الرسالة من بيانات الحجز اللي لسه قدامنا قبل ما الفورم يتفضى
        const svc = services.find((x) => x.id === serviceId);
        const startAt = time || slots[0] || '';
        const { data: st } = await supabase.from('settings').select('shop_name').eq('id', 1).maybeSingle();
        const shop = (st as { shop_name?: string | null } | null)?.shop_name || 'tito';
        const svcName = svc ? (isAr ? svc.name_ar : svc.name_en) : '';
        const when = startAt ? `${formatCairoDate(startAt, locale)} · ${formatCairoTime(startAt, locale)}` : '';
        const picked = extras.filter((x) => extraIds.includes(x.id));
        const extrasText = picked.map((x) => (isAr ? x.name_ar : x.name_en)).join(' + ');
        const totalPrice = Number(svc?.price_egp ?? 0) + picked.reduce((sum, x) => sum + Number(x.price_egp), 0);
        const price = svc ? formatEGP(totalPrice) : '';
        const message = isAr
          ? `أهلاً ${name.trim()} 👋\nحجزنا لك في ${shop}:\n• الخدمة: ${svcName}${extrasText ? ` + ${extrasText}` : ''}\n• الموعد: ${when}\n• السعر: ${price}\n${paidCash ? '• الدفع: اتدفع كاش ✅' : '• الدفع: في المحل لما تيجي'}\nمستنيينك 💈`
          : `Hi ${name.trim()} 👋\nYour booking at ${shop}:\n• Service: ${svcName}${extrasText ? ` + ${extrasText}` : ''}\n• When: ${when}\n• Price: ${price}\n${paidCash ? '• Payment: paid in cash ✅' : '• Payment: at the shop'}\nSee you soon 💈`;
        setDone({ phone: phone.trim(), message });
        return;
      }
      resetAll();
      onSuccess?.();
    },
    onError: (e) => {
      const raw = (e as { message?: string } | null)?.message ?? '';
      if (raw === 'EXTRAS_SQL_MISSING') {
        const m = isAr
          ? 'الإضافات محتاجة تشغيل ملف walkin-extras.sql في Supabase الأول'
          : 'Add-ons need the walkin-extras.sql file to be run in Supabase first';
        setLastError(m);
        toast.error(m);
        return;
      }
      const msg = mapError(e, t);
      setLastError(msg);
      if (raw.includes('SLOT_TAKEN')) setConflict(true);
      toast.error(msg);
    },
  });

  const bookingDisabled = !name || !phone || !serviceId || (!time && slots.length === 0) || conflict;
  const eventDisabled = !date || !eventTitle.trim() || !eventStart || !eventEnd;

  if (done) {
    const waUrl = buildWhatsAppUrl(done.phone, done.message);
    const finish = () => {
      setDone(null);
      resetAll();
      onSuccess?.();
    };
    return (
      <div className="space-y-3.5">
        <div className="flex items-center gap-2 rounded-btn bg-success/10 p-3 text-success">
          <Check className="size-5 shrink-0" aria-hidden />
          <p className="text-sm font-semibold">{isAr ? 'الحجز اتسجل' : 'Booking saved'}</p>
        </div>
        <div>
          <label htmlFor="walkin-msg" className="text-sm font-medium text-ink-70">
            {isAr ? 'رسالة للعميل (عدّل فيها براحتك)' : 'Message for the customer (edit freely)'}
          </label>
          <textarea
            id="walkin-msg"
            rows={8}
            value={done.message}
            onChange={(e) => setDone({ ...done, message: e.target.value })}
            className="mt-1 w-full rounded-btn border border-bark/20 bg-white p-3 text-sm leading-relaxed text-espresso"
          />
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" className="w-full" onClick={finish}>
            {isAr ? 'تم، من غير رسالة' : 'Done, no message'}
          </Button>
          {waUrl ? (
            <Button
              variant="primary"
              className="w-full"
              onClick={() => {
                window.open(waUrl, '_blank', 'noopener,noreferrer');
                finish();
              }}
            >
              <MessageCircle className="size-4" aria-hidden />
              {isAr ? 'ابعت واتساب' : 'Send WhatsApp'}
            </Button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3.5">
      {/* نوع الإدخال */}
      <div className="grid grid-cols-2 gap-1 rounded-btn border border-bark/20 bg-white p-0.5">
        {(['booking', 'event'] as Mode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => {
              setMode(m);
              setLastError(null);
            }}
            className={`rounded-btn px-3 py-2 text-sm transition-colors ${
              mode === m ? 'bg-gold font-semibold text-espresso' : 'text-ink-70 hover:text-espresso'
            }`}
          >
            {m === 'booking'
              ? isAr ? 'حجز عميل' : 'Customer booking'
              : isAr ? 'وقت مقفول (غير ظاهر للعميل)' : 'Blocked time (hidden)'}
          </button>
        ))}
      </div>

      {mode === 'booking' ? (
        <>
          {/* عميل جديد ولا من الموجودين */}
          <div className="grid grid-cols-2 gap-1 rounded-btn bg-sand/40 p-0.5">
            {[true, false].map((v) => (
              <button
                key={String(v)}
                type="button"
                onClick={() => {
                  setIsNewCustomer(v);
                  setPicked(null);
                  setName('');
                  setPhone('');
                }}
                className={`rounded-btn px-3 py-1.5 text-xs transition-colors ${
                  isNewCustomer === v ? 'bg-white font-semibold text-espresso shadow-2xs' : 'text-ink-70'
                }`}
              >
                {v ? (isAr ? 'عميل جديد' : 'New customer') : isAr ? 'من الموجودين' : 'Existing customer'}
              </button>
            ))}
          </div>

          {!isNewCustomer ? (
            <div className="space-y-2">
              {picked ? (
                <div className="flex items-center justify-between gap-2 rounded-btn border border-gold/40 bg-gold/10 px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-espresso">
                      {picked.full_name ?? picked.name ?? ''}
                    </p>
                    <p className="font-latin text-xs text-ink-70">{picked.phone ?? ''}</p>
                  </div>
                  <button type="button" onClick={clearCustomer} className="text-xs font-medium text-gold">
                    {isAr ? 'تغيير' : 'Change'}
                  </button>
                </div>
              ) : (
                <>
                  <Input
                    label={isAr ? 'ابحث بالاسم أو الرقم' : 'Search by name or phone'}
                    value={customerQ}
                    onChange={(e) => setCustomerQ(e.target.value)}
                    placeholder={isAr ? 'اكتب حرفين على الأقل' : 'Type at least 2 characters'}
                  />
                  {debouncedQ.length >= 2 ? (
                    <div className="max-h-44 divide-y divide-bark/10 overflow-y-auto rounded-btn border border-bark/10 bg-white">
                      {searching ? (
                        <p className="px-3 py-2 text-xs text-ink-70">{isAr ? 'بيدوّر...' : 'Searching...'}</p>
                      ) : found.length === 0 ? (
                        <p className="px-3 py-2 text-xs text-ink-70">{isAr ? 'مفيش عميل بالاسم ده' : 'No customer found'}</p>
                      ) : (
                        found.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => pickCustomer(c)}
                            className="flex w-full items-center justify-between gap-2 px-3 py-2 text-start hover:bg-sand/50"
                          >
                            <span className="truncate text-sm text-espresso">{c.full_name ?? c.name ?? ''}</span>
                            <span className="shrink-0 font-latin text-xs text-ink-70">{c.phone ?? ''}</span>
                          </button>
                        ))
                      )}
                    </div>
                  ) : null}
                </>
              )}
            </div>
          ) : null}

          <Input
            label={t('walkIn.name')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Ahmed Ali"
          />

          <Input
            label={t('walkIn.phone')}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="01012345678"
            inputMode="tel"
          />

          <div>
            <label className="text-sm font-medium text-ink-70">{isAr ? 'الخدمة' : 'Service'}</label>
            <select
              className="mt-1 min-h-11 w-full rounded-btn border border-bark/20 bg-white px-3 text-sm text-espresso"
              value={serviceId}
              onChange={(e) => {
                setServiceId(e.target.value);
                setSlots([]);
              }}
            >
              <option value="">— {isAr ? 'اختر' : 'Select'} —</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {locale === 'ar' ? s.name_ar : s.name_en} ({s.price_egp} EGP)
                </option>
              ))}
            </select>
          </div>

          {extras.length > 0 ? (
            <div>
              <p className="text-sm font-medium text-ink-70">{isAr ? 'إضافات (اختياري)' : 'Add-ons (optional)'}</p>
              <div className="mt-1 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {extras.map((x) => {
                  const on = extraIds.includes(x.id);
                  return (
                    <button
                      key={x.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setExtraIds((prev) => (on ? prev.filter((i) => i !== x.id) : [...prev, x.id]))}
                      className={`flex items-center gap-2 rounded-btn border p-2.5 text-start text-sm transition-colors ${
                        on ? 'border-gold bg-gold/15 ring-1 ring-gold' : 'border-bark/20 bg-white hover:bg-sand/40'
                      }`}
                    >
                      <span
                        aria-hidden
                        className={`flex size-5 shrink-0 items-center justify-center rounded-md border-2 ${
                          on ? 'border-gold bg-gold text-espresso' : 'border-bark/30'
                        }`}
                      >
                        {on ? <Check className="size-3" strokeWidth={3} /> : null}
                      </span>
                      <span className="min-w-0 flex-1 break-words text-espresso">{isAr ? x.name_ar : x.name_en}</span>
                      <span className="shrink-0 font-latin text-xs font-semibold text-bark">+{formatEGP(Number(x.price_egp))}</span>
                    </button>
                  );
                })}
              </div>
              {serviceId ? (
                <p className="mt-2 text-sm font-semibold text-espresso">
                  {isAr ? 'الإجمالي: ' : 'Total: '}
                  <span className="font-latin">
                    {formatEGP(
                      Number(services.find((x) => x.id === serviceId)?.price_egp ?? 0) +
                        extras.filter((x) => extraIds.includes(x.id)).reduce((sum, x) => sum + Number(x.price_egp), 0),
                    )}
                  </span>
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <Input
              label={t('walkIn.date')}
              type="date"
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                setSlots([]);
                if (time) {
                  const timePart = time.split('T')[1] || '10:00:00';
                  setTime(`${e.target.value}T${timePart}`);
                }
              }}
            />

            <div>
              <label className="text-sm font-medium text-ink-70">{t('walkIn.time')}</label>
              <div className="mt-1 flex gap-2">
                <input
                  type="time"
                  className="min-h-11 flex-1 rounded-btn border border-bark/20 bg-white px-3 font-latin text-sm text-espresso"
                  value={time ? formatCairoTime(time, 'en').slice(0, 5) : ''}
                  onChange={(e) => {
                    const [h, m] = e.target.value.split(':');
                    if (date && h && m) {
                      setTime(buildLocalIso(`${h}:${m}`));
                    }
                  }}
                />
                {serviceId && date ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    loading={loadingSlots}
                    onClick={() => void loadSlots()}
                    className="shrink-0"
                  >
                    {t('walkIn.time')}
                  </Button>
                ) : null}
              </div>
            </div>
          </div>

          {slots.length > 0 ? (
            <div>
              <p className="mb-1.5 text-xs font-medium text-ink-70">{t('today.emptySlot')}:</p>
              <div className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto rounded-btn border border-bark/10 bg-sand/30 p-2">
                {slots.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setTime(s)}
                    className={`rounded-btn border px-2.5 py-1 font-latin text-xs transition-colors ${
                      time === s ? 'border-gold bg-gold/20 font-semibold text-espresso' : 'border-bark/20 bg-white hover:bg-sand'
                    }`}
                  >
                    {formatCairoTime(s, locale)}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <label className="flex items-center gap-2 pt-1 text-sm text-espresso">
            <input
              type="checkbox"
              checked={paidCash}
              onChange={(e) => setPaidCash(e.target.checked)}
              className="size-4 accent-gold"
            />
            {t('walkIn.paidCash')}
          </label>
        </>
      ) : (
        <>
          <p className="text-xs text-ink-70">
            {isAr
              ? 'الوقت ده هيتقفل في التقويم، والعميل مش هيشوفه وهو بيحجز.'
              : 'This time will be blocked in the calendar and customers will not see it when booking.'}
          </p>

          <Input
            label={isAr ? 'اسم الوقت (مثلاً: استراحة، مشوار)' : 'Name (e.g. break, errand)'}
            value={eventTitle}
            onChange={(e) => setEventTitle(e.target.value)}
          />

          <Input
            label={t('walkIn.date')}
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="text-sm font-medium text-ink-70">{isAr ? 'من' : 'From'}</label>
              <input
                type="time"
                className="mt-1 min-h-11 w-full rounded-btn border border-bark/20 bg-white px-3 font-latin text-sm text-espresso"
                value={eventStart}
                onChange={(e) => setEventStart(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-ink-70">{isAr ? 'لحد' : 'To'}</label>
              <input
                type="time"
                className="mt-1 min-h-11 w-full rounded-btn border border-bark/20 bg-white px-3 font-latin text-sm text-espresso"
                value={eventEnd}
                onChange={(e) => setEventEnd(e.target.value)}
              />
            </div>
          </div>
        </>
      )}

      {lastError && !conflict ? (
        <div className="rounded-btn border border-red-200 bg-red-50 p-3 text-sm text-red-700">{lastError}</div>
      ) : null}

      {conflict && mode === 'booking' ? (
        <div className="space-y-2.5 rounded-btn border border-amber-300 bg-amber-50 p-3">
          <p className="text-sm text-amber-900">
            {isAr
              ? 'المعاد ده محجوز. تقدر تأكد الحجز فوقه، أو تختار معاد تاني.'
              : 'This slot is already booked. You can confirm on top of it, or pick another time.'}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setConflict(false);
                setLastError(null);
              }}
            >
              {isAr ? 'اختار معاد تاني' : 'Pick another time'}
            </Button>
            <Button
              variant="primary"
              size="sm"
              loading={createMutation.isPending}
              onClick={() => void createMutation.mutate(true)}
            >
              {isAr ? 'أكد فوق المعاد المحجوز' : 'Confirm on top'}
            </Button>
          </div>
        </div>
      ) : null}

      <div className="flex gap-2 pt-2">
        {onCancel ? (
          <Button variant="ghost" className="w-full" onClick={onCancel}>
            {isAr ? 'إلغاء' : 'Cancel'}
          </Button>
        ) : null}
        <Button
          variant="primary"
          className="w-full"
          loading={createMutation.isPending}
          disabled={mode === 'booking' ? bookingDisabled : eventDisabled}
          onClick={() => void createMutation.mutate(false)}
        >
          {mode === 'event'
            ? isAr ? 'احفظ الوقت المقفول' : 'Save blocked time'
            : t('walkIn.create')}
        </Button>
      </div>
    </div>
  );
}

export function WalkInModal({
  open,
  onClose,
  initialDate,
  initialTime,
}: {
  open: boolean;
  onClose: () => void;
  initialDate?: string;
  initialTime?: string;
}) {
  const { t } = useTranslation();

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-espresso/60 p-4 backdrop-blur-xs">
      <div className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-card border border-bark/15 bg-white p-5 shadow-warm-xl animate-fade">
        <div className="flex items-center justify-between border-b border-bark/10 pb-3">
          <h2 className="text-lg font-bold text-espresso">{t('today.newBooking')}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-btn p-1.5 text-ink-70 hover:bg-sand"
            aria-label="Close"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="mt-4">
          <WalkInForm
            initialDate={initialDate}
            initialTime={initialTime}
            onSuccess={onClose}
            onCancel={onClose}
          />
        </div>
      </div>
    </div>,
    document.body,
  );
}
