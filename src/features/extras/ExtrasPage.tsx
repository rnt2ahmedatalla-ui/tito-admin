import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Card, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import { untypedDb } from '@/features/payments/useFinanceBoxes';
import { supabase } from '@/lib/supabase';
import { mapError } from '@/lib/errors';
import { formatEGP } from '@/lib/money';
import { cn } from '@/lib/cn';
import { useFeatureFlags } from './useFeatures';

const rpc = supabase.rpc.bind(supabase) as unknown as (
  fn: string,
  args?: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message: string } | null }>;

type Pkg = {
  id: string;
  name_ar: string;
  name_en: string;
  service_id: string | null;
  sessions: number;
  price_egp: number;
  validity_days: number;
  is_active: boolean;
};
type Svc = { id: string; name_ar: string };
type Prof = { id: string; full_name: string | null; phone: string | null };
type CustPkg = {
  id: string;
  name_ar: string;
  sessions_left: number;
  sessions_total: number;
  expires_at: string;
  profile: { full_name: string | null; phone: string | null } | null;
};

const selectCls = 'min-h-11 w-full rounded-btn border border-bark/20 bg-white px-3 text-sm text-espresso';

function Toggles() {
  const { i18n, t } = useTranslation();
  const L = (ar: string, en: string) => (i18n.language?.startsWith('ar') ? ar : en);
  const qc = useQueryClient();
  const flags = useFeatureFlags();
  const save = useMutation({
    mutationFn: async (patch: Record<string, boolean | number>) => {
      const { error } = await untypedDb.from('feature_settings').update(patch).eq('id', 1);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['feature-settings'] }),
    onError: (e) => toast.error(mapError(e, t)),
  });
  const f = flags.data;
  const rows: Array<{ key: string; on: boolean; title: string; hint: string }> = [
    {
      key: 'waitlist_enabled',
      on: !!f?.waitlist,
      title: L('قايمة الانتظار', 'Waiting list'),
      hint: L('لما اليوم يبقى مزدحم، العميل يسجّل في الانتظار وانت تبلّغه على واتساب لو فضي معاد.', 'When a day is full, customers can join a waiting list and you message them if a slot frees up.'),
    },
    {
      key: 'packages_enabled',
      on: !!f?.packages,
      title: L('الباقات والاشتراكات', 'Packages'),
      hint: L('بتبيع للعميل باقة (مثلاً 5 حلاقات بسعر أقل) وبتخصم منها مع كل حجز.', 'Sell bundles (e.g. 5 cuts at a discount) and deduct a session per booking.'),
    },
    {
      key: 'wait_estimate_enabled',
      on: !!f?.waitEstimate,
      title: L('الحلاقين الفاضيين دلوقتي', 'Barbers available now'),
      hint: L('بيظهر للعميل في الصفحة الرئيسية الحلاقين الفاضيين دلوقتي أو اللي هيفضوا خلال الساعات اللي تحددها تحت، ومعاه زرار تسجيل في قايمة الانتظار. بيختفي لو عندك حلاق واحد بس أو المحل مقفول.', 'Shows customers the barbers who are free now or will be within the hours you set below, with a waiting-list button. Hidden with a single barber or when closed.'),
    },
  ];
  const [days, setDays] = useState<string | null>(null);
  const [prepay, setPrepay] = useState<string | null>(null);
  const [win, setWin] = useState<string | null>(null);
  const [auto, setAuto] = useState<string | null>(null);
  const saveNum = (key: string, raw: string, min: number, max: number) => {
    const n = Math.round(Number(raw));
    if (!(n >= min && n <= max)) {
      toast.error(L(`اكتب رقم من ${min} لـ ${max}`, `Enter a number from ${min} to ${max}`));
      return;
    }
    save.mutate({ [key]: n });
  };
  if (flags.isError) return null;
  return (
    <Card>
      <CardBody className="divide-y divide-default p-0">
        {rows.map((r) => (
          <label key={r.key} className="flex items-start justify-between gap-3 p-4">
            <span className="min-w-0">
              <span className="block font-semibold text-espresso">{r.title}</span>
              <span className="mt-0.5 block text-xs text-ink-70">{r.hint}</span>
            </span>
            <input
              type="checkbox"
              className="mt-1 size-5 shrink-0 accent-[#c9953f]"
              checked={r.on}
              disabled={save.isPending || !f}
              onChange={(e) => save.mutate({ [r.key]: e.target.checked })}
            />
          </label>
        ))}
        <div className="space-y-2 p-4">
          <label className="flex items-start justify-between gap-3">
            <span className="min-w-0">
              <span className="block font-semibold text-espresso">{L('بانر "وحشتنا" للعميل', '"We miss you" banner')}</span>
              <span className="mt-0.5 block text-xs text-ink-70">
                {L('بيظهر للعميل في موقعك وبيعد الأيام من آخر حلاقة، ويختفي أول ما يحجز، ويرجع بعد المدة اللي تحددها من آخر حلاقة.', 'Shown on the site; counts days since the last cut, hides once he books, and returns after the period you set.')}
              </span>
            </span>
            <input
              type="checkbox"
              className="mt-1 size-5 shrink-0 accent-[#c9953f]"
              checked={!!f?.inactiveBanner}
              disabled={save.isPending || !f}
              onChange={(e) => save.mutate({ inactive_banner_enabled: e.target.checked })}
            />
          </label>
          <div className="flex items-end gap-2">
            <div className="min-w-0 flex-1">
              <Input
                label={L('يظهر بعد كام يوم من آخر حلاقة', 'Show after how many days')}
                inputMode="numeric"
                value={days ?? String(f?.inactiveAfterDays ?? 28)}
                onChange={(e) => setDays(e.target.value)}
              />
            </div>
            <Button variant="secondary" loading={save.isPending} onClick={() => saveNum('inactive_after_days', days ?? String(f?.inactiveAfterDays ?? 28), 3, 365)}>
              {L('حفظ', 'Save')}
            </Button>
          </div>
        </div>
        <div className="space-y-2 p-4">
          <p className="font-semibold text-espresso">{L('كام ساعة قدّام نعرض الحلاق اللي هيفضى؟', 'How many hours ahead to show a barber who will be free')}</p>
          <p className="text-xs text-ink-70">
            {L('مثلاً 3: العميل يشوف الحلاق الفاضي دلوقتي، أو اللي هيفضى خلال 3 ساعات. اللي هيفضى بعد كده مبيظهرش. (من 1 لـ 12)', 'E.g. 3: shows barbers free now or within 3 hours. Others are hidden. (1 to 12)')}
          </p>
          <div className="flex items-end gap-2">
            <div className="min-w-0 flex-1">
              <Input
                label={L('عدد الساعات', 'Hours')}
                inputMode="numeric"
                value={win ?? String(f?.waitWindowHours ?? 3)}
                onChange={(e) => setWin(e.target.value)}
              />
            </div>
            <Button variant="secondary" loading={save.isPending} onClick={() => saveNum('wait_window_hours', win ?? String(f?.waitWindowHours ?? 3), 1, 12)}>
              {L('حفظ', 'Save')}
            </Button>
          </div>
        </div>
        <div className="space-y-2 p-4">
          <p className="font-semibold text-espresso">{L('اعتبار الحجز "تم" تلقائي', 'Mark bookings "done" automatically')}</p>
          <p className="text-xs text-ink-70">
            {L(
              'لو مش بتدوس "تمت" على الحجز بعد الحلاقة، اكتب هنا بعد كام ساعة من نهاية الميعاد النظام يعتبره تم لوحده. ده بيظبط الإيراد والتقارير وعدّاد "آخر حلاقة" وطلب التقييم. اللي ما حضرش علّمه "ما حضرش" قبل كده. اكتب 0 لو عايز تقفلها. (من 0 لـ 72)',
              'If you do not press "done", bookings are marked done this many hours after their end time. This fixes income, reports, the last-cut counter and rating requests. Mark no-shows before that. 0 = off. (0 to 72)',
            )}
          </p>
          <div className="flex items-end gap-2">
            <div className="min-w-0 flex-1">
              <Input
                label={L('بعد كام ساعة', 'After how many hours')}
                inputMode="numeric"
                value={auto ?? String(f?.autoCompleteHours ?? 0)}
                onChange={(e) => setAuto(e.target.value)}
              />
            </div>
            <Button variant="secondary" loading={save.isPending} onClick={() => saveNum('auto_complete_hours', auto ?? String(f?.autoCompleteHours ?? 0), 0, 72)}>
              {L('حفظ', 'Save')}
            </Button>
          </div>
        </div>
        <div className="space-y-2 p-4">
          <p className="font-semibold text-espresso">{L('دفع مقدّم لمن غاب كتير', 'Prepayment for repeat no-shows')}</p>
          <p className="text-xs text-ink-70">
            {L('العميل اللي غاب العدد ده من المرات أو أكتر مبيقدرش يختار "الدفع في المحل" ولازم يدفع أونلاين قبل الحجز. اكتب 0 لو عايز تقفلها.', 'Customers who missed this many bookings must pay online (no pay-at-shop). Enter 0 to turn off.')}
          </p>
          <div className="flex items-end gap-2">
            <div className="min-w-0 flex-1">
              <Input
                label={L('بعد كام غياب (0 = مقفول)', 'After how many no-shows (0 = off)')}
                inputMode="numeric"
                value={prepay ?? String(f?.noshowPrepayAfter ?? 0)}
                onChange={(e) => setPrepay(e.target.value)}
              />
            </div>
            <Button variant="secondary" loading={save.isPending} onClick={() => saveNum('noshow_prepay_after', prepay ?? String(f?.noshowPrepayAfter ?? 0), 0, 50)}>
              {L('حفظ', 'Save')}
            </Button>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}

function PackagesSection({ services }: { services: Svc[] }) {
  const { i18n, t } = useTranslation();
  const L = (ar: string, en: string) => (i18n.language?.startsWith('ar') ? ar : en);
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['packages-admin'],
    queryFn: async (): Promise<Pkg[]> => {
      const { data, error } = await untypedDb.from('packages').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Pkg[];
    },
    retry: false,
  });
  const [name, setName] = useState('');
  const [svc, setSvc] = useState('');
  const [sessions, setSessions] = useState('5');
  const [price, setPrice] = useState('');
  const [days, setDays] = useState('90');
  const refresh = () => void qc.invalidateQueries({ queryKey: ['packages-admin'] });

  const add = useMutation({
    mutationFn: async () => {
      const s = Math.round(Number(sessions));
      const p = Number(price);
      const d = Math.round(Number(days));
      if (!name.trim() || !(s > 0) || !(p >= 0) || price === '' || !(d > 0)) throw new Error('BAD');
      const { error } = await untypedDb.from('packages').insert({
        name_ar: name.trim(),
        name_en: name.trim(),
        service_id: svc || null,
        sessions: s,
        price_egp: p,
        validity_days: d,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(L('اتضافت الباقة', 'Package added'));
      setName('');
      setPrice('');
      refresh();
    },
    onError: (e) => toast.error((e as Error).message === 'BAD' ? L('راجع الاسم والأرقام', 'Check the name and numbers') : mapError(e, t)),
  });
  const toggle = useMutation({
    mutationFn: async (p: Pkg) => {
      const { error } = await untypedDb.from('packages').update({ is_active: !p.is_active }).eq('id', p.id);
      if (error) throw error;
    },
    onSuccess: refresh,
    onError: (e) => toast.error(mapError(e, t)),
  });

  if (q.isError) {
    return <p className="rounded-btn bg-sand/50 p-3 text-sm">{L('محتاج تشغّل ملف features-v32.sql في Supabase الأول.', 'Run features-v32.sql in Supabase first.')}</p>;
  }
  const svcName = (id: string | null) => (id ? services.find((s) => s.id === id)?.name_ar ?? '—' : L('أي خدمة', 'Any service'));

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-bold text-espresso">{L('الباقات', 'Packages')}</h2>
      <Card>
        <CardBody className="space-y-3 p-4">
          <Input label={L('اسم الباقة (مثال: 5 حلاقات)', 'Package name')} value={name} onChange={(e) => setName(e.target.value)} />
          <div>
            <label className="text-sm font-medium text-ink-70">{L('الخدمة', 'Service')}</label>
            <select className={cn(selectCls, 'mt-1')} value={svc} onChange={(e) => setSvc(e.target.value)}>
              <option value="">{L('أي خدمة', 'Any service')}</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>{s.name_ar}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Input label={L('عدد الحصص', 'Sessions')} inputMode="numeric" value={sessions} onChange={(e) => setSessions(e.target.value)} />
            <Input label={L('السعر', 'Price')} inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
            <Input label={L('صالحة (يوم)', 'Valid (days)')} inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} />
          </div>
          <Button variant="primary" loading={add.isPending} onClick={() => add.mutate()}>
            {L('إضافة باقة', 'Add package')}
          </Button>
        </CardBody>
      </Card>
      {q.isLoading ? (
        <Skeleton className="h-20" />
      ) : (
        <div className="space-y-2">
          {(q.data ?? []).map((p) => (
            <Card key={p.id} className={cn(!p.is_active && 'opacity-60')}>
              <CardBody className="flex flex-wrap items-center justify-between gap-2 p-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-espresso">{p.name_ar}</p>
                  <p className="text-xs text-ink-70">
                    {svcName(p.service_id)} · {p.sessions} {L('حصة', 'sessions')} · {p.validity_days} {L('يوم', 'days')}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-latin font-semibold text-espresso">{formatEGP(p.price_egp)}</span>
                  <Button size="sm" variant="ghost" onClick={() => toggle.mutate(p)}>
                    {p.is_active ? L('إيقاف', 'Pause') : L('تفعيل', 'Activate')}
                  </Button>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function SellSection() {
  const { i18n, t } = useTranslation();
  const L = (ar: string, en: string) => (i18n.language?.startsWith('ar') ? ar : en);
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState<Prof | null>(null);
  const [pkgId, setPkgId] = useState('');

  const profs = useQuery({
    queryKey: ['pkg-profiles', search],
    enabled: search.trim().length >= 2 && !picked,
    queryFn: async (): Promise<Prof[]> => {
      const s = search.trim().replace(/[%,()]/g, '');
      const { data, error } = await untypedDb
        .from('profiles')
        .select('id, full_name, phone')
        .or(`full_name.ilike.%${s}%,phone.ilike.%${s}%`)
        .limit(6);
      if (error) throw error;
      return (data ?? []) as Prof[];
    },
  });
  const pkgs = useQuery({
    queryKey: ['packages-admin'],
    queryFn: async (): Promise<Pkg[]> => {
      const { data, error } = await untypedDb.from('packages').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Pkg[];
    },
    retry: false,
  });
  const active = (pkgs.data ?? []).filter((p) => p.is_active);

  const sell = useMutation({
    mutationFn: async () => {
      if (!picked || !pkgId) throw new Error('BAD');
      const { error } = await rpc('admin_sell_package', { p_user: picked.id, p_package: pkgId });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success(L('اتباعت الباقة واتسجلت في المالية', 'Package sold and recorded in finance'));
      setPicked(null);
      setSearch('');
      setPkgId('');
      void qc.invalidateQueries({ queryKey: ['customer-packages-admin'] });
      void qc.invalidateQueries({ queryKey: ['fin-data'] });
    },
    onError: (e) => toast.error((e as Error).message === 'BAD' ? L('اختار العميل والباقة', 'Pick a customer and a package') : mapError(e, t)),
  });

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-bold text-espresso">{L('بيع باقة لعميل', 'Sell a package')}</h2>
      <Card>
        <CardBody className="space-y-3 p-4">
          {picked ? (
            <div className="flex items-center justify-between gap-2 rounded-btn bg-gold/10 p-3">
              <span className="min-w-0 truncate font-medium text-espresso">
                {picked.full_name ?? '—'} <span className="font-latin text-xs text-ink-70">{picked.phone}</span>
              </span>
              <Button size="sm" variant="ghost" onClick={() => setPicked(null)}>{L('تغيير', 'Change')}</Button>
            </div>
          ) : (
            <>
              <Input label={L('دوّر بالاسم أو الرقم', 'Search name or phone')} value={search} onChange={(e) => setSearch(e.target.value)} />
              <div className="space-y-1">
                {(profs.data ?? []).map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPicked(p)}
                    className="flex w-full items-center justify-between gap-2 rounded-btn border border-default px-3 py-2 text-start text-sm hover:bg-sand/40"
                  >
                    <span className="min-w-0 truncate">{p.full_name ?? '—'}</span>
                    <span className="font-latin text-xs text-ink-70">{p.phone}</span>
                  </button>
                ))}
              </div>
            </>
          )}
          <select className={selectCls} value={pkgId} onChange={(e) => setPkgId(e.target.value)}>
            <option value="">{L('اختار الباقة', 'Choose package')}</option>
            {active.map((p) => (
              <option key={p.id} value={p.id}>{p.name_ar} — {p.price_egp}</option>
            ))}
          </select>
          <p className="text-xs text-ink-70">{L('الفلوس بتتسجل دخل كاش في المالية تلقائي.', 'The payment is recorded as cash income in Finance automatically.')}</p>
          <Button variant="primary" loading={sell.isPending} onClick={() => sell.mutate()}>
            {L('تأكيد البيع', 'Confirm sale')}
          </Button>
        </CardBody>
      </Card>
    </div>
  );
}

function ActiveCustomerPackages() {
  const { i18n } = useTranslation();
  const L = (ar: string, en: string) => (i18n.language?.startsWith('ar') ? ar : en);
  const q = useQuery({
    queryKey: ['customer-packages-admin'],
    queryFn: async (): Promise<CustPkg[]> => {
      const { data, error } = await untypedDb
        .from('customer_packages')
        .select('id, name_ar, sessions_left, sessions_total, expires_at, profile:profiles(full_name, phone)')
        .gt('sessions_left', 0)
        .order('expires_at');
      if (error) throw error;
      return (data ?? []) as unknown as CustPkg[];
    },
    retry: false,
  });
  const rows = q.data ?? [];
  if (q.isError) return null;
  return (
    <div className="space-y-3">
      <h2 className="text-lg font-bold text-espresso">{L('باقات شغالة عند العملاء', 'Active customer packages')}</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-ink-70">{L('مفيش باقات شغالة.', 'No active packages.')}</p>
      ) : (
        rows.map((r) => (
          <Card key={r.id}>
            <CardBody className="flex items-center justify-between gap-2 p-3">
              <div className="min-w-0">
                <p className="truncate font-medium text-espresso">{r.profile?.full_name ?? '—'}</p>
                <p className="truncate text-xs text-ink-70">{r.name_ar} · {L('لحد', 'until')} <span className="font-latin">{r.expires_at}</span></p>
              </div>
              <span className="shrink-0 rounded-full bg-gold/20 px-3 py-1 font-latin text-sm font-bold text-espresso">
                {r.sessions_left}/{r.sessions_total}
              </span>
            </CardBody>
          </Card>
        ))
      )}
    </div>
  );
}

export function ExtrasPage() {
  const { i18n } = useTranslation();
  const L = (ar: string, en: string) => (i18n.language?.startsWith('ar') ? ar : en);
  const svcQ = useQuery({
    queryKey: ['extras-services'],
    queryFn: async (): Promise<Svc[]> => {
      const { data, error } = await untypedDb.from('services').select('id, name_ar').eq('is_extra', false).order('sort_order');
      if (error) throw error;
      return (data ?? []) as Svc[];
    },
  });
  return (
    <div className="w-full min-w-0 max-w-full space-y-5 overflow-x-clip">
      <h1 className="text-xl font-bold text-espresso">{L('الباقات والمميزات', 'Packages & features')}</h1>
      <Toggles />
      <PackagesSection services={svcQ.data ?? []} />
      <SellSection />
      <ActiveCustomerPackages />
    </div>
  );
}
