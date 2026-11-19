import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import type { TimeOff, BookingWithRelations } from '@/types/database';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardBody } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { formatCairoDateShort, formatCairoTime, fromCairoLocal, toCairo } from '@/lib/time';
import { buildWhatsAppUrl } from '@/lib/whatsapp';
import { mapError } from '@/lib/errors';
import { first } from '@/lib/booking';
import { useStaff } from '@/features/staff/StaffPage';

function cairoBoundsForYmd(ymd: string): { start: string; end: string } {
  const parts = ymd.split('-').map(Number);
  const y = parts[0] ?? 0;
  const m = parts[1] ?? 1;
  const d = parts[2] ?? 1;
  // Treat Y-M-D as Africa/Cairo wall date (not browser-local)
  const start = fromCairoLocal(new Date(y, m - 1, d, 0, 0, 0, 0)).toISOString();
  const end = fromCairoLocal(new Date(y, m - 1, d, 23, 59, 59, 999)).toISOString();
  return { start, end };
}

export function TimeOffPage() {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const isAr = !!i18n.language?.startsWith('ar');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState({
    all_day: false,
    start_date: '',
    end_date: '',
    start_at: '',
    end_at: '',
    reason: '',
    staff_id: '',
  });
  const staffList = (useStaff().data ?? []).filter((m) => m.is_active);
  const ownerId = staffList.find((m) => m.is_owner)?.id ?? '';
  const staffName = (id?: string | null) => staffList.find((m) => m.id === id)?.name ?? null;
  const [overlapBookings, setOverlapBookings] = useState<BookingWithRelations[]>([]);
  const [acknowledged, setAcknowledged] = useState(false);

  const { data: timeOffs = [], isLoading } = useQuery({
    queryKey: ['time-off'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('time_off')
        .select('*')
        .order('start_at', { ascending: false });
      if (error) throw error;
      return data as TimeOff[];
    },
    staleTime: 60_000,
  });

  const resolveRange = () => {
    if (form.all_day) {
      if (!form.start_date || !form.end_date) throw new Error('MISSING_RANGE');
      const start = cairoBoundsForYmd(form.start_date).start;
      const end = cairoBoundsForYmd(form.end_date).end;
      if (start > end) throw new Error('INVALID_RANGE');
      return { start_at: start, end_at: end, all_day: true };
    }
    if (!form.start_at || !form.end_at) throw new Error('MISSING_RANGE');
    // datetime-local has no TZ — interpret as Cairo wall time
    const startLocal = form.start_at.length === 16 ? `${form.start_at}:00` : form.start_at;
    const endLocal = form.end_at.length === 16 ? `${form.end_at}:00` : form.end_at;
    const sp = startLocal.split(/[-T:]/).map(Number);
    const ep = endLocal.split(/[-T:]/).map(Number);
    const sy = sp[0] ?? 0;
    const sm = sp[1] ?? 1;
    const sd = sp[2] ?? 1;
    const sh = sp[3] ?? 0;
    const smin = sp[4] ?? 0;
    const ey = ep[0] ?? 0;
    const em = ep[1] ?? 1;
    const ed = ep[2] ?? 1;
    const eh = ep[3] ?? 0;
    const emin = ep[4] ?? 0;
    return {
      start_at: fromCairoLocal(new Date(sy, sm - 1, sd, sh, smin, 0, 0)).toISOString(),
      end_at: fromCairoLocal(new Date(ey, em - 1, ed, eh, emin, 0, 0)).toISOString(),
      all_day: false,
    };
  };

  const checkOverlap = async () => {
    const range = resolveRange();
    let q = supabase
      .from('bookings')
      .select('*, profile:profiles!bookings_user_id_fkey(full_name, phone)')
      .in('status', ['confirmed', 'pending_payment'])
      .gte('start_at', range.start_at)
      .lte('start_at', range.end_at);
    // إجازة لحلاق معين تأثر بس على حجوزاته (والحجوزات اللي من غير حلاق)
    if (form.staff_id) q = q.or(`staff_id.eq.${form.staff_id},staff_id.is.null`);
    const { data, error } = await q;
    if (error) throw error;
    setOverlapBookings((data ?? []) as BookingWithRelations[]);
    return (data ?? []).length;
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const range = resolveRange();
      const count = await checkOverlap();
      if (count > 0 && !acknowledged) throw new Error('OVERLAP');
      const payload = {
        start_at: range.start_at,
        end_at: range.end_at,
        reason: form.reason,
        all_day: range.all_day,
        staff_id: form.staff_id || null,
      };
      const { error } = editingId
        ? await supabase.from('time_off').update(payload).eq('id', editingId)
        : await supabase.from('time_off').insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['time-off'] });
      void queryClient.invalidateQueries({ queryKey: ['bookings', 'today'] });
      setShowForm(false);
      setEditingId(null);
      setForm({ all_day: false, start_date: '', end_date: '', start_at: '', end_at: '', reason: '', staff_id: '' });
      setOverlapBookings([]);
      setAcknowledged(false);
      toast.success(t('app.save'));
    },
    onError: (e) => {
      if (e instanceof Error && e.message === 'OVERLAP') return;
      if (e instanceof Error && (e.message === 'MISSING_RANGE' || e.message === 'INVALID_RANGE')) {
        toast.error(t('timeOff.rangeRequired'));
        return;
      }
      toast.error(mapError(e, t));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('time_off').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['time-off'] });
      void queryClient.invalidateQueries({ queryKey: ['bookings', 'today'] });
      setDeleteId(null);
    },
    onError: (e) => toast.error(mapError(e, t)),
  });

  const emptyForm = { all_day: false, start_date: '', end_date: '', start_at: '', end_at: '', reason: '', staff_id: '' };

  const startAdd = () => {
    setEditingId(null);
    setForm({ ...emptyForm, staff_id: ownerId });
    setOverlapBookings([]);
    setAcknowledged(false);
    setShowForm(true);
  };

  const startEdit = (row: TimeOff) => {
    const s = toCairo(row.start_at);
    const e = toCairo(row.end_at);
    setEditingId(row.id);
    setForm({
      all_day: row.all_day,
      start_date: format(s, 'yyyy-MM-dd'),
      end_date: format(e, 'yyyy-MM-dd'),
      start_at: format(s, "yyyy-MM-dd'T'HH:mm"),
      end_at: format(e, "yyyy-MM-dd'T'HH:mm"),
      reason: row.reason ?? '',
      staff_id: (row as unknown as { staff_id?: string | null }).staff_id ?? '',
    });
    setOverlapBookings([]);
    setAcknowledged(false);
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const cancelAffected = async () => {
    for (const b of overlapBookings) {
      await supabase.rpc('admin_cancel_booking', {
        p_booking_id: b.id,
        p_reason: form.reason,
      });
      const phone = first(b.profile)?.phone ?? '';
      const url = buildWhatsAppUrl(phone, `تم إلغاء حجزك بسبب: ${form.reason}`);
      if (url) window.open(url, '_blank', 'noopener,noreferrer');
    }
    void saveMutation.mutate();
  };

  const locale = i18n.language;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{t('timeOff.title')}</h1>
        <Button variant="primary" size="sm" onClick={startAdd}>
          <Plus className="size-4" />
          {t('timeOff.add')}
        </Button>
      </div>

      {showForm ? (
        <Card>
          <CardBody className="space-y-3">
            {staffList.length > 0 ? (
              <div>
                <label htmlFor="off-staff" className="text-sm font-medium text-ink-70">{isAr ? 'الإجازة دي لمين؟' : 'Who is this time off for?'}</label>
                <select
                  id="off-staff"
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
            <label className="flex items-center gap-2 text-sm font-medium text-espresso">
              <input
                type="checkbox"
                checked={form.all_day}
                onChange={(e) => setForm({ ...form, all_day: e.target.checked })}
                className="size-4 accent-gold"
              />
              {t('timeOff.allDay')}
            </label>
            {form.all_day ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Input
                  label={t('timeOff.startDate')}
                  type="date"
                  value={form.start_date}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      start_date: e.target.value,
                      end_date: form.end_date || e.target.value,
                    })
                  }
                />
                <Input
                  label={t('timeOff.endDate')}
                  type="date"
                  value={form.end_date}
                  onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                />
              </div>
            ) : (
              <>
                <Input
                  label={t('timeOff.start')}
                  type="datetime-local"
                  value={form.start_at}
                  onChange={(e) => setForm({ ...form, start_at: e.target.value })}
                />
                <Input
                  label={t('timeOff.end')}
                  type="datetime-local"
                  value={form.end_at}
                  onChange={(e) => setForm({ ...form, end_at: e.target.value })}
                />
              </>
            )}
            <Input label={t('timeOff.reason')} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
            {overlapBookings.length > 0 ? (
              <div className="space-y-2 rounded-btn bg-warning/10 p-3">
                <p className="font-medium text-warning">{t('timeOff.overlapWarning')}</p>
                {overlapBookings.map((b) => (
                  <p key={b.id} className="text-sm">
                    {first(b.profile)?.full_name} — {formatCairoDateShort(b.start_at)}{' '}
                    {formatCairoTime(b.start_at, locale)}
                  </p>
                ))}
                <Button variant="danger" size="sm" onClick={() => void cancelAffected()}>
                  {t('timeOff.cancelAffected')}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setAcknowledged(true)}>
                  {t('timeOff.acknowledge')}
                </Button>
              </div>
            ) : null}
            <div className="flex gap-2">
              <Button
                variant="primary"
                loading={saveMutation.isPending}
                onClick={async () => {
                  try {
                    await checkOverlap();
                    void saveMutation.mutate();
                  } catch (e) {
                    if (e instanceof Error && (e.message === 'MISSING_RANGE' || e.message === 'INVALID_RANGE')) {
                      toast.error(t('timeOff.rangeRequired'));
                      return;
                    }
                    toast.error(mapError(e, t));
                  }
                }}
              >
                {t('app.save')}
              </Button>
              <Button variant="ghost" onClick={() => { setShowForm(false); setEditingId(null); }}>
                {t('app.cancel')}
              </Button>
            </div>
          </CardBody>
        </Card>
      ) : null}

      {isLoading ? (
        <Skeleton className="h-48" />
      ) : (
        <div className="space-y-2">
          {timeOffs.map((to) => (
            <Card key={to.id}>
              <CardBody className="flex items-center justify-between p-3">
                <div>
                  <p className="font-medium">
                    {to.reason}
                    {(to as unknown as { staff_id?: string | null }).staff_id ? (
                      <span className="ms-2 rounded-full bg-gold/20 px-2 py-0.5 text-xs font-medium text-espresso">
                        {staffName((to as unknown as { staff_id?: string | null }).staff_id) ?? (isAr ? 'حلاق' : 'Barber')}
                      </span>
                    ) : null}
                    {to.all_day ? (
                      <span className="ms-2 text-xs font-normal text-gold">{t('timeOff.allDay')}</span>
                    ) : null}
                  </p>
                  <p className="font-latin text-sm text-ink-70">
                    {formatCairoDateShort(to.start_at)} → {formatCairoDateShort(to.end_at)}
                    {!to.all_day ? (
                      <>
                        {' '}
                        · {formatCairoTime(to.start_at, locale)}–{formatCairoTime(to.end_at, locale)}
                      </>
                    ) : null}
                  </p>
                </div>
                <div className="flex shrink-0 items-center">
                  <Button variant="ghost" size="sm" onClick={() => startEdit(to)} aria-label={isAr ? 'تعديل' : 'Edit'}>
                    <Pencil className="size-4" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setDeleteId(to.id)} aria-label={isAr ? 'مسح' : 'Delete'}>
                    <Trash2 className="size-4 text-danger" />
                  </Button>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!deleteId}
        title={isAr ? 'تمسح الإجازة دي؟' : 'Delete this time off?'}
        message={isAr ? 'المواعيد دي هترجع متاحة للحجز.' : 'These times will become available for booking again.'}
        variant="danger"
        loading={deleteMutation.isPending}
        onConfirm={() => deleteId && deleteMutation.mutate(deleteId)}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
}
