import { useEffect, useState } from 'react';
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
  tagline_ar: z.string().max(100).nullable(),
  tagline_en: z.string().max(100).nullable(),
});

export function SettingsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<Partial<Settings>>({});
  const [dirty, setDirty] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{t('settings.title')}</h1>
        {dirty ? <span className="text-sm text-warning">{t('app.dirty')}</span> : null}
      </div>

      <Card>
        <CardHeader><h2 className="font-semibold">{t('settings.master')}</h2></CardHeader>
        <CardBody>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={form.booking_open ?? true}
              onChange={(e) => {
                if (!e.target.checked) setConfirmClose(true);
                else {
                  update({ booking_open: true });
                  saveSection({ booking_open: true });
                }
              }}
              className="size-6 accent-gold"
            />
            <span className="text-lg font-semibold">{t('settings.bookingOpen')}</span>
          </label>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="font-semibold">{t('settings.automation')}</h2>
          <p className="text-sm text-ink-70">{t('settings.automationHint')}</p>
        </CardHeader>
        <CardBody className="grid gap-4">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              className="mt-1 size-5 accent-gold"
              checked={form.auto_confirm_payment ?? true}
              onChange={(e) => update({ auto_confirm_payment: e.target.checked })}
            />
            <span>
              <span className="font-medium">{t('settings.autoConfirm')}</span>
              <span className="mt-0.5 block text-sm text-ink-70">{t('settings.autoConfirmHint')}</span>
            </span>
          </label>

          <div className="rounded-btn border border-bark/15 bg-sand/30 p-3 text-sm text-ink-70">
            {t('settings.manualRemindersOnly')}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="primary"
              onClick={() => saveSection({ auto_reminders: false })}
              loading={saveMutation.isPending}
            >
              {t('app.save')}
            </Button>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader><h2 className="font-semibold">{t('settings.booking')}</h2></CardHeader>
        <CardBody className="grid gap-3 sm:grid-cols-2">
          <Input label={t('settings.slotStep')} type="number" value={form.slot_step_min ?? ''} onChange={(e) => update({ slot_step_min: Number(e.target.value) })} />
          <Input label={t('settings.minHoursBefore')} type="number" value={form.min_hours_before ?? ''} onChange={(e) => update({ min_hours_before: Number(e.target.value) })} />
          <Input label={t('settings.maxDaysAhead')} type="number" value={form.max_days_ahead ?? ''} onChange={(e) => update({ max_days_ahead: Number(e.target.value) })} />
          <Input label={t('settings.cancelWindow')} type="number" value={form.cancel_window_hours ?? ''} onChange={(e) => update({ cancel_window_hours: Number(e.target.value) })} />
          <Input label={t('settings.holdMinutes')} type="number" value={form.hold_minutes ?? ''} onChange={(e) => update({ hold_minutes: Number(e.target.value) })} />
          <Input label={t('settings.maxPending')} type="number" value={form.max_active_pending_per_user ?? ''} onChange={(e) => update({ max_active_pending_per_user: Number(e.target.value) })} />
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={form.auto_complete ?? false} onChange={(e) => update({ auto_complete: e.target.checked })} />
            {t('settings.autoComplete')}
          </label>
          <Button variant="primary" onClick={() => saveSection()} loading={saveMutation.isPending}>{t('app.save')}</Button>
        </CardBody>
      </Card>

      <Card>
        <CardHeader><h2 className="font-semibold">{t('settings.payment')}</h2></CardHeader>
        <CardBody className="grid gap-3">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={form.allow_pay_at_shop ?? false} onChange={(e) => update({ allow_pay_at_shop: e.target.checked })} />
            {t('settings.allowPayAtShop')}
          </label>
          <Input label={t('settings.instapay')} value={form.instapay_number ?? ''} onChange={(e) => update({ instapay_number: e.target.value })} />
          <p className="text-xs text-ink-70">{t('settings.payLinkHint')}</p>
          <Input label={t('settings.vodafone')} value={form.vodafone_cash_number ?? ''} onChange={(e) => update({ vodafone_cash_number: e.target.value })} />
          <Input label={t('settings.paymentNoteAr')} value={form.payment_note_ar ?? ''} onChange={(e) => update({ payment_note_ar: e.target.value })} />
          <Input label={t('settings.paymentNoteEn')} value={form.payment_note_en ?? ''} onChange={(e) => update({ payment_note_en: e.target.value })} />
          <Button variant="primary" onClick={() => saveSection()} loading={saveMutation.isPending}>{t('app.save')}</Button>
        </CardBody>
      </Card>

      <Card>
        <CardHeader><h2 className="font-semibold">{t('settings.shop')}</h2></CardHeader>
        <CardBody className="grid gap-3">
          <Input label={t('settings.shopName')} value={form.shop_name ?? ''} onChange={(e) => update({ shop_name: e.target.value })} />
          <Input label={t('settings.shopWhatsapp')} value={form.shop_whatsapp ?? ''} onChange={(e) => update({ shop_whatsapp: e.target.value })} />
          <Input label={t('settings.shopLocation')} value={form.shop_location_url ?? ''} onChange={(e) => update({ shop_location_url: e.target.value })} />
          <Input label={t('settings.timezone')} value="Africa/Cairo" readOnly disabled />
          <Button variant="primary" onClick={() => saveSection()} loading={saveMutation.isPending}>{t('app.save')}</Button>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="font-semibold">{t('settings.customerUi')}</h2>
          <p className="text-sm text-ink-70">{t('settings.customerUiHint')}</p>
        </CardHeader>
        <CardBody className="grid gap-4">
          {(
            [
              ['tagline_ar', 'taglineAr', 100],
              ['tagline_en', 'taglineEn', 100],
              ['hero_headline_ar', 'heroHeadlineAr', 80],
              ['hero_headline_en', 'heroHeadlineEn', 80],
              ['hero_support_ar', 'heroSupportAr', 200],
              ['hero_support_en', 'heroSupportEn', 200],
              ['about_ar', 'aboutAr', 600],
              ['about_en', 'aboutEn', 600],
            ] as const
          ).map(([field, labelKey, max]) => (
            <label key={field} className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-ink-70">{t(`settings.${labelKey}`)}</span>
              <textarea
                className="min-h-20 w-full rounded-btn border border-bark/20 bg-white px-3 py-2 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
                maxLength={max}
                rows={field.startsWith('about') ? 5 : 2}
                value={(form[field] as string | null | undefined) ?? ''}
                onChange={(e) => update({ [field]: e.target.value })}
                dir={field.endsWith('_ar') ? 'rtl' : 'ltr'}
              />
              <span className="text-xs text-ink-70 font-latin">
                {((form[field] as string | null | undefined) ?? '').length}/{max}
              </span>
            </label>
          ))}
          <p className="text-sm text-ink-70">{t('settings.customerUiSaveHint')}</p>
          <Button
            variant="primary"
            onClick={() =>
              saveSection({
                tagline_ar: form.tagline_ar ?? null,
                tagline_en: form.tagline_en ?? null,
                hero_headline_ar: form.hero_headline_ar ?? null,
                hero_headline_en: form.hero_headline_en ?? null,
                hero_support_ar: form.hero_support_ar ?? null,
                hero_support_en: form.hero_support_en ?? null,
                about_ar: form.about_ar ?? null,
                about_en: form.about_en ?? null,
              })
            }
            loading={saveMutation.isPending}
          >
            {t('app.save')}
          </Button>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="font-semibold">{t('settings.messages')}</h2>
          <p className="text-sm text-ink-70">{t('settings.placeholders')}</p>
        </CardHeader>
        <CardBody className="grid gap-3">
          <Input label={t('settings.reminderAr')} value={form.reminder_template_ar ?? ''} onChange={(e) => update({ reminder_template_ar: e.target.value })} />
          <Input label={t('settings.reminderEn')} value={form.reminder_template_en ?? ''} onChange={(e) => update({ reminder_template_en: e.target.value })} />
          <Input label={t('settings.confirmAr')} value={form.confirmation_template_ar ?? ''} onChange={(e) => update({ confirmation_template_ar: e.target.value })} />
          <Input label={t('settings.confirmEn')} value={form.confirmation_template_en ?? ''} onChange={(e) => update({ confirmation_template_en: e.target.value })} />
          <Input label={t('settings.cancelAr')} value={form.cancellation_template_ar ?? ''} onChange={(e) => update({ cancellation_template_ar: e.target.value })} />
          <Input label={t('settings.cancelEn')} value={form.cancellation_template_en ?? ''} onChange={(e) => update({ cancellation_template_en: e.target.value })} />
          <Button variant="primary" onClick={() => saveSection()} loading={saveMutation.isPending}>{t('app.save')}</Button>
        </CardBody>
      </Card>

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
