import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ImagePlus, Pencil, Plus, Trash2, UserRound } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Skeleton } from '@/components/ui/Skeleton';
import { untypedDb } from '@/features/payments/useFinanceBoxes';
import { cn } from '@/lib/cn';

export interface StaffMember {
  id: string;
  name: string;
  bio: string | null;
  experience_years: number | null;
  photo: string | null;
  is_active: boolean;
  is_owner: boolean;
  sort: number;
}

export function useStaff() {
  return useQuery({
    queryKey: ['staff'],
    queryFn: async (): Promise<StaffMember[]> => {
      const { data, error } = await untypedDb
        .from('staff')
        .select('id, name, bio, experience_years, photo, is_active, is_owner, sort')
        .order('sort', { ascending: true })
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as StaffMember[];
    },
    retry: false,
    staleTime: 30_000,
  });
}

/** صورة صغيرة (حوالي 20-40 كيلو): بتتصغّر وتتضغط في المتصفح قبل الحفظ، فمفيش تخزين مدفوع */
async function compressImage(file: File, size = 256): Promise<string> {
  const bmp = await createImageBitmap(file);
  const side = Math.min(bmp.width, bmp.height);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('NO_CANVAS');
  ctx.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, size, size);
  return canvas.toDataURL('image/jpeg', 0.72);
}

export function Avatar({ name, photo, className }: { name: string; photo?: string | null; className?: string }) {
  if (photo) {
    return <img src={photo} alt={name} className={cn('rounded-full object-cover', className)} />;
  }
  return (
    <span className={cn('flex items-center justify-center rounded-full bg-gold/25 font-bold text-espresso', className)} aria-hidden>
      {name.trim().charAt(0).toUpperCase() || <UserRound className="size-1/2" />}
    </span>
  );
}

interface FormState {
  id: string | null;
  name: string;
  bio: string;
  years: string;
  photo: string;
}
type WH = { day_of_week: number; is_closed: boolean; open_time: string; close_time: string };
type SH = { day_of_week: number; is_off: boolean; start_time: string | null; end_time: string | null };
const hhmm = (t: string | null | undefined) => String(t ?? '').slice(0, 5);

/** جدول شغل حلاق: الأيام والساعات. اللي مش متغيّر عن المحل مش بيتخزن (يفضل "زي المحل") */
function ScheduleModal({ member, onClose }: { member: StaffMember; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const isAr = !!i18n.language?.startsWith('ar');
  const L = (ar: string, en: string) => (isAr ? ar : en);
  const queryClient = useQueryClient();
  const days = (t('hours.days', { returnObjects: true }) as string[]) || [];
  const order = [6, 0, 1, 2, 3, 4, 5];
  const [rows, setRows] = useState<Record<number, { off: boolean; start: string; end: string }> | null>(null);
  const [shop, setShop] = useState<WH[]>([]);

  useQuery({
    queryKey: ['staff-schedule', member.id],
    gcTime: 0,
    queryFn: async () => {
      const [wh, sh] = await Promise.all([
        supabase.from('working_hours').select('day_of_week, is_closed, open_time, close_time'),
        untypedDb.from('staff_hours').select('day_of_week, is_off, start_time, end_time').eq('staff_id', member.id),
      ]);
      if (wh.error) throw wh.error;
      if (sh.error) throw sh.error;
      const shopRows = (wh.data ?? []) as unknown as WH[];
      const over = new Map(((sh.data ?? []) as SH[]).map((r) => [r.day_of_week, r]));
      const next: Record<number, { off: boolean; start: string; end: string }> = {};
      for (let d = 0; d < 7; d++) {
        const base = shopRows.find((r) => r.day_of_week === d);
        const o = over.get(d);
        next[d] = {
          off: o ? o.is_off : false,
          start: hhmm(o?.start_time) || hhmm(base?.open_time) || '10:00',
          end: hhmm(o?.end_time) || hhmm(base?.close_time) || '22:00',
        };
      }
      setShop(shopRows);
      setRows(next);
      return true;
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!rows) return;
      for (let d = 0; d < 7; d++) {
        const r = rows[d];
        const base = shop.find((x) => x.day_of_week === d);
        if (!r) continue;
        if (r.start >= r.end && !r.off) throw new Error('RANGE');
        const same = !r.off && !!base && r.start === hhmm(base.open_time) && r.end === hhmm(base.close_time);
        if (same) {
          const { error } = await untypedDb.from('staff_hours').delete().eq('staff_id', member.id).eq('day_of_week', d);
          if (error) throw error;
        } else {
          const { error } = await untypedDb.from('staff_hours').upsert(
            { staff_id: member.id, day_of_week: d, is_off: r.off, start_time: `${r.start}:00`, end_time: `${r.end}:00` },
            { onConflict: 'staff_id,day_of_week' },
          );
          if (error) throw error;
        }
      }
    },
    onSuccess: () => {
      toast.success(L('اتحفظ جدول الشغل', 'Schedule saved'));
      void queryClient.invalidateQueries({ queryKey: ['staff-hours'] });
      onClose();
    },
    onError: (e) =>
      toast.error((e as Error).message === 'RANGE' ? L('وقت النهاية لازم يبقى بعد البداية', 'End must be after start') : L('معرفتش أحفظ، جرّب تاني', 'Could not save, try again')),
  });

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center p-4 lg:items-center">
      <div className="absolute inset-0 bg-espresso/50" onClick={onClose} />
      <div className="relative max-h-[90dvh] w-full max-w-md space-y-3 overflow-y-auto rounded-card bg-white p-4">
        <h2 className="text-lg font-semibold">{L(`جدول شغل ${member.name}`, `${member.name}'s schedule`)}</h2>
        <p className="text-xs text-ink-70">
          {L('بيبدأ زي مواعيد المحل. غيّر اليوم اللي عايزه يختلف، ومش هيقدر يشتغل برا ساعات المحل.', 'Starts the same as the shop. Change only the days that differ; he cannot work outside shop hours.')}
        </p>
        {!rows ? (
          <Skeleton className="h-40" />
        ) : (
          <ul className="space-y-2">
            {order.map((d) => {
              const r = rows[d];
              const base = shop.find((x) => x.day_of_week === d);
              if (!r) return null;
              const closed = !!base?.is_closed;
              return (
                <li key={d} className={cn('rounded-btn border border-default p-2.5', closed && 'opacity-50')}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-espresso">{days[d] ?? d}</span>
                    {closed ? (
                      <span className="text-xs text-ink-70">{L('المحل مقفول', 'Shop closed')}</span>
                    ) : (
                      <label className="flex items-center gap-1.5 text-sm">
                        <input
                          type="checkbox"
                          className="size-4 accent-gold"
                          checked={!r.off}
                          onChange={(e) => setRows({ ...rows, [d]: { ...r, off: !e.target.checked } })}
                        />
                        {L('شغال', 'Works')}
                      </label>
                    )}
                  </div>
                  {!closed && !r.off ? (
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <Input type="time" aria-label={L('من', 'From')} value={r.start} onChange={(e) => setRows({ ...rows, [d]: { ...r, start: e.target.value } })} />
                      <Input type="time" aria-label={L('إلى', 'To')} value={r.end} onChange={(e) => setRows({ ...rows, [d]: { ...r, end: e.target.value } })} />
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>{L('إلغاء', 'Cancel')}</Button>
          <Button loading={save.isPending} disabled={!rows} onClick={() => save.mutate()}>{L('حفظ', 'Save')}</Button>
        </div>
      </div>
    </div>
  );
}

const EMPTY: FormState = { id: null, name: '', bio: '', years: '', photo: '' };

export function StaffPage() {
  const { i18n } = useTranslation();
  const isAr = !!i18n.language?.startsWith('ar');
  const L = (ar: string, en: string) => (isAr ? ar : en);
  const queryClient = useQueryClient();
  const staffQuery = useStaff();
  const [form, setForm] = useState<FormState | null>(null);
  const [toDelete, setToDelete] = useState<StaffMember | null>(null);
  const [scheduleFor, setScheduleFor] = useState<StaffMember | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['staff'] });
  const sqlMissing = staffQuery.isError;

  const save = useMutation({
    mutationFn: async (f: FormState) => {
      if (!f.name.trim()) throw new Error('NAME_REQUIRED');
      const row = {
        name: f.name.trim(),
        bio: f.bio.trim() || null,
        experience_years: f.years.trim() ? Math.max(0, Math.round(Number(f.years))) : null,
        photo: f.photo.trim() || null,
      };
      const res = f.id
        ? await untypedDb.from('staff').update(row).eq('id', f.id)
        : await untypedDb.from('staff').insert({ ...row, sort: (staffQuery.data?.length ?? 0) + 1 });
      if (res.error) throw res.error;
    },
    onSuccess: () => {
      toast.success(L('اتحفظ', 'Saved'));
      setForm(null);
      refresh();
    },
    onError: (e) =>
      toast.error((e as Error).message === 'NAME_REQUIRED' ? L('اكتب اسم الحلاق', 'Enter the name') : L('معرفتش أحفظ، جرّب تاني', 'Could not save, try again')),
  });

  const makeOwner = useMutation({
    mutationFn: async (id: string) => {
      const rpcUntyped = supabase.rpc.bind(supabase) as unknown as (
        fn: string,
        args: Record<string, unknown>,
      ) => Promise<{ data: number | null; error: { message: string } | null }>;
      const { data, error } = await rpcUntyped('admin_set_owner_staff', { p_staff_id: id });
      if (error) throw error;
      return data ?? 0;
    },
    onSuccess: (n) => {
      toast.success(L(`اتعيّنت كصاحب المحل. ${n} حجز قديم اتسجل عليك.`, `Set as owner. ${n} old bookings assigned to you.`));
      refresh();
      void queryClient.invalidateQueries({ queryKey: ['bookings'] });
    },
    onError: () => toast.error(L('حصلت مشكلة، جرّب تاني', 'Something went wrong')),
  });

  const toggle = useMutation({
    mutationFn: async (m: StaffMember) => {
      const { error } = await untypedDb.from('staff').update({ is_active: !m.is_active }).eq('id', m.id);
      if (error) throw error;
    },
    onSuccess: refresh,
    onError: () => toast.error(L('حصلت مشكلة، جرّب تاني', 'Something went wrong')),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await untypedDb.from('staff').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      setToDelete(null);
      refresh();
    },
    onError: () => toast.error(L('حصلت مشكلة، جرّب تاني', 'Something went wrong')),
  });

  const pickFile = async (file: File | undefined) => {
    if (!file || !form) return;
    try {
      const data = await compressImage(file);
      setForm({ ...form, photo: data });
    } catch {
      toast.error(L('معرفتش أقرا الصورة', 'Could not read the image'));
    }
  };

  if (staffQuery.isLoading) return <Skeleton className="h-40" />;

  const list = staffQuery.data ?? [];
  const activeCount = list.filter((m) => m.is_active).length;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{L('الطاقم', 'Team')}</h1>
          <p className="mt-1 text-sm text-ink-70">
            {L(
              'ضيف الحلاقين هنا. العميل مش هيشوف اختيار حلاق غير لما يبقى عندك حلاقين شغالين اتنين أو أكتر.',
              'Add your barbers here. Customers only get a barber choice when two or more are active.',
            )}
          </p>
        </div>
        {!sqlMissing ? (
          <Button onClick={() => setForm({ ...EMPTY })}>
            <Plus className="size-4" aria-hidden />
            {L('إضافة', 'Add')}
          </Button>
        ) : null}
      </div>

      {sqlMissing ? (
        <p className="rounded-card border border-danger/40 bg-danger/5 p-4 text-sm text-danger">
          {L('لازم تشغّل ملف staff-system.sql في Supabase الأول.', 'Run staff-system.sql in Supabase first.')}
        </p>
      ) : list.length === 0 ? (
        <p className="rounded-card border border-default bg-white p-6 text-center text-sm text-ink-70">
          {L('لسه مفيش حلاقين مضافين. إنت شغال لوحدك والموقع بيشتغل عادي. لما تيجي تضيف حلاق ضيف نفسك الأول (دوس إضافة واكتب اسمك)، وبعدين دوس "ده أنا".', 'No barbers yet. You work solo and everything works as usual. When you add barbers, add yourself first, then tap "That is me".')}
        </p>
      ) : (
        <ul className="space-y-2">
          {list.map((m) => (
            <li key={m.id} className={cn('flex items-center gap-3 rounded-card border border-default bg-white p-3', !m.is_active && 'opacity-60')}>
              <Avatar name={m.name} photo={m.photo} className="size-14 shrink-0 text-xl" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-espresso">
                  {m.name}
                  {m.is_owner ? <span className="ms-2 rounded-full bg-espresso px-2 py-0.5 text-[10px] font-medium text-cream">{L('صاحب المحل', 'Owner')}</span> : null}
                </p>
                <p className="truncate text-xs text-ink-70">
                  {m.experience_years != null ? L(`${m.experience_years} سنة خبرة`, `${m.experience_years} yrs experience`) : null}
                  {m.experience_years != null && m.bio ? ' · ' : null}
                  {m.bio}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => toggle.mutate(m)}
                  className={cn('rounded-full px-2 py-0.5 text-xs font-medium', m.is_active ? 'bg-success/10 text-success' : 'bg-sand text-ink-70')}
                >
                  {m.is_active ? L('شغال', 'Active') : L('موقوف', 'Paused')}
                </button>
                <button type="button" onClick={() => setScheduleFor(m)} className="rounded-full bg-sand px-2 py-0.5 text-xs font-medium text-espresso">
                  {L('جدول الشغل', 'Schedule')}
                </button>
                {!m.is_owner && !list.some((x) => x.is_owner) ? (
                  <button type="button" onClick={() => makeOwner.mutate(m.id)} disabled={makeOwner.isPending} className="rounded-full bg-gold/25 px-2 py-0.5 text-xs font-medium text-espresso">
                    {L('ده أنا (صاحب المحل)', "That's me (owner)")}
                  </button>
                ) : null}
                </div>
              </div>
              <div className="flex shrink-0 flex-col gap-1">
                <button
                  type="button"
                  aria-label={L('تعديل', 'Edit')}
                  onClick={() => setForm({ id: m.id, name: m.name, bio: m.bio ?? '', years: m.experience_years?.toString() ?? '', photo: m.photo ?? '' })}
                  className="flex size-9 items-center justify-center rounded-btn hover:bg-sand"
                >
                  <Pencil className="size-4" aria-hidden />
                </button>
                <button
                  type="button"
                  aria-label={L('مسح', 'Delete')}
                  onClick={() => setToDelete(m)}
                  className="flex size-9 items-center justify-center rounded-btn text-danger hover:bg-danger/10"
                >
                  <Trash2 className="size-4" aria-hidden />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {list.length > 0 ? (
        <p className="text-xs text-ink-70">
          {activeCount >= 2
            ? L('العميل دلوقتي بيختار الحلاق وقت الحجز.', 'Customers now choose a barber when booking.')
            : L('محتاج حلاقين شغالين اتنين على الأقل عشان اختيار الحلاق يظهر للعميل.', 'You need at least two active barbers for the choice to appear.')}
        </p>
      ) : null}

      {form ? (
        <div className="fixed inset-0 z-[60] flex items-end justify-center p-4 lg:items-center">
          <div className="absolute inset-0 bg-espresso/50" onClick={() => setForm(null)} />
          <div className="relative max-h-[90dvh] w-full max-w-md space-y-3 overflow-y-auto rounded-card bg-white p-4">
            <h2 className="text-lg font-semibold">{form.id ? L('تعديل حلاق', 'Edit barber') : L('إضافة حلاق', 'Add barber')}</h2>
            <div className="flex items-center gap-3">
              <Avatar name={form.name || '?'} photo={form.photo} className="size-16 shrink-0 text-2xl" />
              <div className="flex flex-wrap gap-2">
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => void pickFile(e.target.files?.[0])} />
                <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()}>
                  <ImagePlus className="size-4" aria-hidden />
                  {L('صورة', 'Photo')}
                </Button>
                {form.photo ? (
                  <Button variant="ghost" size="sm" onClick={() => setForm({ ...form, photo: '' })}>
                    {L('شيل الصورة', 'Remove')}
                  </Button>
                ) : null}
              </div>
            </div>
            <p className="text-xs text-ink-70">
              {L('الصورة بتتصغّر لحجم خفيف جداً قبل الحفظ، فمفيش أي تكلفة تخزين. ولو مفيش صورة بيظهر أول حرف من الاسم.', 'The photo is shrunk to a tiny size before saving, so storage stays free. Without a photo, the first letter shows.')}
            </p>
            <Input label={L('الاسم', 'Name')} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <Input label={L('سنين الخبرة', 'Years of experience')} type="number" min={0} inputMode="numeric" value={form.years} onChange={(e) => setForm({ ...form, years: e.target.value })} />
            <Input label={L('نبذة قصيرة', 'Short bio')} value={form.bio} maxLength={120} onChange={(e) => setForm({ ...form, bio: e.target.value })} />
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" onClick={() => setForm(null)}>{L('إلغاء', 'Cancel')}</Button>
              <Button loading={save.isPending} onClick={() => save.mutate(form)}>{L('حفظ', 'Save')}</Button>
            </div>
          </div>
        </div>
      ) : null}

      {scheduleFor ? <ScheduleModal member={scheduleFor} onClose={() => setScheduleFor(null)} /> : null}

      <ConfirmDialog
        open={!!toDelete}
        title={L('تمسح الحلاق ده؟', 'Delete this barber?')}
        message={L('حجوزاته القديمة هتفضل زي ما هي، بس مش هيبقى مكتوب عليها اسمه. لو عايز توقفه مؤقتاً استخدم "موقوف".', 'Old bookings stay, but will no longer show his name. To pause him temporarily use "Paused".')}
        variant="danger"
        loading={remove.isPending}
        onConfirm={() => toDelete && remove.mutate(toDelete.id)}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
}
