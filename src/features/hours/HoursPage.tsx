import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import type { WorkingHours, Settings } from '@/types/database';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardBody } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { minutesToTime, timeToMinutes } from '@/lib/time';
import { mapError } from '@/lib/errors';

function countSlots(open: string, close: string, lastSlot: string, stepMin: number): number {
  const openM = timeToMinutes(open);
  const closeM = timeToMinutes(close);
  const lastM = timeToMinutes(lastSlot);
  if (openM >= closeM || lastM > closeM) return 0;
  let count = 0;
  for (let m = openM; m <= lastM; m += stepMin) count++;
  return count;
}

// آخر معاد حجز تلقائي: آخر خانة بتخلّص مع الإغلاق بالظبط، بنفس الفترة اللي في الإعدادات بين المواعيد
function autoLast(open: string, close: string, stepMin: number): string {
  const o = timeToMinutes(open);
  const c = timeToMinutes(close);
  const limit = c - stepMin;
  if (stepMin <= 0 || limit < o) return open.slice(0, 5);
  return minutesToTime(o + Math.floor((limit - o) / stepMin) * stepMin);
}

export function HoursPage() {
  const { t, i18n } = useTranslation();
  const isAr = !!i18n.language?.startsWith('ar');
  const L = (ar: string, en: string) => (isAr ? ar : en);
  const queryClient = useQueryClient();
  const [rows, setRows] = useState<WorkingHours[]>([]);
  // الأيام اللي آخر معاد الحجز فيها اتحدد يدوي (الباقي بيتحسب لوحده)
  const [manualLast, setManualLast] = useState<Set<string>>(new Set());
  const initialised = useRef(false);

  const settingsQuery = useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const { data, error } = await supabase.from('settings').select('*').single();
      if (error) throw error;
      return data as Settings;
    },
    staleTime: 60_000,
  });

  const hoursQuery = useQuery({
    queryKey: ['working-hours'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('working_hours')
        .select('*')
        .order('day_of_week', { ascending: true });
      if (error) throw error;
      return data as WorkingHours[];
    },
    staleTime: 60_000,
  });

  useEffect(() => {
    if (hoursQuery.data) setRows(hoursQuery.data);
  }, [hoursQuery.data]);

  // أول تحميل: اليوم اللي آخر معاده مختلف عن الحساب التلقائي يتعامل كيدوي، عشان منغيّرش حاجة إنت ظابطها
  useEffect(() => {
    if (initialised.current || !hoursQuery.data || !settingsQuery.data) return;
    const step = settingsQuery.data.slot_step_min ?? 30;
    initialised.current = true;
    setManualLast(
      new Set(
        hoursQuery.data
          .filter((r) => !r.is_closed && r.last_slot_start.slice(0, 5) !== autoLast(r.open_time, r.close_time, step))
          .map((r) => r.id),
      ),
    );
  }, [hoursQuery.data, settingsQuery.data]);

  const saveMutation = useMutation({
    mutationFn: async (hours: WorkingHours[]) => {
      for (const h of hours) {
        const openM = timeToMinutes(h.open_time);
        const closeM = timeToMinutes(h.close_time);
        const lastM = timeToMinutes(h.last_slot_start);
        if (!h.is_closed && (openM >= closeM || lastM > closeM)) {
          throw new Error('INVALID_HOURS');
        }
        const { error } = await supabase
          .from('working_hours')
          .update({
            is_closed: h.is_closed,
            open_time: h.open_time.length === 5 ? `${h.open_time}:00` : h.open_time,
            close_time: h.close_time.length === 5 ? `${h.close_time}:00` : h.close_time,
            last_slot_start:
              h.last_slot_start.length === 5 ? `${h.last_slot_start}:00` : h.last_slot_start,
          })
          .eq('id', h.id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['working-hours'] });
      toast.success(t('app.save'));
    },
    onError: (e) => toast.error(mapError(e, t)),
  });

  const days = t('hours.days', { returnObjects: true }) as string[];
  const stepMin = settingsQuery.data?.slot_step_min ?? 30;

  const updateRow = (index: number, patch: Partial<WorkingHours>) => {
    setRows((prev) =>
      prev.map((r, i) => {
        if (i !== index) return r;
        const next = { ...r, ...patch };
        // لو غيّرت الفتح أو الإغلاق واليوم تلقائي، آخر معاد الحجز يتحدث لوحده
        if (('open_time' in patch || 'close_time' in patch) && !manualLast.has(r.id)) {
          next.last_slot_start = autoLast(next.open_time, next.close_time, stepMin);
        }
        return next;
      }),
    );
  };

  const setAuto = (index: number, id: string, auto: boolean) => {
    setManualLast((prev) => {
      const next = new Set(prev);
      if (auto) next.delete(id);
      else next.add(id);
      return next;
    });
    if (auto) {
      setRows((prev) =>
        prev.map((r, i) => (i === index ? { ...r, last_slot_start: autoLast(r.open_time, r.close_time, stepMin) } : r)),
      );
    }
  };

  // نسخ مواعيد أول يوم لكل الأيام المفتوحة (الأيام المقفولة بتفضل مقفولة)
  const applyToAll = () => {
    const f = rows[0];
    if (!f || f.is_closed) return;
    const firstManual = manualLast.has(f.id);
    setRows((prev) =>
      prev.map((r, i) =>
        i === 0 || r.is_closed
          ? r
          : { ...r, open_time: f.open_time, close_time: f.close_time, last_slot_start: f.last_slot_start },
      ),
    );
    setManualLast((prev) => {
      const next = new Set(prev);
      rows.forEach((r, i) => {
        if (i === 0 || r.is_closed) return;
        if (firstManual) next.add(r.id);
        else next.delete(r.id);
      });
      return next;
    });
    toast.success(L('اتطبقت على كل الأيام المفتوحة، دوس حفظ', 'Applied to all open days, press Save'));
  };

  if (hoursQuery.isLoading) return <Skeleton className="h-96" />;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{t('hours.title')}</h1>

      <div className="space-y-3">
        {rows.map((row, i) => {
          const slotCount = row.is_closed
            ? 0
            : countSlots(row.open_time, row.close_time, row.last_slot_start, stepMin);
          return (
            <Card key={row.id}>
              <CardBody className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{days[row.day_of_week] ?? row.day_of_week}</span>
                  {i === 0 && !row.is_closed ? (
                    <Button variant="secondary" size="sm" onClick={applyToAll}>
                      {L('طبّق على كل الأيام', 'Apply to all days')}
                    </Button>
                  ) : null}
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={row.is_closed}
                      onChange={(e) => updateRow(i, { is_closed: e.target.checked })}
                    />
                    {t('hours.closed')}
                  </label>
                </div>
                {!row.is_closed ? (
                  <>
                    <div className="grid grid-cols-3 gap-2">
                      <Input
                        label={t('hours.open')}
                        type="time"
                        value={row.open_time.slice(0, 5)}
                        onChange={(e) => updateRow(i, { open_time: e.target.value })}
                      />
                      <Input
                        label={t('hours.close')}
                        type="time"
                        value={row.close_time.slice(0, 5)}
                        onChange={(e) => updateRow(i, { close_time: e.target.value })}
                      />
                      <Input
                        label={t('hours.lastSlot')}
                        type="time"
                        value={row.last_slot_start.slice(0, 5)}
                        disabled={!manualLast.has(row.id)}
                        onChange={(e) => updateRow(i, { last_slot_start: e.target.value })}
                      />
                    </div>
                    <label className="flex items-center gap-2 text-xs text-ink-70">
                      <input
                        type="checkbox"
                        className="size-4 accent-gold"
                        checked={!manualLast.has(row.id)}
                        onChange={(e) => setAuto(i, row.id, e.target.checked)}
                      />
                      {L(
                        `آخر معاد حجز تلقائي (إغلاق − ${stepMin} دقيقة)`,
                        `Auto last booking time (closing − ${stepMin} min)`,
                      )}
                    </label>
                    <p className="text-sm text-ink-70">
                      {t('hours.preview', { count: slotCount })}
                    </p>
                  </>
                ) : null}
              </CardBody>
            </Card>
          );
        })}
      </div>

      <Button variant="primary" loading={saveMutation.isPending} onClick={() => void saveMutation.mutate(rows)}>
        {t('app.save')}
      </Button>
    </div>
  );
}
