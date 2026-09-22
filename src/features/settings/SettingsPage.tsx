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
  reminder_template_ar: z.string(),
  reminder_template_en: z.string(),
  confirmation_template_ar: z.string(),
  confirmation_template_en: z.string(),
  cancellation_template_ar: z.string(),
  cancellation_template_en: z.string(),
  booking_open: z.boolean(),
});

type WaSecrets = {
  wa_phone_number_id: string;
  wa_access_token: string;
};

export function SettingsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<Partial<Settings>>({});
  const [wa, setWa] = useState<WaSecrets>({ wa_phone_number_id: '', wa_access_token: '' });
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

  const secretsQuery = useQuery({
    queryKey: ['integration-secrets'],
    queryFn: async () => {
      const { data: row, error } = await supabase
        .from('integration_secrets')
        .select('wa_phone_number_id, wa_access_token')
        .eq('id', 1)
        .maybeSingle();
      if (error) throw error;
      return row as { wa_phone_number_id: string | null; wa_access_token: string | null } | null;
    },
    staleTime: 60_000,
  });

  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  useEffect(() => {
    if (secretsQuery.data) {
      setWa({
        wa_phone_number_id: secretsQuery.data.wa_phone_number_id ?? '',
        wa_access_token: secretsQuery.data.wa_access_token ?? '',
      });
    }
  }, [secretsQuery.data]);

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

  const saveWaMutation = useMutation({
    mutationFn: async (payload: WaSecrets) => {
      const { error } = await supabase.from('integration_secrets').upsert({
        id: 1,
        wa_phone_number_id: payload.wa_phone_number_id.trim() || null,
        wa_access_token: payload.wa_access_token.trim() || null,
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['integration-secrets'] });
      toast.success(t('app.save'));
    },
    onError: (e) => toast.error(mapError(e, t)),
  });

  const update = (patch: Partial<Settings>) => {
    setForm((prev) => ({ ...prev, ...patch }));
    setDirty(true);
  };

  const saveSection = () => {
    const parsed = settingsSchema.partial().safeParse(form);
    if (!parsed.success) return;
    void saveMutation.mutate(parsed.data);
  };

  if (isLoading) return <Skeleton className="h-96" />;

  const waConfigured = Boolean(
    (secretsQuery.data?.wa_phone_number_id || wa.wa_phone_number_id) &&
      (secretsQuery.data?.wa_access_token || wa.wa_access_token),
  );

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
                else update({ booking_open: true });
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

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              className="mt-1 size-5 accent-gold"
              checked={form.auto_reminders ?? true}
              onChange={(e) => update({ auto_reminders: e.target.checked })}
            />
            <span>
              <span className="font-medium">{t('settings.autoReminders')}</span>
              <span className="mt-0.5 block text-sm text-ink-70">{t('settings.autoRemindersHint')}</span>
            </span>
          </label>

          <Input
            label={t('settings.reminderMinutesBefore')}
            type="number"
            value={form.reminder_minutes_before ?? 60}
            onChange={(e) => update({ reminder_minutes_before: Number(e.target.value) })}
          />

          <div className="rounded-btn border border-bark/15 bg-sand/30 p-3 text-sm text-ink-70">
            {waConfigured ? t('settings.waReady') : t('settings.waNeeded')}
          </div>

          <Input
            label={t('settings.waPhoneNumberId')}
            value={wa.wa_phone_number_id}
            onChange={(e) => setWa((prev) => ({ ...prev, wa_phone_number_id: e.target.value }))}
            dir="ltr"
          />
          <Input
            label={t('settings.waAccessToken')}
            type="password"
            value={wa.wa_access_token}
            onChange={(e) => setWa((prev) => ({ ...prev, wa_access_token: e.target.value }))}
            dir="ltr"
            autoComplete="off"
          />

          <div className="flex flex-wrap gap-2">
            <Button variant="primary" onClick={saveSection} loading={saveMutation.isPending}>
              {t('app.save')}
            </Button>
            <Button
              variant="secondary"
              onClick={() => void saveWaMutation.mutate(wa)}
              loading={saveWaMutation.isPending}
            >
              {t('settings.saveWa')}
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
          <Button variant="primary" onClick={saveSection} loading={saveMutation.isPending}>{t('app.save')}</Button>
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
          <Input label={t('settings.vodafone')} value={form.vodafone_cash_number ?? ''} onChange={(e) => update({ vodafone_cash_number: e.target.value })} />
          <Input label={t('settings.paymentNoteAr')} value={form.payment_note_ar ?? ''} onChange={(e) => update({ payment_note_ar: e.target.value })} />
          <Input label={t('settings.paymentNoteEn')} value={form.payment_note_en ?? ''} onChange={(e) => update({ payment_note_en: e.target.value })} />
          <Button variant="primary" onClick={saveSection} loading={saveMutation.isPending}>{t('app.save')}</Button>
        </CardBody>
      </Card>

      <Card>
        <CardHeader><h2 className="font-semibold">{t('settings.shop')}</h2></CardHeader>
        <CardBody className="grid gap-3">
          <Input label={t('settings.shopName')} value={form.shop_name ?? ''} onChange={(e) => update({ shop_name: e.target.value })} />
          <Input label={t('settings.shopWhatsapp')} value={form.shop_whatsapp ?? ''} onChange={(e) => update({ shop_whatsapp: e.target.value })} />
          <Input label={t('settings.timezone')} value="Africa/Cairo" readOnly disabled />
          <Button variant="primary" onClick={saveSection} loading={saveMutation.isPending}>{t('app.save')}</Button>
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
          <Button variant="primary" onClick={saveSection} loading={saveMutation.isPending}>{t('app.save')}</Button>
        </CardBody>
      </Card>

      <ConfirmDialog
        open={confirmClose}
        title={t('settings.bookingOpen')}
        message={t('settings.bookingOpenOff')}
        loading={saveMutation.isPending}
        onConfirm={() => {
          update({ booking_open: false });
          setConfirmClose(false);
          saveSection();
        }}
        onCancel={() => setConfirmClose(false)}
      />
    </div>
  );
}
