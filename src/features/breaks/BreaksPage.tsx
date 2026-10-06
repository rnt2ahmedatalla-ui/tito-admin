import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardBody } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { mapError } from '@/lib/errors';

type RecurringBreak = {
  id: string;
  reason: string;
  start_time: string;
  end_time: string;
  days_of_week: number[];
  is_active: boolean;
};

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

export function BreaksPage() {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    reason: '',
    start_time: '14:30',
    end_time: '15:30',
    days_of_week: ALL_DAYS as number[],
  });

  const { data: breaks = [], isLoading } = useQuery({
    queryKey: ['recurring-breaks'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('recurring_breaks')
        .select('*')
        .order('start_time', { ascending: true });
      if (error) throw error;
      return (data ?? []) as RecurringBreak[];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('recurring_breaks').insert({
        reason: form.reason || t('breaks.defaultReason'),
        start_time: form.start_time.length === 5 ? `${form.start_time}:00` : form.start_time,
        end_time: form.end_time.length === 5 ? `${form.end_time}:00` : form.end_time,
        days_of_week: form.days_of_week,
        is_active: true,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['recurring-breaks'] });
      setShowForm(false);
      toast.success(t('app.save'));
    },
    onError: (e) => toast.error(mapError(e, t)),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('recurring_breaks').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['recurring-breaks'] }),
    onError: (e) => toast.error(mapError(e, t)),
  });

  const toggleDay = (d: number) => {
    setForm((prev) => {
      const has = prev.days_of_week.includes(d);
      const next = has ? prev.days_of_week.filter((x) => x !== d) : [...prev.days_of_week, d].sort();
      return { ...prev, days_of_week: next.length ? next : [d] };
    });
  };

  // hours.days is Sun-first — index matches DB day_of_week (0=Sun … 6=Sat)
  const dayLabels = t('hours.days', { returnObjects: true }) as string[];
  const dowLabel = (dow: number) => dayLabels[dow] ?? String(dow);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{t('breaks.title')}</h1>
          <p className="text-sm text-ink-70">{t('breaks.hint')}</p>
        </div>
        <Button variant="primary" size="sm" onClick={() => setShowForm(true)}>
          <Plus className="size-4" />
          {t('breaks.add')}
        </Button>
      </div>

      {showForm ? (
        <Card>
          <CardBody className="space-y-3">
            <Input
              label={t('breaks.reason')}
              value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
              placeholder={t('breaks.defaultReason')}
            />
            <div className="grid grid-cols-2 gap-3">
              <Input
                label={t('breaks.start')}
                type="time"
                value={form.start_time}
                onChange={(e) => setForm({ ...form, start_time: e.target.value })}
              />
              <Input
                label={t('breaks.end')}
                type="time"
                value={form.end_time}
                onChange={(e) => setForm({ ...form, end_time: e.target.value })}
              />
            </div>
            <div>
              <p className="mb-2 text-sm font-medium text-ink-70">{t('breaks.days')}</p>
              <div className="flex flex-wrap gap-2">
                {ALL_DAYS.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => toggleDay(d)}
                    className={`rounded-btn border px-2 py-1 text-sm ${
                      form.days_of_week.includes(d) ? 'border-gold bg-gold/15' : 'border-bark/20'
                    }`}
                  >
                    {dowLabel(d)}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="primary" loading={saveMutation.isPending} onClick={() => void saveMutation.mutate()}>
                {t('app.save')}
              </Button>
              <Button variant="ghost" onClick={() => setShowForm(false)}>{t('app.cancel')}</Button>
            </div>
          </CardBody>
        </Card>
      ) : null}

      {isLoading ? (
        <Skeleton className="h-40" />
      ) : breaks.length === 0 ? (
        <p className="text-sm text-ink-70">{t('breaks.empty')}</p>
      ) : (
        <div className="space-y-2">
          {breaks.map((b) => (
            <Card key={b.id}>
              <CardBody className="flex items-center gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{b.reason || t('breaks.defaultReason')}</p>
                  <p className="font-latin text-sm text-ink-70">
                    {String(b.start_time).slice(0, 5)} – {String(b.end_time).slice(0, 5)}
                    {' · '}
                    {b.days_of_week.length >= 7
                      ? t('breaks.everyDay')
                      : b.days_of_week.map(dowLabel).join(i18n.language === 'ar' ? '، ' : ', ')}
                  </p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => void deleteMutation.mutate(b.id)}>
                  <Trash2 className="size-4" />
                </Button>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
