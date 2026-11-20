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
import { StaffAccessCard } from './StaffAccessCard';
import { StaffEarnings } from './StaffEarnings';
import { loginMessage, rpcUntyped as loginRpc, saveStaffPhone, useStaffPhones, waLink } from './staffLogin';

export interface StaffMember {
  id: string;
  name: string;
  bio: string | null;
  bio_en: string | null;
  socials: Record<string, string> | null;
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
        .select('id, name, bio, bio_en, socials, experience_years, photo, is_active, is_owner, sort')
        .order('sort', { ascending: true })
        .order('created_at', { ascending: true });
      if (error) throw error;
      const rows = (data ?? []) as StaffMember[];
      return [...rows].sort((a, b) => Number(b.is_owner) - Number(a.is_owner));
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

const BADGE_COLORS = [
  'bg-gold/30 text-espresso',
  'bg-sky-200 text-sky-900',
  'bg-emerald-200 text-emerald-900',
  'bg-rose-200 text-rose-900',
  'bg-violet-200 text-violet-900',
  'bg-amber-200 text-amber-900',
];

export interface StaffBadge {
  label: string;
  cls: string;
}

/** حرف/حروف مميزة ولون لكل حلاق. لو في اسمين بنفس الحرف الأول بنزوّد الحروف (احمد وامجد = اح / ام) واللون بيفرّق برضه */
export function staffBadges(list: StaffMember[]): Map<string, StaffBadge> {
  const clean = (n: string) => n.trim().replace(/\s+/g, ' ');
  const labelAt = (name: string, level: number) => {
    const words = clean(name).split(' ');
    const w0 = Array.from(words[0] ?? '');
    const w1 = Array.from(words[1] ?? '');
    if (level === 1) return (w0[0] ?? '?').toUpperCase();
    if (level === 2) return ((w0[0] ?? '') + (w1[0] ?? w0[1] ?? '')).toUpperCase();
    return w0.slice(0, 3).join('').toUpperCase();
  };
  let level = 3;
  for (const l of [1, 2, 3]) {
    const set = new Set(list.map((m) => labelAt(m.name, l)));
    if (set.size === list.length) {
      level = l;
      break;
    }
  }
  const map = new Map<string, StaffBadge>();
  list.forEach((m, i) => map.set(m.id, { label: labelAt(m.name, level), cls: BADGE_COLORS[i % BADGE_COLORS.length] ?? BADGE_COLORS[0]! }));
  return map;
}

export function Avatar({ name, photo, className, badge }: { name: string; photo?: string | null; className?: string; badge?: StaffBadge }) {
  if (photo) {
    return <img src={photo} alt={name} className={cn('rounded-full object-cover', className)} />;
  }
  return (
    <span className={cn('flex items-center justify-center rounded-full font-bold', badge?.cls ?? 'bg-gold/25 text-espresso', className)} aria-hidden>
      {badge?.label || name.trim().charAt(0).toUpperCase() || <UserRound className="size-1/2" />}
    </span>
  );
}

interface FormState {
  id: string | null;
  name: string;
  bio: string;
  bioEn: string;
  socials: Record<string, string>;
  years: string;
  photo: string;
  phone: string;
  username: string;
  password: string;
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

  const loadQ = useQuery({
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
      toast.error((e as Error).message === 'RANGE' ? L('وقت النهاية لازم يبقى بعد البداية', 'End must be after start') : L('معرفتش أحفظ، جرّب تاني', 'Could not save, try again'), {
        description: (e as Error).message === 'RANGE' ? undefined : errMsg(e),
      }),
  });

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center p-4 lg:items-center">
      <div className="absolute inset-0 bg-espresso/50" onClick={onClose} />
      <div className="relative max-h-[90dvh] w-full max-w-md space-y-3 overflow-y-auto rounded-card bg-white p-4">
        <h2 className="text-lg font-semibold">{L(`جدول شغل ${member.name}`, `${member.name}'s schedule`)}</h2>
        <p className="text-xs text-ink-70">
          {L('بيبدأ زي مواعيد المحل. غيّر اليوم اللي عايزه يختلف، ومش هيقدر يشتغل برا ساعات المحل.', 'Starts the same as the shop. Change only the days that differ; he cannot work outside shop hours.')}
        </p>
        {loadQ.isError ? (
          <p className="rounded-btn bg-danger/10 p-3 text-sm text-danger">{L('معرفتش أحمّل الجدول: ', 'Could not load: ')}{errMsg(loadQ.error)}</p>
        ) : !rows ? (
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

type SvcRow = { id: string; name_ar: string; name_en: string; price_egp: number | string; is_extra: boolean };

/** خدمات وأسعار حلاق: بيقدّم الخدمة ولا لأ، وسعر مختلف (فاضي = نفس سعر الصالون) */
function ServicesModal({ member, onClose }: { member: StaffMember; onClose: () => void }) {
  const { i18n } = useTranslation();
  const isAr = !!i18n.language?.startsWith('ar');
  const L = (ar: string, en: string) => (isAr ? ar : en);
  const queryClient = useQueryClient();
  const [rows, setRows] = useState<Record<string, { offered: boolean; price: string }> | null>(null);
  const [svcs, setSvcs] = useState<SvcRow[]>([]);

  const loadQ = useQuery({
    queryKey: ['staff-services-edit', member.id],
    gcTime: 0,
    queryFn: async () => {
      const [sv, ss] = await Promise.all([
        untypedDb.from('services').select('id, name_ar, name_en, price_egp, is_extra, is_active').eq('is_active', true).order('is_extra').order('sort_order'),
        untypedDb.from('staff_services').select('service_id, is_offered, price_egp').eq('staff_id', member.id),
      ]);
      if (sv.error) throw sv.error;
      if (ss.error) throw ss.error;
      const list = (sv.data ?? []) as SvcRow[];
      const over = new Map(((ss.data ?? []) as Array<{ service_id: string; is_offered: boolean; price_egp: number | string | null }>).map((r) => [r.service_id, r]));
      const next: Record<string, { offered: boolean; price: string }> = {};
      for (const sv1 of list) {
        const o = over.get(sv1.id);
        next[sv1.id] = { offered: o ? o.is_offered : true, price: o?.price_egp != null ? String(o.price_egp) : '' };
      }
      setSvcs(list);
      setRows(next);
      return true;
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!rows) return;
      for (const sv1 of svcs) {
        const r = rows[sv1.id];
        if (!r) continue;
        const price = r.price.trim() === '' ? null : Number(r.price);
        if (price !== null && (!Number.isFinite(price) || price < 0)) throw new Error('PRICE');
        if (r.offered && price === null) {
          const { error } = await untypedDb.from('staff_services').delete().eq('staff_id', member.id).eq('service_id', sv1.id);
          if (error) throw error;
        } else {
          const { error } = await untypedDb
            .from('staff_services')
            .upsert({ staff_id: member.id, service_id: sv1.id, is_offered: r.offered, price_egp: price }, { onConflict: 'staff_id,service_id' });
          if (error) throw error;
        }
      }
    },
    onSuccess: () => {
      toast.success(L('اتحفظت الخدمات والأسعار', 'Saved'));
      void queryClient.invalidateQueries({ queryKey: ['staff-services'] });
      onClose();
    },
    onError: (e) =>
      toast.error((e as Error).message === 'PRICE' ? L('اكتب سعر صحيح', 'Enter a valid price') : L('معرفتش أحفظ، جرّب تاني', 'Could not save, try again'), {
        description: (e as Error).message === 'PRICE' ? undefined : errMsg(e),
      }),
  });

  const renderGroup = (title: string, extra: boolean) => {
    const group = svcs.filter((x) => x.is_extra === extra);
    if (group.length === 0 || !rows) return null;
    return (
      <div className="space-y-2">
        <p className="text-sm font-semibold text-espresso">{title}</p>
        {group.map((sv1) => {
          const r = rows[sv1.id];
          if (!r) return null;
          return (
            <div key={sv1.id} className={cn('rounded-btn border border-default p-2.5', !r.offered && 'opacity-60')}>
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate text-sm font-medium">{isAr ? sv1.name_ar : sv1.name_en}</span>
                <label className="flex shrink-0 items-center gap-1.5 text-sm">
                  <input
                    type="checkbox"
                    className="size-4 accent-gold"
                    checked={r.offered}
                    onChange={(e) => setRows({ ...rows, [sv1.id]: { ...r, offered: e.target.checked } })}
                  />
                  {L('بيقدّمها', 'Offers')}
                </label>
              </div>
              {r.offered ? (
                <div className="mt-2">
                  <Input
                    type="number"
                    min={0}
                    inputMode="decimal"
                    label={L(`سعر مختلف (الأساسي ${sv1.price_egp})`, `Custom price (base ${sv1.price_egp})`)}
                    placeholder={String(sv1.price_egp)}
                    value={r.price}
                    onChange={(e) => setRows({ ...rows, [sv1.id]: { ...r, price: e.target.value } })}
                  />
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center p-4 lg:items-center">
      <div className="absolute inset-0 bg-espresso/50" onClick={onClose} />
      <div className="relative max-h-[90dvh] w-full max-w-md space-y-3 overflow-y-auto rounded-card bg-white p-4">
        <h2 className="text-lg font-semibold">{L(`خدمات وأسعار ${member.name}`, `${member.name}'s services & prices`)}</h2>
        <p className="text-xs text-ink-70">
          {L('كله زي الصالون لحد ما تغيّر. سيب السعر فاضي لو نفس السعر، وشيل علامة "بيقدّمها" لو الحلاق ده مبيعملش الخدمة.', 'Everything matches the shop until you change it. Leave price empty for the same price; untick "Offers" if he does not do the service.')}
        </p>
        {loadQ.isError ? (
          <p className="rounded-btn bg-danger/10 p-3 text-sm text-danger">{L('معرفتش أحمّل: ', 'Could not load: ')}{errMsg(loadQ.error)}</p>
        ) : !rows ? (
          <Skeleton className="h-40" />
        ) : (
          <>
            {renderGroup(L('الخدمات', 'Services'), false)}
            {renderGroup(L('الإضافات', 'Add-ons'), true)}
          </>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>{L('إلغاء', 'Cancel')}</Button>
          <Button loading={save.isPending} disabled={!rows} onClick={() => save.mutate()}>{L('حفظ', 'Save')}</Button>
        </div>
      </div>
    </div>
  );
}

const EMPTY: FormState = { id: null, name: '', bio: '', bioEn: '', socials: {}, years: '', photo: '', phone: '', username: '', password: '' };

const SOCIAL_FIELDS: Array<{ key: string; label: string; placeholder: string }> = [
  { key: 'instagram', label: 'Instagram', placeholder: '@username' },
  { key: 'facebook', label: 'Facebook', placeholder: 'facebook.com/username' },
  { key: 'tiktok', label: 'TikTok', placeholder: '@username' },
  { key: 'youtube', label: 'YouTube', placeholder: 'youtube.com/@channel' },
  { key: 'whatsapp', label: 'WhatsApp', placeholder: '01xxxxxxxxx' },
];

function errMsg(e: unknown): string {
  const m = (e as { message?: string } | null)?.message ?? '';
  if (/OWNER_ONLY/.test(m)) return 'مينفعش توقف نفسك وانت الحلاق الوحيد الشغال. لو عندك ظرف استخدم "ظرف طارئ" من المزيد.';
  if (/OWNER_PROTECTED/.test(m)) return 'صاحب المحل ما ينفعش يتمسح. لو عايز توقف نفسك شغّل ملف features-v38.sql الأول.';
  return m;
}

export function StaffPage() {
  const { i18n } = useTranslation();
  const isAr = !!i18n.language?.startsWith('ar');
  const L = (ar: string, en: string) => (isAr ? ar : en);
  const queryClient = useQueryClient();
  const staffQuery = useStaff();
  const badges = staffBadges(staffQuery.data ?? []);
  const [servicesFor, setServicesFor] = useState<StaffMember | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const phones = useStaffPhones();
  const isOwnerForm = !!form?.id && !!staffQuery.data?.find((x) => x.id === form.id)?.is_owner;
  const [share, setShare] = useState<{ name: string; phone: string; user: string; pass: string } | null>(null);
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
        bio_en: f.bioEn.trim() || null,
        socials: Object.fromEntries(Object.entries(f.socials).map(([k, v]) => [k, v.trim()]).filter(([, v]) => v)),
        experience_years: f.years.trim() ? Math.max(0, Math.round(Number(f.years))) : null,
        photo: f.photo.trim() || null,
      };
      let staffId = f.id ?? '';
      const fail = (e: unknown): never => {
        // الحلاق اتحفظ بس خطوة بعده فشلت: نحوّل الفورم لوضع التعديل عشان ميتكررش
        const err = new Error((e as { message?: string } | null)?.message ?? 'ERR') as Error & { staffId?: string };
        err.staffId = staffId;
        throw err;
      };
      if (f.id) {
        const res = await untypedDb.from('staff').update(row).eq('id', f.id);
        if (res.error) throw res.error;
      } else {
        const isFirst = (staffQuery.data?.length ?? 0) === 0;
        const res = await untypedDb
          .from('staff')
          .insert({ ...row, sort: (staffQuery.data?.length ?? 0) + 1 })
          .select('id')
          .single();
        if (res.error) throw res.error;
        staffId = String(res.data?.id ?? '');
        // أول حلاق بيتضاف = إنت، فبيتعيّن صاحب المحل تلقائي وحجوزاتك القديمة بتتسجل عليه
        if (isFirst && staffId) {
          const r = await loginRpc('admin_set_owner_staff', { p_staff_id: staffId });
          if (r.error) throw new Error(r.error.message);
        }
      }
      // رقم الحلاق (ليك إنت بس) وبيانات دخوله
      let phoneErr = false;
      try {
        await saveStaffPhone(staffId, f.phone);
      } catch {
        phoneErr = true;
      }
      let loginDone = false;
      if (f.username.trim() && f.password) {
        const r = await loginRpc('admin_set_staff_login', { p_staff: staffId, p_username: f.username, p_password: f.password });
        if (r.error) return fail(r.error);
        loginDone = true;
      }
      return { phoneErr, loginDone, name: f.name.trim(), phone: f.phone.trim(), user: f.username.trim().toLowerCase(), pass: f.password };
    },
    onSuccess: (r) => {
      toast.success(L('اتحفظ', 'Saved'));
      if (r.phoneErr) toast.error(L('الحلاق اتحفظ بس الرقم لأ. شغّل ملف features-v36.sql.', 'Saved, but the phone was not. Run features-v36.sql.'));
      setForm(null);
      refresh();
      void queryClient.invalidateQueries({ queryKey: ['staff-phones'] });
      void queryClient.invalidateQueries({ queryKey: ['staff-emails'] });
      if (r.loginDone) setShare({ name: r.name, phone: r.phone, user: r.user, pass: r.pass });
    },
    onError: (e) => {
      const sid = (e as Error & { staffId?: string }).staffId;
      if (sid) {
        setForm((cur) => (cur ? { ...cur, id: sid } : cur));
        refresh();
      }
      toast.error(
        (e as Error).message === 'NAME_REQUIRED' ? L('اكتب اسم الحلاق', 'Enter the name')
        : /USERNAME_TAKEN/.test((e as Error).message) ? L('اسم المستخدم ده مستخدم، اختار غيره', 'Username already taken')
        : /BAD_USERNAME/.test((e as Error).message) ? L('اسم المستخدم: 3 حروف أو أرقام إنجليزي على الأقل', 'Username: at least 3 letters/numbers')
        : /BAD_PASSWORD/.test((e as Error).message) ? L('الباسورد 6 حروف على الأقل', 'Password: at least 6 characters')
        : L('معرفتش أحفظ، جرّب تاني', 'Could not save, try again'),
        { description: (e as Error).message === 'NAME_REQUIRED' ? undefined : errMsg(e) },
      );
    },
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
    onError: (e) => toast.error(L('حصلت مشكلة، جرّب تاني', 'Something went wrong'), { description: errMsg(e) }),
  });

  const toggle = useMutation({
    mutationFn: async (m: StaffMember) => {
      // صاحب المحل يقدر يوقف نفسه بس لو فيه حلاق تاني شغال (وإلا المحل يفضل من غير حد يستقبل حجوزات)
      if (m.is_owner && m.is_active && !list.some((x) => x.id !== m.id && x.is_active)) {
        throw new Error('OWNER_ONLY');
      }
      const { error } = await untypedDb.from('staff').update({ is_active: !m.is_active }).eq('id', m.id);
      if (error) throw error;
    },
    onSuccess: refresh,
    onError: (e) => toast.error(L('حصلت مشكلة، جرّب تاني', 'Something went wrong'), { description: errMsg(e) }),
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
    onError: (e) => toast.error(L('حصلت مشكلة، جرّب تاني', 'Something went wrong'), { description: errMsg(e) }),
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
    <div className="min-w-0 max-w-full space-y-4 overflow-x-hidden">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold">{L('الطاقم', 'Team')}</h1>
          <p className="mt-1 text-sm text-ink-70">
            {L(
              'إنت (صاحب المحل) الأساس وما ينفعش يتمسح. باقي الحلاقين تضيفهم وتوقفهم براحتك. العميل بيشوف اختيار الحلاق لما يبقى فيه حلاقين شغالين اتنين أو أكتر.',
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
            <li key={m.id} className={cn('flex min-w-0 items-center gap-3 overflow-hidden rounded-card border border-default bg-white p-3', !m.is_active && 'opacity-60')}>
              <Avatar name={m.name} photo={m.photo} badge={badges.get(m.id)} className="size-14 shrink-0 text-xl" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-espresso">
                  {m.name}
                  {m.is_owner ? <span className="ms-2 rounded-full bg-espresso px-2 py-0.5 text-[10px] font-medium text-cream">{L('صاحب المحل', 'Owner')}</span> : null}
                </p>
                {m.experience_years != null ? (
                  <p className="text-xs font-medium text-gold-dark">{L(`${m.experience_years} سنة خبرة`, `${m.experience_years} yrs experience`)}</p>
                ) : null}
                {m.bio ? (
                  <p className="overflow-hidden break-words text-xs text-ink-70 [-webkit-box-orient:vertical] [-webkit-line-clamp:2] [display:-webkit-box]">{m.bio}</p>
                ) : null}
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
                <button type="button" onClick={() => setServicesFor(m)} className="rounded-full bg-sand px-2 py-0.5 text-xs font-medium text-espresso">
                  {L('الخدمات والأسعار', 'Services & prices')}
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
                  onClick={() => setForm({ id: m.id, name: m.name, bio: m.bio ?? '', bioEn: m.bio_en ?? '', socials: m.socials ?? {}, years: m.experience_years?.toString() ?? '', photo: m.photo ?? '', phone: phones.data?.[m.id] ?? '', username: '', password: '' })}
                  className="flex size-9 items-center justify-center rounded-btn hover:bg-sand"
                >
                  <Pencil className="size-4" aria-hidden />
                </button>
                {m.is_owner ? null : (
                <button
                  type="button"
                  aria-label={L('مسح', 'Delete')}
                  onClick={() => setToDelete(m)}
                  className="flex size-9 items-center justify-center rounded-btn text-danger hover:bg-danger/10"
                >
                  <Trash2 className="size-4" aria-hidden />
                </button>
                )}
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
            <h2 className="text-lg font-semibold">{form.id ? L('تعديل البيانات', 'Edit details') : list.length === 0 ? L('ضيف نفسك (صاحب المحل)', 'Add yourself (owner)') : L('إضافة حلاق', 'Add barber')}</h2>
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
            <div className="space-y-2 rounded-btn border border-gold/40 bg-gold/5 p-3">
              <p className="text-sm font-semibold text-espresso">{L('بيانات خاصة بيك إنت بس (مش بتظهر للعملاء)', 'Private (only you see this)')}</p>
              <Input
                dir="ltr"
                inputMode="tel"
                label={L('رقم الحلاق (واتساب)', 'Barber phone (WhatsApp)')}
                placeholder="01xxxxxxxxx"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
              {isOwnerForm ? (
                <p className="pt-1 text-xs text-ink-70">{L('إنت صاحب المحل: بتدخل بحسابك الأساسي، مش محتاج اسم مستخدم هنا.', 'You are the owner: sign in with your main account, no username needed here.')}</p>
              ) : (
                <>
              <p className="pt-1 text-xs text-ink-70">
                {L('دخوله لصفحة حجوزاته: اكتب اسم مستخدم وباسورد من عندك (سيبهم فاضيين لو مش عايز تدّيه دخول دلوقتي).', 'Sign-in to see his bookings: choose a username and password (leave empty for no login).')}
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                <Input
                  dir="ltr"
                  autoCapitalize="none"
                  label={L('اسم المستخدم', 'Username')}
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                />
                <Input
                  dir="ltr"
                  label={L('الباسورد', 'Password')}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                />
              </div>
                </>
              )}
            </div>
            <div className="space-y-2 rounded-btn border border-default p-3">
              <p className="text-sm font-medium text-ink-70">{L('السوشيال ميديا (اختياري، بتظهر للعميل في صفحته)', 'Social media (optional, shown on his page)')}</p>
              {SOCIAL_FIELDS.map((f) => (
                <Input
                  key={f.key}
                  dir="ltr"
                  label={f.label}
                  placeholder={f.placeholder}
                  value={form.socials[f.key] ?? ''}
                  onChange={(e) => setForm({ ...form, socials: { ...form.socials, [f.key]: e.target.value } })}
                />
              ))}
            </div>
            <Input label={L('سنين الخبرة', 'Years of experience')} type="number" min={0} inputMode="numeric" value={form.years} onChange={(e) => setForm({ ...form, years: e.target.value })} />
            <div>
              <label htmlFor="staff-bio" className="text-sm font-medium text-ink-70">{L('نبذة عنه (بتظهر للعميل، اكتب براحتك)', 'About him (shown to customers)')}</label>
              <textarea
                id="staff-bio"
                rows={6}
                maxLength={1200}
                value={form.bio}
                onChange={(e) => setForm({ ...form, bio: e.target.value })}
                className="mt-1 w-full rounded-btn border border-default bg-white px-3 py-2 text-sm"
              />
              <p className="mt-0.5 text-end font-latin text-[11px] text-ink-70">{form.bio.length}/1200</p>
            </div>
            <div>
              <label htmlFor="staff-bio-en" className="text-sm font-medium text-ink-70">{L('النبذة بالإنجليزي (اختياري)', 'Bio in English (optional)')}</label>
              <textarea
                id="staff-bio-en"
                dir="ltr"
                rows={4}
                maxLength={1200}
                value={form.bioEn}
                onChange={(e) => setForm({ ...form, bioEn: e.target.value })}
                className="mt-1 w-full rounded-btn border border-default bg-white px-3 py-2 text-sm"
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" onClick={() => setForm(null)}>{L('إلغاء', 'Cancel')}</Button>
              <Button loading={save.isPending} onClick={() => save.mutate(form)}>{L('حفظ', 'Save')}</Button>
            </div>
          </div>
        </div>
      ) : null}

      {share ? (
        <div className="fixed inset-0 z-[60] flex items-end justify-center p-4 lg:items-center">
          <div className="absolute inset-0 bg-espresso/50" onClick={() => setShare(null)} aria-hidden />
          <div className="relative w-full max-w-md space-y-3 rounded-card bg-white p-4 shadow-warm-lg">
            <h3 className="text-lg font-semibold">{L('اتحفظ حساب الحلاق ✅', 'Barber account saved ✅')}</h3>
            <p className="whitespace-pre-line rounded-btn bg-sand/50 p-3 text-sm" dir={isAr ? 'rtl' : 'ltr'}>
              {loginMessage(share.name, share.user, share.pass, isAr)}
            </p>
            <p className="text-xs text-ink-70">{L('الباسورد بيظهر هنا مرة واحدة بس، بعد كده تقدر تغيّره بس.', 'The password is shown only now; later you can only change it.')}</p>
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="ghost" onClick={() => setShare(null)}>{L('إغلاق', 'Close')}</Button>
              <Button
                disabled={!share.phone}
                onClick={() => {
                  const url = waLink(share.phone, loginMessage(share.name, share.user, share.pass, isAr));
                  if (url) window.open(url, '_blank', 'noopener');
                  else toast.error(L('رقم الواتساب مش مظبوط (01xxxxxxxxx)', 'Invalid WhatsApp number'));
                }}
              >
                {share.phone ? L('ابعتهاله على واتساب', 'Send on WhatsApp') : L('مفيش رقم', 'No phone')}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <StaffEarnings />

      <StaffAccessCard />

      {servicesFor ? <ServicesModal member={servicesFor} onClose={() => setServicesFor(null)} /> : null}
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
