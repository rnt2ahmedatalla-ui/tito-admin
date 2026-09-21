import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import type { Service } from '@/types/database';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardBody } from '@/components/ui/Card';
import { mapError } from '@/lib/errors';

const phoneSchema = z.string().regex(/^01[0125][0-9]{8}$/);

export function WalkInPage() {
  const { t, i18n } = useTranslation();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [serviceId, setServiceId] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [paidCash, setPaidCash] = useState(false);
  const [slots, setSlots] = useState<string[]>([]);

  const { data: services = [] } = useQuery({
    queryKey: ['services'],
    queryFn: async () => {
      const { data, error } = await supabase.from('services').select('*').eq('is_active', true);
      if (error) throw error;
      return data as Service[];
    },
    staleTime: 60_000,
  });

  const loadSlots = async () => {
    if (!date || !serviceId) return;
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
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!phoneSchema.safeParse(phone).success) throw new Error('INVALID_PHONE');
      const startAt = time || slots[0];
      if (!startAt) throw new Error('NO_SLOT');
      const { error } = await supabase.rpc('admin_create_booking', {
        p_name: name,
        p_phone: phone,
        p_service_id: serviceId,
        p_start_at: startAt,
        p_paid_cash: paidCash,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t('walkIn.create'));
      setName('');
      setPhone('');
      setServiceId('');
      setDate('');
      setTime('');
      setPaidCash(false);
      setSlots([]);
    },
    onError: (e) => toast.error(mapError(e, t)),
  });

  const locale = i18n.language;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{t('walkIn.title')}</h1>

      <Card>
        <CardBody className="space-y-3">
          <Input label={t('walkIn.name')} value={name} onChange={(e) => setName(e.target.value)} />
          <Input label={t('walkIn.phone')} value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" />
          <div>
            <label className="text-sm font-medium text-ink-70">{t('walkIn.service')}</label>
            <select
              className="mt-1 min-h-11 w-full rounded-btn border border-bark/20 bg-white px-3"
              value={serviceId}
              onChange={(e) => setServiceId(e.target.value)}
            >
              <option value="">—</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {locale === 'ar' ? s.name_ar : s.name_en}
                </option>
              ))}
            </select>
          </div>
          <Input label={t('walkIn.date')} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <Button variant="secondary" onClick={() => void loadSlots()} disabled={!date || !serviceId}>
            {t('walkIn.time')}
          </Button>
          {slots.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {slots.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setTime(s)}
                  className={`rounded-btn px-3 py-2 text-sm font-latin border ${
                    time === s ? 'border-gold bg-gold/10' : 'border-bark/20'
                  }`}
                >
                  {new Date(s).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                </button>
              ))}
            </div>
          ) : null}
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={paidCash} onChange={(e) => setPaidCash(e.target.checked)} />
            {t('walkIn.paidCash')}
          </label>
          <Button
            variant="primary"
            size="lg"
            loading={createMutation.isPending}
            disabled={!name || !phone || !serviceId || (!time && slots.length === 0)}
            onClick={() => void createMutation.mutate()}
          >
            {t('walkIn.create')}
          </Button>
        </CardBody>
      </Card>
    </div>
  );
}
