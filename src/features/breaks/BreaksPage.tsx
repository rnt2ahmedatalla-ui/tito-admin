import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardBody } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { mapError } from '@/lib/errors';
import { useStaff } from '@/features/staff/StaffPage';

type RecurringBreak = {
  id: string;
  reason: string;
  start_time: string;
  end_time: string;
  days_of_week: number[];
  is_active: boolean;
  staff_id?: string | null;
};

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

export function BreaksPage() {
  const { t, i18n } = useTranslation();
  const isAr = !!i18n.language?.startsWith('ar');
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState({
    reason: '',
    start_time: '14:30',
    end_time: '15:30',
    days_of_week: ALL_DAYS as number[],
    staff_id: '',
  });
  const staffList = (useStaff().data ?? []).filter((m) => m.is_active);
  const ownerId = staffList.find((m) => m.is_owner)?.id ?? '';
  const staffName = (id?: string | null) => staffList.find((m) => m.id === id)?.name ?? null;

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
      const payload = {
        reason: form.reason || t('breaks.defaultReason'),
        start_time: form.start_time.length === 5 ? `${form.start_time}:00` : form.start_time,
        end_time: form.end_time.length === 5 ? `${form.end_time}:00` : form.end_time,
        days_of_week: form.days_of_week,
        staff_id: form.staff_id || null,
      };
      if (form.start_time >= form.end_time) throw new Error('INVALID_RANGE');
      const { error } = editingId
        ? await supabase.from('recurring_breaks').update(payload).eq('id', editingId)
        : await supabase.from('recurring_breaks').insert({ ...payload, is_active: true });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['recurring-breaks'] });
      setShowForm(false);
      setEditingId(null);
      toast.success(t('app.save'));
    },
    onError: (e) => {
      if (e instanceof Error && e.message === 'INVALID_RANGE') {
        toast.error(isAr ? 'وقت النهاية لازم يبقى بعد البداية' : 'End time must be after start time');
        return;
      }
      toast.error(mapError(e, t));
    },
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.from('recurring_breaks').update({ is_active: active }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['recurring-breaks'] }),
    onError: (e) => toast.error(mapError(e, t)),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('recurring_breaks').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['recurring-breaks'] });
      setDeleteId(null);
    },
    onError: (e) => toast.error(mapError(e, t)),
  });

  const startEdit = (b: RecurringBreak) => {
    setEditingId(b.id);
    setForm({
      reason: b.reason ?? '',
      start_time: String(b.start_time).slice(0, 5),
      end_time: String(b.end_time).slice(0, 5),
      days_of_week: b.days_of_week,
      staff_id: b.staff_id ?? '',
    });
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const startAdd = () => {
    setEditingId(null);
    setForm({ reason: '', start_time: '14:30', end_time: '15:30', days_of_week: ALL_DAYS, staff_id: ownerId });
    setShowForm(true);
  };

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
        <Button variant="primary" size="sm" onClick={startAdd}>
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
            {staffList.length > 0 ? (
              <div>
                <label htmlFor="break-staff" className="text-sm font-medium text-ink-70">{isAr ? 'الاستراحة دي لمين؟' : 'Who is this break for?'}</label>
                <select
                  id="break-staff"
                  value={form.staff_id}
                  onChange={(e) => setForm({ ...form, staff_id: e.target.value })}
                  className="mt-1 min-h-11 w-full rounded-btn border border-default bg-white px-3 text-sm"
                >
                  <option value="">{isAr ? 'المحل كله (استثنائي، بيقفل على كل الحلاقين)' : 'Whole shop (exceptional, blocks all barbers)'}</option>
                  {staffList.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </div>
            ) : null}
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
              <Button variant="ghost" onClick={() => { setShowForm(false); setEditingId(null); }}>{t('app.cancel')}</Button>
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
              <CardBody className={`flex items-center gap-2 p-3 ${b.is_active ? '' : 'opacity-60'}`}>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {b.reason || t('breaks.defaultReason')}
                    {b.staff_id ? (
                      <span className="ms-2 rounded-full bg-gold/20 px-2 py-0.5 text-xs font-medium text-espresso">{staffName(b.staff_id) ?? (isAr ? 'حلاق' : 'Barber')}</span>
                    ) : null}
                  </p>
                  <p className="font-latin text-sm text-ink-70">
                    {String(b.start_time).slice(0, 5)} – {String(b.end_time).slice(0, 5)}
                    {' · '}
                    {b.days_of_week.length >= 7
                      ? t('breaks.everyDay')
                      : b.days_of_week.map(dowLabel).join(i18n.language === 'ar' ? '، ' : ', ')}
                  </p>
                </div>
                <label className="flex shrink-0 items-center gap-1.5 text-xs text-ink-70">
                  <input
                    type="checkbox"
                    className="size-4 accent-gold"
                    checked={b.is_active}
                    onChange={(e) => toggleActive.mutate({ id: b.id, active: e.target.checked })}
                  />
                  {isAr ? 'شغّال' : 'On'}
                </label>
                <Button variant="ghost" size="sm" onClick={() => startEdit(b)} aria-label={isAr ? 'تعديل' : 'Edit'}>
                  <Pencil className="size-4" />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setDeleteId(b.id)} aria-label={isAr ? 'مسح' : 'Delete'}>
                  <Trash2 className="size-4 text-danger" />
                </Button>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!deleteId}
        title={isAr ? 'تمسح الاستراحة دي؟' : 'Delete this break?'}
        message={isAr ? 'المواعيد دي هترجع متاحة للحجز.' : 'These times will become available for booking again.'}
        variant="danger"
        loading={deleteMutation.isPending}
        onConfirm={() => deleteId && deleteMutation.mutate(deleteId)}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
}
