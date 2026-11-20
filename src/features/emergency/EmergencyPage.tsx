import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardBody } from '@/components/ui/Card';
import { useStaff } from '@/features/staff/StaffPage';
import { fetchSlots } from '@/lib/slots';
import { rpcUntyped, waLink } from '@/features/staff/staffLogin';
import { untypedDb } from '@/features/payments/useFinanceBoxes';
import { cairoDateString, cairoDayBounds, formatCairoDateShort, formatCairoTime, toCairo } from '@/lib/time';
import { cn } from '@/lib/cn';

const CUSTOMER_BASE_URL = (import.meta.env.VITE_CUSTOMER_URL || 'https://tito-customer.vercel.app').replace(/\/+$/, '');

type Row = {
  id: string;
  start_at: string;
  end_at: string;
  service_id: string;
  staff_id: string | null;
  status: string;
  move_status: string | null;
  move_start_at: string | null;
  price_egp: number | null;
  service_name_ar: string | null;
  service_name_en: string | null;
  profile: { full_name: string | null; phone: string | null } | null;
  payment: PayRow | PayRow[] | null;
};

type PayRow = { status: string | null; method: string | null; amount_egp: number | null };
type QueueItem = { id: string; name: string; phone: string; msg: string; kind: 'move' | 'cancel'; sent: boolean };

const DEFAULT_MOVE_AR =
  'أهلاً {name} 🙏\nاضطرينا نأجل معادك يوم {date} الساعة {time} بسبب ظرف طارئ، ونعتذر جدًا.\nاقترحنا عليك معاد جديد: {newdate} الساعة {newtime}.\nافتح اللينك ووافق، ولو المعاد مش مناسب رد علينا هنا وهنظبطلك معاد تاني:\n{link}';
const DEFAULT_CANCEL_AR =
  'أهلاً {name} 🙏\nنعتذر جدًا، اضطرينا نلغي حجزك يوم {date} الساعة {time} بسبب ظرف طارئ.\nتقدر تحجز معاد جديد من هنا:\n{book}\nولو كنت دفعت أونلاين فلوسك هترجعلك.';
const DEFAULT_MOVE_EN =
  'Hi {name} 🙏\nWe had to move your booking on {date} at {time} because of an emergency — we are very sorry.\nWe suggest a new time: {newdate} at {newtime}.\nOpen the link to confirm, or reply here if it does not suit you and we will find another time:\n{link}';
const DEFAULT_CANCEL_EN =
  'Hi {name} 🙏\nWe are very sorry — we had to cancel your booking on {date} at {time} because of an emergency.\nYou can book a new time here:\n{book}\nIf you paid online, you will be refunded.';

function load(key: string, fallback: string): string {
  try {
    return localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
}
function save(key: string, v: string) {
  try {
    localStorage.setItem(key, v);
  } catch {
    /* ignore */
  }
}
function fill(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? '');
}
const minutesOfDay = (iso: string): number => {
  const d = toCairo(iso);
  return d.getHours() * 60 + d.getMinutes();
};

/** ظرف طارئ: قفل يوم (أو حلاق) + اقتراح معاد جديد أو إلغاء مع اعتذار لكل الحجوزات المتأثرة */
export function EmergencyPage() {
  const { i18n } = useTranslation();
  const isAr = !!i18n.language?.startsWith('ar');
  const L = (ar: string, en: string) => (isAr ? ar : en);
  const locale = isAr ? 'ar' : 'en';
  const qc = useQueryClient();
  const staff = (useStaff().data ?? []).filter((m) => m.is_active || m.is_owner);

  const [date, setDate] = useState(() => cairoDateString(new Date()));
  const [scope, setScope] = useState<string>('all');
  const [reason, setReason] = useState('');
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [showMsgs, setShowMsgs] = useState(false);
  const [tplMove, setTplMove] = useState(() => load('tito_em_move', isAr ? DEFAULT_MOVE_AR : DEFAULT_MOVE_EN));
  const [tplCancel, setTplCancel] = useState(() => load('tito_em_cancel', isAr ? DEFAULT_CANCEL_AR : DEFAULT_CANCEL_EN));

  const bounds = useMemo(() => cairoDayBounds(new Date(`${date}T12:00:00+02:00`)), [date]);

  const rowsQ = useQuery({
    queryKey: ['emergency-rows', date, scope],
    queryFn: async (): Promise<Row[]> => {
      let q = untypedDb
        .from('bookings')
        .select(
          'id, start_at, end_at, service_id, staff_id, status, move_status, move_start_at, price_egp, service_name_ar, service_name_en, profile:profiles!bookings_user_id_fkey(full_name, phone), payment:payments(status, method, amount_egp)',
        )
        .gte('start_at', bounds.start)
        .lte('start_at', bounds.end)
        .in('status', ['confirmed', 'pending_payment', 'cancelled']);
      if (scope !== 'all') q = q.eq('staff_id', scope);
      const { data, error } = await q.order('start_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
  });
  const all = rowsQ.data ?? [];
  const active = all.filter((r) => r.status !== 'cancelled');
  const cancelled = all.filter((r) => r.status === 'cancelled');
  const staffName = (id: string | null) => (id ? (staff.find((m) => m.id === id)?.name ?? '') : '');
  // فلوس اتدفعت أونلاين فعلاً (الدفع في المحل مش بيتحسب)
  const onlinePaid = (r: Row): { amount: number; confirmed: boolean } | null => {
    const arr = Array.isArray(r.payment) ? r.payment : r.payment ? [r.payment] : [];
    const p = arr.find((x) => x.method && x.method !== 'pay_at_shop' && (x.status === 'confirmed' || x.status === 'submitted'));
    return p ? { amount: Number(p.amount_egp ?? r.price_egp ?? 0), confirmed: p.status === 'confirmed' } : null;
  };

  // اليوم مقفول؟ (قفل "ظرف طارئ" أو إجازة اليوم كله) مع إمكانية الرجوع
  const closureQ = useQuery({
    queryKey: ['emergency-closure', date, scope],
    queryFn: async (): Promise<Array<{ id: string; reason: string | null }>> => {
      let q = untypedDb.from('time_off').select('id, reason, staff_id').eq('all_day', true).gte('start_at', bounds.start).lte('start_at', bounds.end);
      q = scope === 'all' ? q.is('staff_id', null) : q.eq('staff_id', scope);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; reason: string | null }>;
    },
  });
  const closures = closureQ.data ?? [];
  const closed = closures.length > 0;

  const reopenDay = async () => {
    setBusy(true);
    try {
      const { error } = await untypedDb.from('time_off').delete().in('id', closures.map((c) => c.id));
      if (error) throw error;
      toast.success(L('رجّعت فتح اليوم، الحجز رجع متاح', 'Day re-opened'));
      void closureQ.refetch();
      void qc.invalidateQueries({ queryKey: ['time-off'] });
      void qc.invalidateQueries({ queryKey: ['bookings', 'today'] });
    } catch (e) {
      toast.error(L('معرفتش أفتح اليوم: ', 'Could not re-open: ') + (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const undoMove = async (id: string) => {
    const res = await rpcUntyped('admin_cancel_booking_move', { p_booking_id: id });
    if (res.error) toast.error(res.error.message);
    else {
      toast.success(L('اتلغى اقتراح المعاد، حجزه زي ما هو', 'Suggestion withdrawn'));
      setQueue((q) => q.filter((x) => x.id !== id));
      void rowsQ.refetch();
    }
  };

  const toggle = (id: string) =>
    setSel((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const chosen = active.filter((r) => sel.has(r.id));

  // قفل اليوم عشان محدش يحجز فيه
  const closeDay = async () => {
    setBusy(true);
    try {
      const { error } = await untypedDb.from('time_off').insert({
        start_at: bounds.start,
        end_at: bounds.end,
        all_day: true,
        reason: reason.trim() || 'ظرف طارئ',
        staff_id: scope === 'all' ? null : scope,
      });
      if (error) throw error;
      void closureQ.refetch();
      toast.success(L('اليوم اتقفل، محدش هيقدر يحجز فيه', 'Day closed, nobody can book it'));
      void qc.invalidateQueries({ queryKey: ['time-off'] });
      void qc.invalidateQueries({ queryKey: ['bookings', 'today'] });
    } catch (e) {
      toast.error(L('معرفتش أقفل اليوم: ', 'Could not close the day: ') + (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // أقرب معاد فاضي لنفس الحلاق (من تاني يوم لحد 7 أيام) وبنفس الساعة تقريبًا
  const suggest = async (r: Row, taken: Array<{ staff: string | null; s: number; e: number }>): Promise<string | null> => {
    const dur = Date.parse(r.end_at) - Date.parse(r.start_at);
    const want = minutesOfDay(r.start_at);
    for (let i = 1; i <= 7; i++) {
      const day = cairoDateString(new Date(Date.parse(bounds.start) + (i * 24 + 12) * 3600_000));
      if (day <= cairoDateString(new Date())) continue;
      const res = await fetchSlots({ serviceId: r.service_id, date: day, staffId: r.staff_id, durationMin: Math.round(dur / 60000) || null });
      if (res.error) continue;
      const starts = res.starts
        .filter((st) => {
          const a = Date.parse(st);
          const b = a + dur;
          return !taken.some((t) => t.staff === r.staff_id && a < t.e && b > t.s);
        })
        .sort((x, y) => Math.abs(minutesOfDay(x) - want) - Math.abs(minutesOfDay(y) - want));
      if (starts[0]) return starts[0];
    }
    return null;
  };

  const info = (r: Row) => ({
    name: r.profile?.full_name ?? '',
    phone: r.profile?.phone ?? '',
    date: formatCairoDateShort(r.start_at),
    time: formatCairoTime(r.start_at, locale),
  });

  const runMove = async (rows: Row[]) => {
    if (rows.length === 0) return;
    setBusy(true);
    const taken: Array<{ staff: string | null; s: number; e: number }> = [];
    const out: QueueItem[] = [];
    const failed: string[] = [];
    for (const r of rows) {
      const i = info(r);
      const start = await suggest(r, taken);
      if (!start) {
        failed.push(i.name || r.id);
        continue;
      }
      const dur = Date.parse(r.end_at) - Date.parse(r.start_at);
      const res = await rpcUntyped('admin_propose_booking_move', { p_booking_id: r.id, p_start_at: start });
      const token = (res.data as { token?: string } | null)?.token;
      if (res.error || !token) {
        failed.push(i.name || r.id);
        continue;
      }
      taken.push({ staff: r.staff_id, s: Date.parse(start), e: Date.parse(start) + dur });
      out.push({
        id: r.id,
        name: i.name,
        phone: i.phone,
        kind: 'move',
        sent: false,
        msg: fill(tplMove, {
          ...i,
          newdate: formatCairoDateShort(start),
          newtime: formatCairoTime(start, locale),
          link: `${CUSTOMER_BASE_URL}/move/${token}`,
        }),
      });
    }
    setBusy(false);
    setQueue((q) => [...q.filter((x) => x.sent), ...out]);
    setSel(new Set());
    void rowsQ.refetch();
    if (out.length) toast.success(L(`جهزت ${out.length} رسالة، ابعتهم واحدة واحدة من تحت`, `${out.length} messages ready, send them below`));
    if (failed.length)
      toast.error(L(`مفيش معاد فاضي لـ: ${failed.join('، ')} (اقترح لهم يدوي أو إلغي)`, `No free time for: ${failed.join(', ')}`));
  };

  const runCancel = async (rows: Row[]) => {
    if (rows.length === 0) return;
    setBusy(true);
    const out: QueueItem[] = [];
    for (const r of rows) {
      const res = await rpcUntyped('admin_cancel_booking', {
        p_booking_id: r.id,
        p_reason: reason.trim() ? `ظرف طارئ: ${reason.trim()}` : 'ظرف طارئ',
      });
      if (res.error) {
        toast.error(L('معرفتش ألغي حجز: ', 'Could not cancel: ') + res.error.message);
        continue;
      }
      const i = info(r);
      out.push({ id: r.id, name: i.name, phone: i.phone, kind: 'cancel', sent: false, msg: fill(tplCancel, { ...i, book: `${CUSTOMER_BASE_URL}/book` }) });
    }
    setBusy(false);
    setQueue((q) => [...q.filter((x) => x.sent), ...out]);
    setSel(new Set());
    void rowsQ.refetch();
    void qc.invalidateQueries({ queryKey: ['bookings', 'today'] });
    if (out.length) toast.success(L(`اتلغى ${out.length} حجز، ابعت الاعتذار من تحت`, `${out.length} cancelled, send apologies below`));
  };

  const pending = queue.filter((q) => !q.sent);
  const next = pending[0];
  const sendNext = () => {
    if (!next) return;
    const url = next.phone ? waLink(next.phone, next.msg) : null;
    if (!url) toast.error(L(`مفيش رقم صالح لـ ${next.name}`, `No valid phone for ${next.name}`));
    else window.open(url, '_blank', 'noopener,noreferrer');
    setQueue((q) => q.map((x) => (x.id === next.id ? { ...x, sent: true } : x)));
  };

  const stepBadge = (n: number) => (
    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-espresso font-latin text-sm font-bold text-cream">{n}</span>
  );
  const chip = (on: boolean) =>
    cn(
      'rounded-full border px-3.5 py-1.5 text-sm transition-colors',
      on ? 'border-gold bg-gold/20 font-semibold text-espresso' : 'border-bark/20 bg-white text-ink-70 hover:bg-sand/50',
    );

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5 pb-24">
      <div className="flex items-start gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-danger/10">
          <TriangleAlert className="size-6 text-danger" aria-hidden />
        </span>
        <div>
          <h1 className="text-xl font-bold text-espresso">{L('ظرف طارئ', 'Emergency')}</h1>
          <p className="mt-0.5 text-sm text-ink-70">
            {L(
              'اقفل اليوم، وبعدين ابعت لكل زبون اقتراح معاد جديد أو اعتذار. الرسايل بتتبعت من واتساب بتاعك بضغطة لكل زبون.',
              'Close the day, then send each customer a new time or an apology on WhatsApp.',
            )}
          </p>
        </div>
      </div>

      {/* 1) اليوم والمكان */}
      <Card>
        <CardBody className="space-y-4">
          <div className="flex items-center gap-2.5">
            {stepBadge(1)}
            <p className="font-semibold text-espresso">{L('اليوم والمكان', 'Day and scope')}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-[auto_1fr] sm:items-center">
            <input
              type="date"
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                setSel(new Set());
              }}
              className="min-h-11 rounded-btn border border-bark/20 bg-white px-3 font-latin text-espresso"
            />
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={120}
              placeholder={L('السبب (بيتسجل عندك بس): تعب، ظرف عائلي…', 'Reason (only you see it)')}
              className="min-h-11 w-full rounded-btn border border-bark/20 bg-white px-3 text-espresso"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setScope('all')} className={chip(scope === 'all')}>
              {L('المحل كله', 'Whole shop')}
            </button>
            {staff.map((m) => (
              <button key={m.id} type="button" onClick={() => setScope(m.id)} className={chip(scope === m.id)}>
                {m.name}
              </button>
            ))}
          </div>
          {closed ? (
            <div className="flex flex-col gap-3 rounded-card border border-success/30 bg-success/5 p-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm font-medium text-success">
                {L('اليوم مقفول، محدش يقدر يحجز فيه', 'Day is closed — no new bookings')}
                {closures[0]?.reason ? <span className="block text-xs font-normal text-ink-70">{closures[0].reason}</span> : null}
              </p>
              <Button variant="secondary" loading={busy} onClick={() => void reopenDay()}>
                {L('ارجع افتح اليوم', 'Re-open the day')}
              </Button>
            </div>
          ) : (
            <Button variant="danger" className="w-full sm:w-auto" loading={busy} onClick={() => void closeDay()}>
              {L('اقفل اليوم (محدش يحجز فيه)', 'Close the day (no new bookings)')}
            </Button>
          )}
        </CardBody>
      </Card>

      {/* 2) الحجوزات */}
      <Card>
        <CardBody className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              {stepBadge(2)}
              <p className="font-semibold text-espresso">
                {L('الحجوزات المتأثرة', 'Affected bookings')} <span className="font-latin text-ink-70">({active.length})</span>
              </p>
            </div>
            {active.length > 0 ? (
              <Button size="sm" variant="ghost" onClick={() => setSel(sel.size === active.length ? new Set() : new Set(active.map((r) => r.id)))}>
                {sel.size === active.length ? L('إلغاء التحديد', 'Clear') : L('اختار الكل', 'Select all')}
              </Button>
            ) : null}
          </div>
          {rowsQ.isLoading ? <p className="text-sm text-ink-70">…</p> : null}
          {!rowsQ.isLoading && active.length === 0 ? (
            <p className="rounded-card bg-sand/50 p-4 text-center text-sm text-ink-70">{L('مفيش حجوزات مؤكدة في اليوم ده.', 'No active bookings on this day.')}</p>
          ) : null}
          <ul className="space-y-2.5">
            {active.map((r) => {
              const i = info(r);
              const moved = r.move_status === 'pending' && r.move_start_at;
              const on = sel.has(r.id);
              return (
                <li key={r.id} className={cn('rounded-card border bg-white p-3 transition-colors sm:p-4', on ? 'border-gold ring-1 ring-gold' : 'border-default')}>
                  <div className="flex items-start gap-3">
                    <input type="checkbox" className="mt-2 size-5 shrink-0 accent-gold" checked={on} onChange={() => toggle(r.id)} aria-label={i.name} />
                    <span className="shrink-0 rounded-btn bg-sand px-2.5 py-1.5 text-center font-latin text-sm font-bold text-espresso">{i.time}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-espresso">{i.name || '—'}</p>
                      <p className="truncate text-sm text-ink-70">
                        {isAr ? r.service_name_ar : r.service_name_en}
                        {staffName(r.staff_id) ? ` · ${staffName(r.staff_id)}` : ''}
                      </p>
                      {moved ? (
                        <p className="mt-1.5 inline-flex flex-wrap items-center gap-2 rounded-full bg-warning/10 px-2.5 py-1 text-xs font-medium text-warning">
                          {L('مستني رده على: ', 'Waiting for reply: ')}
                          <span className="font-latin">
                            {formatCairoDateShort(r.move_start_at!)} {formatCairoTime(r.move_start_at!, locale)}
                          </span>
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 border-t border-default pt-3">
                    <Button size="sm" variant="secondary" disabled={busy} onClick={() => void runMove([r])}>
                      {L('اقترح معاد جديد', 'Suggest new time')}
                    </Button>
                    <Button size="sm" variant="ghost" className="text-danger" disabled={busy} onClick={() => void runCancel([r])}>
                      {L('إلغاء واعتذار', 'Cancel & apologise')}
                    </Button>
                    {moved ? (
                      <Button size="sm" variant="ghost" disabled={busy} onClick={() => void undoMove(r.id)}>
                        {L('سحب الاقتراح', 'Withdraw')}
                      </Button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </CardBody>
      </Card>

      {chosen.length > 0 ? (
        <div className="fixed inset-x-3 bottom-20 z-20 mx-auto flex max-w-3xl flex-col gap-2 rounded-card border border-gold bg-cream p-3 shadow-xl sm:flex-row lg:bottom-6">
          <Button className="flex-1" variant="primary" loading={busy} onClick={() => void runMove(chosen)}>
            {L(`اقترح معاد جديد للمحدد (${chosen.length})`, `Suggest new time (${chosen.length})`)}
          </Button>
          <Button className="flex-1" variant="danger" loading={busy} onClick={() => void runCancel(chosen)}>
            {L(`إلغاء المحدد مع اعتذار (${chosen.length})`, `Cancel & apologise (${chosen.length})`)}
          </Button>
        </div>
      ) : null}

      {/* 3) الرسايل */}
      {queue.length > 0 ? (
        <Card>
          <CardBody className="space-y-3">
            <div className="flex items-center gap-2.5">
              {stepBadge(3)}
              <p className="font-semibold text-espresso">
                {L('ابعت الرسايل', 'Send messages')} <span className="font-latin text-ink-70">({queue.length - pending.length}/{queue.length})</span>
              </p>
            </div>
            {next ? (
              <div className="space-y-3 rounded-card border border-gold bg-gold/10 p-3">
                <p className="text-sm font-semibold text-espresso">
                  {next.name} · {next.kind === 'move' ? L('اقتراح معاد', 'New time') : L('اعتذار', 'Apology')}
                </p>
                <p className="whitespace-pre-line rounded-btn bg-white p-3 text-sm text-ink-70">{next.msg}</p>
                <div className="flex flex-wrap gap-2">
                  <Button variant="primary" onClick={sendNext}>
                    {L('ابعت واتساب', 'Send WhatsApp')}
                  </Button>
                  <Button variant="ghost" onClick={() => setQueue((q) => q.map((x) => (x.id === next.id ? { ...x, sent: true } : x)))}>
                    {L('تخطي', 'Skip')}
                  </Button>
                </div>
              </div>
            ) : (
              <p className="rounded-card bg-success/10 p-3 text-center text-sm font-medium text-success">{L('خلصت كل الرسايل ✓', 'All messages sent ✓')}</p>
            )}
            <ul className="divide-y divide-default text-sm">
              {queue.map((q) => (
                <li key={q.id} className={cn('flex items-center justify-between py-1.5', q.sent ? 'text-ink-70' : 'font-medium text-espresso')}>
                  <span>
                    {q.name} <span className="text-xs text-ink-70">· {q.kind === 'move' ? L('معاد جديد', 'new time') : L('اعتذار', 'apology')}</span>
                  </span>
                  <span>{q.sent ? '✓' : '…'}</span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      ) : null}

      {/* اللي اتلغى */}
      {cancelled.length > 0 ? (
        <Card>
          <CardBody className="space-y-2">
            <p className="font-semibold text-espresso">
              {L('اتلغت في اليوم ده', 'Cancelled that day')} <span className="font-latin text-ink-70">({cancelled.length})</span>
            </p>
            <ul className="divide-y divide-default text-sm">
              {cancelled.map((r) => {
                const paid = onlinePaid(r);
                return (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span>
                      <span className="font-latin font-semibold">{formatCairoTime(r.start_at, locale)}</span> · {r.profile?.full_name ?? '—'}
                    </span>
                    {paid ? (
                      <span className="rounded-full bg-warning/10 px-2.5 py-1 text-xs font-medium text-warning">
                        {paid.confirmed
                          ? L(`دفع أونلاين ${paid.amount} ج — رجّعله فلوسه`, `Paid online ${paid.amount} EGP — refund him`)
                          : L(`بعت إيصال ${paid.amount} ج ولسه متأكدش`, `Receipt sent ${paid.amount} EGP, not confirmed`)}
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
            <p className="text-xs text-ink-70">{L('الدفع في المحل مش بيتحسب هنا لأن مفيش فلوس اتدفعت.', 'Pay-at-shop bookings need no refund.')}</p>
          </CardBody>
        </Card>
      ) : null}

      {/* نص الرسايل */}
      <Card>
        <CardBody className="space-y-3">
          <button type="button" className="flex w-full items-center justify-between text-start font-semibold text-espresso" onClick={() => setShowMsgs((v) => !v)}>
            <span>{L('نص الرسايل (تقدر تعدله)', 'Message text (editable)')}</span>
            <span aria-hidden>{showMsgs ? '▲' : '▼'}</span>
          </button>
          {showMsgs ? (
            <div className="space-y-3">
              <p className="text-xs text-ink-70">
                {L('المتغيرات: {name} {date} {time} {newdate} {newtime} {link} {book}', 'Variables: {name} {date} {time} {newdate} {newtime} {link} {book}')}
              </p>
              <label className="block text-sm font-medium">{L('رسالة اقتراح معاد جديد', 'New-time message')}</label>
              <textarea
                rows={6}
                value={tplMove}
                onChange={(e) => {
                  setTplMove(e.target.value);
                  save('tito_em_move', e.target.value);
                }}
                className="w-full rounded-btn border border-bark/20 bg-white p-3 text-sm"
              />
              <label className="block text-sm font-medium">{L('رسالة الإلغاء والاعتذار', 'Cancellation message')}</label>
              <textarea
                rows={5}
                value={tplCancel}
                onChange={(e) => {
                  setTplCancel(e.target.value);
                  save('tito_em_cancel', e.target.value);
                }}
                className="w-full rounded-btn border border-bark/20 bg-white p-3 text-sm"
              />
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setTplMove(isAr ? DEFAULT_MOVE_AR : DEFAULT_MOVE_EN);
                  setTplCancel(isAr ? DEFAULT_CANCEL_AR : DEFAULT_CANCEL_EN);
                  save('tito_em_move', '');
                  save('tito_em_cancel', '');
                }}
              >
                {L('رجّع النص الأصلي', 'Reset text')}
              </Button>
            </div>
          ) : null}
        </CardBody>
      </Card>
    </div>
  );
}
