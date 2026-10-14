import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { z } from 'zod';
import { X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Service } from '@/types/database';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { formatCairoTime, fromCairoLocal } from '@/lib/time';
import { mapError } from '@/lib/errors';

const phoneSchema = z.string().regex(/^01[0125][0-9]{8}$/);

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
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [serviceId, setServiceId] = useState('');
  const [date, setDate] = useState(initialDate);
  const [time, setTime] = useState(initialTime);
  const [paidCash, setPaidCash] = useState(true);
  const [slots, setSlots] = useState<string[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);

  useEffect(() => {
    if (initialDate) setDate(initialDate);
    if (initialTime) setTime(initialTime);
  }, [initialDate, initialTime]);

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

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error('NAME_REQUIRED');
      if (!phoneSchema.safeParse(phone.trim()).success) throw new Error('INVALID_PHONE');
      if (!serviceId) throw new Error('SERVICE_REQUIRED');

      const startAt = time || slots[0];
      if (!startAt) throw new Error('NO_SLOT');

      const { error } = await supabase.rpc('admin_create_booking', {
        p_name: name.trim(),
        p_phone: phone.trim(),
        p_service_id: serviceId,
        p_start_at: startAt,
        p_paid_cash: paidCash,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t('walkIn.create'));
      void queryClient.invalidateQueries({ queryKey: ['bookings'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      setName('');
      setPhone('');
      setServiceId('');
      setDate('');
      setTime('');
      setPaidCash(true);
      setSlots([]);
      onSuccess?.();
    },
    onError: (e) => toast.error(mapError(e, t)),
  });

  const locale = i18n.language?.startsWith('ar') ? 'ar' : 'en';

  return (
    <div className="space-y-3.5">
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
        <label className="text-sm font-medium text-ink-70">{t('walkIn.service')}</label>
        <select
          className="mt-1 min-h-11 w-full rounded-btn border border-bark/20 bg-white px-3 text-sm text-espresso"
          value={serviceId}
          onChange={(e) => {
            setServiceId(e.target.value);
            setSlots([]);
          }}
        >
          <option value="">— {t('common.select')} —</option>
          {services.map((s) => (
            <option key={s.id} value={s.id}>
              {locale === 'ar' ? s.name_ar : s.name_en} ({s.price_egp} EGP)
            </option>
          ))}
        </select>
      </div>

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
                  const localIso = `${date}T${h}:${m}:00`;
                  setTime(fromCairoLocal(new Date(localIso)).toISOString());
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

      {/* Available Slots list if queried */}
      {slots.length > 0 ? (
        <div>
          <p className="mb-1.5 text-xs font-medium text-ink-70">{t('today.emptySlot')}:</p>
          <div className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto rounded-btn border border-bark/10 bg-sand/30 p-2">
            {slots.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setTime(s)}
                className={`rounded-btn px-2.5 py-1 font-latin text-xs border transition-colors ${
                  time === s ? 'border-gold bg-gold/20 text-espresso font-semibold' : 'border-bark/20 bg-white hover:bg-sand'
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

      <div className="flex gap-2 pt-2">
        {onCancel ? (
          <Button variant="ghost" className="w-full" onClick={onCancel}>
            {t('common.cancel')}
          </Button>
        ) : null}
        <Button
          variant="primary"
          className="w-full"
          loading={createMutation.isPending}
          disabled={!name || !phone || !serviceId || (!time && slots.length === 0)}
          onClick={() => void createMutation.mutate()}
        >
          {t('walkIn.create')}
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-espresso/60 p-4 backdrop-blur-xs">
      <div className="w-full max-w-md rounded-card border border-bark/15 bg-white p-5 shadow-warm-xl animate-fade">
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
    </div>
  );
}
