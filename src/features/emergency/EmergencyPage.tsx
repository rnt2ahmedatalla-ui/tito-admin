import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardBody } from '@/components/ui/Card';
import { useStaff } from '@/features/staff/StaffPage';
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
  payment: { status: string | null } | Array<{ status: string | null }> | null;
};

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
  const [closed, setClosed] = useState(false);
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
          'id, start_at, end_at, service_id, staff_id, status, move_status, move_start_at, price_egp, service_name_ar, service_name_en, profile:profiles!bookings_user_id_fkey(full_name, phone), payment:payments(status)',
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
  const payStatus = (r: Row): string | null => {
    const p = Array.isArray(r.payment) ? r.payment[0] : r.payment;
    return p?.status ?? null;
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
      setClosed(true);
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
      const res = r.staff_id
        ? await rpcUntyped('get_available_slots_staff', { p_service_id: r.service_id, p_date: day, p_staff_id: r.staff_id })
        : await rpcUntyped('get_available_slots', { p_service_id: r.service_id, p_date: day });
      if (res.error) continue;
      const starts = ((res.data as Array<{ start_at: string }> | null) ?? [])
        .map((x) => x.start_at)
        .filter(Boolean)
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

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <TriangleAlert className="size-6 text-danger" aria-hidden />
        <h1 className="text-xl font-bold text-espresso">{L('ظرف طارئ', 'Emergency')}</h1>
      </div>
      <p className="text-sm text-ink-70">
        {L(
          'لو حصل ظرف ومش هتقدر تشتغل: اقفل اليوم، وبعدين ابعت لكل زبون اقتراح معاد جديد أو اعتذار. الرسايل بتتبعت من الواتساب بتاعك بضغطة لكل زبون.',
          'If something comes up: close the day, then send each customer a new-time suggestion or an apology via WhatsApp.',
        )}
      </p>

      <Card>
        <CardBody className="space-y-3">
          <p className="font-semibold text-espresso">{L('1) اليوم والمكان', '1) Day and scope')}</p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                setSel(new Set());
                setClosed(false);
              }}
              className="min-h-11 rounded-btn border border-bark/20 bg-white px-3 font-latin text-espresso"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setScope('all');
                setClosed(false);
              }}
              className={cn('rounded-full border px-3 py-1.5 text-sm', scope === 'all' ? 'border-gold bg-gold/15 font-semibold' : 'border-bark/20 bg-white')}
            >
              {L('المحل كله', 'Whole shop')}
            </button>
            {staff.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => {
                  setScope(m.id);
                  setClosed(false);
                }}
                className={cn('rounded-full border px-3 py-1.5 text-sm', scope === m.id ? 'border-gold bg-gold/15 font-semibold' : 'border-bark/20 bg-white')}
              >
                {m.name}
              </button>
            ))}
          </div>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={120}
            placeholder={L('السبب (يتسجل عندك بس): تعب، ظرف عائلي…', 'Reason (only you see it)')}
            className="min-h-11 w-full rounded-btn border border-bark/20 bg-white px-3 text-espresso"
          />
          <Button variant={closed ? 'secondary' : 'danger'} loading={busy} disabled={closed} onClick={() => void closeDay()}>
            {closed ? L('اليوم مقفول ✓', 'Day closed ✓') : L('اقفل اليوم (محدش يحجز فيه)', 'Close the day (no new bookings)')}
          </Button>
        </CardBody>
      </Card>

      <Card>
        <CardBody className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold text-espresso">
              {L('2) الحجوزات المتأثرة', '2) Affected bookings')} ({active.length})
            </p>
            {active.length > 0 ? (
              <Button size="sm" variant="ghost" onClick={() => setSel(sel.size === active.length ? new Set() : new Set(active.map((r) => r.id)))}>
                {sel.size === active.length ? L('إلغاء التحديد', 'Clear') : L('اختار الكل', 'Select all')}
              </Button>
            ) : null}
          </div>
          {rowsQ.isLoading ? <p className="text-sm text-ink-70">…</p> : null}
          {!rowsQ.isLoading && active.length === 0 ? (
            <p className="text-sm text-ink-70">{L('مفيش حجوزات مؤكدة في اليوم ده.', 'No active bookings on this day.')}</p>
          ) : null}
          <ul className="space-y-2">
            {active.map((r) => {
              const i = info(r);
              const moved = r.move_status === 'pending' && r.move_start_at;
              return (
                <li key={r.id} className="flex items-start gap-3 rounded-card border border-default bg-white p-3">
                  <input type="checkbox" className="mt-1 size-5 accent-gold" checked={sel.has(r.id)} onChange={() => toggle(r.id)} aria-label={i.name} />
                  <div className="min-w-0 flex-1 text-sm">
                    <p className="font-semibold text-espresso">
                      <span className="font-latin">{i.time}</span> · {i.name || '—'}
                    </p>
                    <p className="text-ink-70">
                      {isAr ? r.service_name_ar : r.service_name_en}
                      {staffName(r.staff_id) ? ` · ${staffName(r.staff_id)}` : ''}
                    </p>
                    {moved ? (
                      <p className="mt-1 text-xs font-medium text-warning">
                        {L('مستني رده على معاد جديد: ', 'Waiting for reply: ')}
                        {formatCairoDateShort(r.move_start_at!)} {formatCairoTime(r.move_start_at!, locale)}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 flex-col gap-1">
                    <Button size="sm" variant="secondary" disabled={busy} onClick={() => void runMove([r])}>
                      {L('معاد جديد', 'Move')}
                    </Button>
                    <Button size="sm" variant="ghost" disabled={busy} onClick={() => void runCancel([r])}>
                      {L('إلغاء', 'Cancel')}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
          {chosen.length > 0 ? (
            <div className="sticky bottom-20 z-10 flex flex-col gap-2 rounded-card border border-gold bg-cream p-3 shadow-lg sm:flex-row">
              <Button className="flex-1" variant="primary" loading={busy} onClick={() => void runMove(chosen)}>
                {L(`اقترح معاد جديد للمحدد (${chosen.length})`, `Suggest new time (${chosen.length})`)}
              </Button>
              <Button className="flex-1" variant="danger" loading={busy} onClick={() => void runCancel(chosen)}>
                {L(`إلغاء المحدد مع اعتذار (${chosen.length})`, `Cancel & apologise (${chosen.length})`)}
              </Button>
            </div>
          ) : null}
        </CardBody>
      </Card>

      {queue.length > 0 ? (
        <Card>
          <CardBody className="space-y-3">
            <p className="font-semibold text-espresso">
              {L('3) ابعت الرسايل', '3) Send messages')} ({queue.length - pending.length}/{queue.length})
            </p>
            {next ? (
              <div className="space-y-2 rounded-card border border-gold bg-gold/10 p-3">
                <p className="text-sm font-semibold text-espresso">
                  {next.name} · {next.kind === 'move' ? L('اقتراح معاد', 'New time') : L('اعتذار', 'Apology')}
                </p>
                <p className="whitespace-pre-line text-sm text-ink-70">{next.msg}</p>
                <div className="flex gap-2">
                  <Button variant="primary" onClick={sendNext}>
                    {L('ابعت واتساب', 'Send WhatsApp')}
                  </Button>
                  <Button variant="ghost" onClick={() => setQueue((q) => q.map((x) => (x.id === next.id ? { ...x, sent: true } : x)))}>
                    {L('تخطي', 'Skip')}
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-sm font-medium text-success">{L('خلصت كل الرسايل ✓', 'All messages sent ✓')}</p>
            )}
            <ul className="space-y-1 text-sm">
              {queue.map((q) => (
                <li key={q.id} className={cn('flex justify-between', q.sent ? 'text-ink-70' : 'font-medium text-espresso')}>
                  <span>{q.name}</span>
                  <span>{q.sent ? '✓' : '…'}</span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      ) : null}

      {cancelled.length > 0 ? (
        <Card>
          <CardBody className="space-y-2">
            <p className="font-semibold text-espresso">{L('اتلغت في اليوم ده', 'Cancelled that day')} ({cancelled.length})</p>
            <ul className="space-y-1 text-sm">
              {cancelled.map((r) => {
                const ps = payStatus(r);
                return (
                  <li key={r.id} className="flex flex-wrap justify-between gap-2">
                    <span>
                      <span className="font-latin">{formatCairoTime(r.start_at, locale)}</span> · {r.profile?.full_name ?? '—'}
                    </span>
                    {ps ? <span className="text-xs font-medium text-warning">{L('راجع رد الفلوس', 'Check refund')} ({ps})</span> : null}
                  </li>
                );
              })}
            </ul>
          </CardBody>
        </Card>
      ) : null}

      <Card>
        <CardBody className="space-y-3">
          <button type="button" className="w-full text-start font-semibold text-espresso" onClick={() => setShowMsgs((v) => !v)}>
            {L('نص الرسايل (تقدر تعدله)', 'Message text (editable)')} {showMsgs ? '▲' : '▼'}
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
