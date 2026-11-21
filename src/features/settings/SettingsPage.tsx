import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import type { Settings } from '@/types/database';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { mapError } from '@/lib/errors';
import { PushReminderCard } from './PushReminderCard';
import { AdminPushCard } from './AdminPushCard';
import { CalendarClock, CreditCard, Store, Smartphone, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/cn';

const settingsSchema = z.object({
  slot_step_min: z.coerce.number().min(5),
  min_hours_before: z.coerce.number().min(0),
  max_days_ahead: z.coerce.number().min(1),
  cancel_window_hours: z.coerce.number().min(0),
  hold_minutes: z.coerce.number().min(5),
  max_active_pending_per_user: z.coerce.number().min(1),
  auto_complete: z.boolean(),
  auto_confirm_payment: z.boolean(),
  auto_reminders: z.boolean(),
  reminder_minutes_before: z.coerce.number().min(5).max(10080),
  allow_pay_at_shop: z.boolean(),
  instapay_number: z.string().nullable(),
  vodafone_cash_number: z.string().nullable(),
  payment_note_ar: z.string().nullable(),
  payment_note_en: z.string().nullable(),
  shop_name: z.string().min(1),
  shop_whatsapp: z.string().nullable(),
  shop_location_url: z.string().nullable(),
  reminder_template_ar: z.string(),
  reminder_template_en: z.string(),
  confirmation_template_ar: z.string(),
  confirmation_template_en: z.string(),
  cancellation_template_ar: z.string(),
  cancellation_template_en: z.string(),
  booking_open: z.boolean(),
  hero_headline_ar: z.string().max(80).nullable(),
  hero_headline_en: z.string().max(80).nullable(),
  hero_support_ar: z.string().max(200).nullable(),
  hero_support_en: z.string().max(200).nullable(),
  about_ar: z.string().max(600).nullable(),
  about_en: z.string().max(600).nullable(),
  social_instagram: z.string().max(300).nullable(),
  social_facebook: z.string().max(300).nullable(),
  social_tiktok: z.string().max(300).nullable(),
  social_youtube: z.string().max(300).nullable(),
  booking_policy_ar: z.string().max(600).nullable(),
  booking_policy_en: z.string().max(600).nullable(),
  tagline_ar: z.string().max(100).nullable(),
  tagline_en: z.string().max(100).nullable(),
});

export function SettingsPage() {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<Partial<Settings>>({});
  const [dirty, setDirty] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [tab, setTab] = useState<'booking' | 'payment' | 'shop' | 'customer' | 'messages'>('booking');

  const { data, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const { data: s, error } = await supabase.from('settings').select('*').single();
      if (error) throw error;
      return s as Settings;
    },
    staleTime: 60_000,
  });

  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: async (payload: Partial<Settings>) => {
      const { error } = await supabase.from('settings').update(payload).eq('id', 1);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['settings'] });
      setDirty(false);
      toast.success(t('app.save'));
    },
    onError: (e) => toast.error(mapError(e, t)),
  });

  const update = (patch: Partial<Settings>) => {
    setForm((prev) => ({ ...prev, ...patch }));
    setDirty(true);
  };

  // الحقول الجديدة (السوشيال وسياسة الحجز) مش في تعريف الأنواع الحالي، فبنقراها بالاسم
  const extra = form as unknown as Record<string, string | null | undefined>;
  const updateExtra = (patch: Record<string, string>) => {
    setForm((prev) => ({ ...prev, ...patch }) as Partial<Settings>);
    setDirty(true);
  };
  const cleanText = (v: string | null | undefined) => (v ?? '').trim() || null;

  const saveSection = (override: Partial<Settings> = {}) => {
    const merged = { ...form, ...override };
    const parsed = settingsSchema.partial().safeParse(merged);
    if (!parsed.success) {
      const msg = parsed.error.issues[0]?.message ?? 'validation';
      toast.error(msg);
      return;
    }
    // Empty copy fields → null so customer site can fall back to defaults
    const data = { ...parsed.data } as Partial<Settings>;
    for (const key of [
      'tagline_ar',
      'tagline_en',
      'hero_headline_ar',
      'hero_headline_en',
      'hero_support_ar',
      'hero_support_en',
      'about_ar',
      'about_en',
    ] as const) {
      if (key in data && typeof data[key] === 'string' && !(data[key] as string).trim()) {
        data[key] = null;
      }
    }
    setForm(merged);
    void saveMutation.mutate(data);
  };

  if (isLoading) return <Skeleton className="h-96" />;

  const isAr = i18n.language?.startsWith('ar');
  const L = (ar: string, en: string) => (isAr ? ar : en);
  const saveAll = () =>
    saveSection({
      social_instagram: cleanText(extra.social_instagram),
      social_facebook: cleanText(extra.social_facebook),
      social_tiktok: cleanText(extra.social_tiktok),
      social_youtube: cleanText(extra.social_youtube),
      booking_policy_ar: cleanText(extra.booking_policy_ar),
      booking_policy_en: cleanText(extra.booking_policy_en),
    } as Partial<Settings>);

  const tabs = [
    { id: 'booking', icon: CalendarClock, label: L('الحجز', 'Booking') },
    { id: 'payment', icon: CreditCard, label: L('الدفع والصناديق', 'Payment & boxes') },
    { id: 'shop', icon: Store, label: L('المحل والتواصل', 'Shop & contact') },
    { id: 'customer', icon: Smartphone, label: L('واجهة العميل', 'Customer app') },
    { id: 'messages', icon: MessageSquare, label: L('الرسائل والتذكير', 'Messages & reminders') },
  ] as const;

  const bookingOpen = form.booking_open ?? true;
  const check = (checked: boolean, onChange: (v: boolean) => void, title: string, hint?: string) => (
    <label className="flex cursor-pointer items-start gap-3 rounded-btn border border-default bg-white p-3">
      <input type="checkbox" className="mt-1 size-5 shrink-0 accent-gold" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="min-w-0">
        <span className="font-medium">{title}</span>
        {hint ? <span className="mt-0.5 block text-sm text-ink-70">{hint}</span> : null}
      </span>
    </label>
  );
  const area = (field: keyof Settings, labelKey: string, max: number, rows = 2, ar = false) => (
    <label key={String(field)} className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-ink-70">{labelKey}</span>
      <textarea
        className="w-full rounded-btn border border-bark/20 bg-white px-3 py-2 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
        maxLength={max}
        rows={rows}
        value={(form[field] as string | null | undefined) ?? ''}
        onChange={(e) => update({ [field]: e.target.value } as Partial<Settings>)}
        dir={ar ? 'rtl' : 'ltr'}
      />
      <span className="text-xs text-ink-70 font-latin">{((form[field] as string | null | undefined) ?? '').length}/{max}</span>
    </label>
  );
  const policy = (field: 'booking_policy_ar' | 'booking_policy_en', label: string, ar: boolean) => (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-ink-70">{label}</span>
      <textarea rows={4} maxLength={600} dir={ar ? 'rtl' : 'ltr'}
        className="w-full rounded-btn border border-bark/20 bg-white px-3 py-2 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
        value={extra[field] ?? ''} onChange={(e) => updateExtra({ [field]: e.target.value })} />
    </label>
  );

  return (
    <div className="mx-auto w-full max-w-4xl space-y-5 pb-24">
      <h1 className="text-2xl font-semibold">{t('settings.title')}</h1>

      {/* مفتاح الحجز الرئيسي */}
      <div className={cn('flex items-center justify-between gap-3 rounded-card border p-4', bookingOpen ? 'border-success/40 bg-success/10' : 'border-danger/40 bg-danger/10')}>
        <div className="min-w-0">
          <p className="font-semibold">{t('settings.bookingOpen')}</p>
          <p className="text-sm text-ink-70">{bookingOpen ? L('العملاء يقدروا يحجزوا دلوقتي.', 'Customers can book now.') : L('الحجز واقف — العملاء مش هيقدروا يحجزوا.', 'Booking is paused.')}</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={bookingOpen}
          aria-label={t('settings.bookingOpen')}
          onClick={() => {
            if (bookingOpen) setConfirmClose(true);
            else {
              update({ booking_open: true });
              saveSection({ booking_open: true });
            }
          }}
          className={cn('relative h-8 w-14 shrink-0 rounded-full transition-colors', bookingOpen ? 'bg-success' : 'bg-ink-70/40')}
          dir="ltr"
        >
          <span className={cn('absolute top-1 size-6 rounded-full bg-white shadow transition-all', bookingOpen ? 'left-7' : 'left-1')} />
        </button>
      </div>

      {/* تبويبات */}
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="tablist">
        {tabs.map((x) => {
          const Icon = x.icon;
          return (
            <button key={x.id} type="button" role="tab" aria-selected={tab === x.id} onClick={() => setTab(x.id)}
              className={cn('inline-flex min-h-10 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors',
                tab === x.id ? 'border-gold bg-gold text-espresso' : 'border-default bg-white text-ink-70 hover:bg-sand')}>
              <Icon className="size-4" aria-hidden />
              {x.label}
            </button>
          );
        })}
      </div>

      {tab === 'booking' ? (
        <>
          <Card>
            <CardHeader>
              <h2 className="font-semibold">{L('قواعد الحجز', 'Booking rules')}</h2>
              <p className="text-sm text-ink-70">{L('بتتحكم في إزاي العميل بيحجز وبيلغي.', 'Controls how customers book and cancel.')}</p>
            </CardHeader>
            <CardBody className="grid gap-3 sm:grid-cols-2">
              <Input label={t('settings.slotStep')} type="number" value={form.slot_step_min ?? ''} onChange={(e) => update({ slot_step_min: Number(e.target.value) })} />
              <Input label={t('settings.minHoursBefore')} type="number" value={form.min_hours_before ?? ''} onChange={(e) => update({ min_hours_before: Number(e.target.value) })} />
              <Input label={t('settings.maxDaysAhead')} type="number" value={form.max_days_ahead ?? ''} onChange={(e) => update({ max_days_ahead: Number(e.target.value) })} />
              <Input label={t('settings.cancelWindow')} type="number" value={form.cancel_window_hours ?? ''} onChange={(e) => update({ cancel_window_hours: Number(e.target.value) })} />
              <Input label={t('settings.holdMinutes')} type="number" value={form.hold_minutes ?? ''} onChange={(e) => update({ hold_minutes: Number(e.target.value) })} />
              <Input label={t('settings.maxPending')} type="number" value={form.max_active_pending_per_user ?? ''} onChange={(e) => update({ max_active_pending_per_user: Number(e.target.value) })} />
            </CardBody>
          </Card>
          <Card>
            <CardHeader><h2 className="font-semibold">{L('التأكيد التلقائي', 'Automation')}</h2></CardHeader>
            <CardBody className="grid gap-3">
              {check(form.auto_confirm_payment ?? true, (v) => update({ auto_confirm_payment: v }), t('settings.autoConfirm'), t('settings.autoConfirmHint'))}
              <div className="rounded-btn border border-default bg-sand/40 p-3 text-sm">
                <p className="font-medium">{L('إكمال الحجوزات تلقائياً', 'Auto-complete bookings')}</p>
                <p className="mt-1 text-ink-70">{L('بعد ما معاد الحجز يخلص بعدد ساعات تحددها، الحجز بيتعلّم "تمت" لوحده من غير ما تدوس عليه (وبالتالي النقاط والإيراد بيتحسبوا). لو العميل ما جاش علّمه "ما حضرش" قبل الوقت ده.', 'Some hours after an appointment ends, it is marked "Completed" automatically so points and revenue are counted. If a customer did not show up, mark "No-show" before then.')}</p>
                <Link to="/more/extras" className="mt-2 inline-flex min-h-9 items-center rounded-btn bg-gold px-3 font-semibold text-espresso">{L('اضبط عدد الساعات (الإضافات والمميزات)', 'Set the hours (Extras & features)')}</Link>
              </div>
            </CardBody>
          </Card>
        </>
      ) : null}

      {tab === 'payment' ? (
        <>
          <Card>
            <CardHeader><h2 className="font-semibold">{t('settings.payment')}</h2></CardHeader>
            <CardBody className="grid gap-3">
              {check(form.allow_pay_at_shop ?? false, (v) => update({ allow_pay_at_shop: v }), t('settings.allowPayAtShop'))}
              <div className="grid gap-3 sm:grid-cols-2">
                <Input label={t('settings.instapay')} value={form.instapay_number ?? ''} onChange={(e) => update({ instapay_number: e.target.value })} />
                <Input label={t('settings.vodafone')} value={form.vodafone_cash_number ?? ''} onChange={(e) => update({ vodafone_cash_number: e.target.value })} />
              </div>
              <p className="text-xs text-ink-70">{t('settings.payLinkHint')}</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <Input label={t('settings.paymentNoteAr')} value={form.payment_note_ar ?? ''} onChange={(e) => update({ payment_note_ar: e.target.value })} />
                <Input label={t('settings.paymentNoteEn')} value={form.payment_note_en ?? ''} onChange={(e) => update({ payment_note_en: e.target.value })} />
              </div>
            </CardBody>
          </Card>
          <Card>
            <CardHeader><h2 className="font-semibold">{L('صناديق توزيع الربح', 'Profit boxes')}</h2></CardHeader>
            <CardBody className="space-y-2 text-sm">
              <p className="text-ink-70">{L('الصناديق اتنقلت لمكان واحد منظم جوه المالية، عشان مفيش تكرار.', 'Boxes moved into one tidy place inside Finance, to avoid duplicates.')}</p>
              <Link to="/more/finance?tab=plan" className="inline-flex min-h-9 items-center rounded-btn bg-gold px-3 font-semibold text-espresso">{L('افتح الخطة والأهداف', 'Open Plan & goals')}</Link>
            </CardBody>
          </Card>
        </>
      ) : null}

      {tab === 'shop' ? (
        <>
          <Card>
            <CardHeader><h2 className="font-semibold">{t('settings.shop')}</h2></CardHeader>
            <CardBody className="grid gap-3 sm:grid-cols-2">
              <Input label={t('settings.shopName')} value={form.shop_name ?? ''} onChange={(e) => update({ shop_name: e.target.value })} />
              <Input label={t('settings.shopWhatsapp')} value={form.shop_whatsapp ?? ''} onChange={(e) => update({ shop_whatsapp: e.target.value })} />
              <Input label={t('settings.shopLocation')} value={form.shop_location_url ?? ''} onChange={(e) => update({ shop_location_url: e.target.value })} />
              <Input label={t('settings.timezone')} value="Africa/Cairo" readOnly disabled />
            </CardBody>
          </Card>
          <Card>
            <CardHeader>
              <h2 className="font-semibold">{L('السوشيال', 'Social links')}</h2>
              <p className="text-sm text-ink-70">{L('اختياري. أي لينك فاضي مش هيظهر للعميل.', 'Optional. Empty links will not show to customers.')}</p>
            </CardHeader>
            <CardBody className="grid gap-3 sm:grid-cols-2">
              <Input label="Instagram" value={extra.social_instagram ?? ''} onChange={(e) => updateExtra({ social_instagram: e.target.value })} placeholder="https://instagram.com/..." dir="ltr" />
              <Input label="Facebook" value={extra.social_facebook ?? ''} onChange={(e) => updateExtra({ social_facebook: e.target.value })} placeholder="https://facebook.com/..." dir="ltr" />
              <Input label="TikTok" value={extra.social_tiktok ?? ''} onChange={(e) => updateExtra({ social_tiktok: e.target.value })} placeholder="https://tiktok.com/@..." dir="ltr" />
              <Input label="YouTube" value={extra.social_youtube ?? ''} onChange={(e) => updateExtra({ social_youtube: e.target.value })} placeholder="https://youtube.com/..." dir="ltr" />
            </CardBody>
          </Card>
          <Card>
            <CardHeader><h2 className="font-semibold">{L('سياسة الحجز', 'Booking policy')}</h2></CardHeader>
            <CardBody className="grid gap-3 sm:grid-cols-2">
              {policy('booking_policy_ar', L('عربي', 'Arabic'), true)}
              {policy('booking_policy_en', L('إنجليزي', 'English'), false)}
            </CardBody>
          </Card>
        </>
      ) : null}

      {tab === 'customer' ? (
        <Card>
          <CardHeader>
            <h2 className="font-semibold">{t('settings.customerUi')}</h2>
            <p className="text-sm text-ink-70">{t('settings.customerUiHint')}</p>
          </CardHeader>
          <CardBody className="grid gap-4 sm:grid-cols-2">
            {area('tagline_ar', t('settings.taglineAr'), 100, 2, true)}
            {area('tagline_en', t('settings.taglineEn'), 100)}
            {area('hero_headline_ar', t('settings.heroHeadlineAr'), 80, 2, true)}
            {area('hero_headline_en', t('settings.heroHeadlineEn'), 80)}
            {area('hero_support_ar', t('settings.heroSupportAr'), 200, 3, true)}
            {area('hero_support_en', t('settings.heroSupportEn'), 200, 3)}
            {area('about_ar', t('settings.aboutAr'), 600, 5, true)}
            {area('about_en', t('settings.aboutEn'), 600, 5)}
            <p className="text-sm text-ink-70 sm:col-span-2">{t('settings.customerUiSaveHint')}</p>
          </CardBody>
        </Card>
      ) : null}

      {tab === 'messages' ? (
        <>
          <AdminPushCard />
          <PushReminderCard />
          <Card>
            <CardHeader>
              <h2 className="font-semibold">{L('رسائل الواتساب', 'WhatsApp messages')}</h2>
              <p className="text-sm text-ink-70">{t('settings.placeholders')}</p>
            </CardHeader>
            <CardBody className="grid gap-3 sm:grid-cols-2">
              <Input label={t('settings.reminderAr')} value={form.reminder_template_ar ?? ''} onChange={(e) => update({ reminder_template_ar: e.target.value })} />
              <Input label={t('settings.reminderEn')} value={form.reminder_template_en ?? ''} onChange={(e) => update({ reminder_template_en: e.target.value })} />
              <Input label={t('settings.confirmAr')} value={form.confirmation_template_ar ?? ''} onChange={(e) => update({ confirmation_template_ar: e.target.value })} />
              <Input label={t('settings.confirmEn')} value={form.confirmation_template_en ?? ''} onChange={(e) => update({ confirmation_template_en: e.target.value })} />
              <Input label={t('settings.cancelAr')} value={form.cancellation_template_ar ?? ''} onChange={(e) => update({ cancellation_template_ar: e.target.value })} />
              <Input label={t('settings.cancelEn')} value={form.cancellation_template_en ?? ''} onChange={(e) => update({ cancellation_template_en: e.target.value })} />
            </CardBody>
          </Card>
        </>
      ) : null}

      {/* شريط حفظ ثابت */}
      {dirty ? (
        <div className="fixed inset-x-0 bottom-[4.75rem] z-40 px-3 lg:bottom-4 lg:start-64">
          <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 rounded-card border border-gold/50 bg-espresso px-4 py-3 text-white shadow-warm">
            <span className="text-sm">{t('app.dirty')}</span>
            <Button variant="primary" onClick={saveAll} loading={saveMutation.isPending}>{t('app.save')}</Button>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={confirmClose}
        title={t('settings.bookingOpen')}
        message={t('settings.bookingOpenOff')}
        loading={saveMutation.isPending}
        onConfirm={() => {
          setConfirmClose(false);
          saveSection({ booking_open: false });
        }}
        onCancel={() => setConfirmClose(false)}
      />
    </div>
  );
}
