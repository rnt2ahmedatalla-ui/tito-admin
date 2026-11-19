import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Card, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { mapError } from '@/lib/errors';
import { untypedDb } from '@/features/payments/useFinanceBoxes';
import { supabase } from '@/lib/supabase';

type Settings = {
  enabled: boolean;
  points_per_100_egp: number;
  egp_per_point: number;
  min_redeem_points: number;
  max_redeem_percent: number;
};
type Balance = { user_id: string; full_name: string | null; phone: string | null; points: number };

const rpc = supabase.rpc.bind(supabase) as unknown as (
  fn: string,
  args?: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message: string } | null }>;

export function LoyaltyPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();

  const settingsQ = useQuery({
    queryKey: ['loyalty-settings-admin'],
    queryFn: async (): Promise<Settings | null> => {
      const { data, error } = await untypedDb.from('loyalty_settings').select('*').eq('id', 1).maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const r = data as Record<string, unknown>;
      return {
        enabled: !!r.enabled,
        points_per_100_egp: Number(r.points_per_100_egp),
        egp_per_point: Number(r.egp_per_point),
        min_redeem_points: Number(r.min_redeem_points),
        max_redeem_percent: Number(r.max_redeem_percent),
      };
    },
    retry: false,
  });

  const [enabled, setEnabled] = useState(false);
  const [per100, setPer100] = useState('10');
  const [egpPer, setEgpPer] = useState('1');
  const [minPts, setMinPts] = useState('50');
  const [maxPct, setMaxPct] = useState('50');
  useEffect(() => {
    const s = settingsQ.data;
    if (!s) return;
    setEnabled(s.enabled);
    setPer100(String(s.points_per_100_egp));
    setEgpPer(String(s.egp_per_point));
    setMinPts(String(s.min_redeem_points));
    setMaxPct(String(s.max_redeem_percent));
  }, [settingsQ.data]);

  const save = useMutation({
    mutationFn: async () => {
      const p = Number(per100);
      const e = Number(egpPer);
      const m = Math.round(Number(minPts));
      const x = Math.round(Number(maxPct));
      if (!(p >= 0) || !(e > 0) || !(m >= 1) || !(x >= 1 && x <= 100)) throw new Error('BAD');
      const { error } = await untypedDb
        .from('loyalty_settings')
        .update({ enabled, points_per_100_egp: p, egp_per_point: e, min_redeem_points: m, max_redeem_percent: x })
        .eq('id', 1);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('اتحفظت إعدادات النقاط');
      void qc.invalidateQueries({ queryKey: ['loyalty-settings-admin'] });
    },
    onError: (e) => toast.error((e as Error).message === 'BAD' ? 'راجع الأرقام (النسبة من 1 لـ 100، والقيم أكبر من صفر)' : mapError(e, t)),
  });

  const balancesQ = useQuery({
    queryKey: ['loyalty-balances'],
    queryFn: async (): Promise<Balance[]> => {
      const { data, error } = await rpc('admin_loyalty_balances');
      if (error) throw error;
      return (data ?? []) as Balance[];
    },
    retry: false,
  });

  const [adjUser, setAdjUser] = useState('');
  const [adjPts, setAdjPts] = useState('');
  const [adjNote, setAdjNote] = useState('');
  const adjust = useMutation({
    mutationFn: async () => {
      const n = Math.round(Number(adjPts));
      if (!adjUser || !n) throw new Error('BAD');
      const { error } = await rpc('admin_loyalty_adjust', { p_user: adjUser, p_points: n, p_note: adjNote });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('اتعدّل الرصيد');
      setAdjPts('');
      setAdjNote('');
      void qc.invalidateQueries({ queryKey: ['loyalty-balances'] });
    },
    onError: (e) => toast.error((e as Error).message === 'BAD' ? 'اختار العميل واكتب عدد النقاط' : mapError(e, t)),
  });

  if (settingsQ.isError) {
    return (
      <div className="space-y-3">
        <h1 className="text-xl font-bold text-espresso">نقاط الولاء</h1>
        <p className="rounded-btn bg-sand/50 p-3 text-sm">محتاج تشغّل ملف loyalty.sql في Supabase الأول.</p>
      </div>
    );
  }

  const balances = balancesQ.data ?? [];
  const ex = Math.floor((200 * (Number(per100) || 0)) / 100);

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold text-espresso">نقاط الولاء</h1>

      <Card>
        <CardBody className="space-y-3 p-4">
          <label className="flex items-center justify-between gap-3">
            <span className="font-semibold text-espresso">تشغيل النقاط</span>
            <input type="checkbox" className="size-5 accent-[#c9953f]" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          </label>
          <Input label="كام نقطة على كل 100 جنيه (بعد اكتمال الحجز)" inputMode="decimal" value={per100} onChange={(e) => setPer100(e.target.value)} />
          <Input label="قيمة النقطة الواحدة بالجنيه (وقت الاستبدال)" inputMode="decimal" value={egpPer} onChange={(e) => setEgpPer(e.target.value)} />
          <Input label="أقل عدد نقاط للاستبدال" inputMode="numeric" value={minPts} onChange={(e) => setMinPts(e.target.value)} />
          <Input label="أقصى نسبة من سعر الحجز تتغطى بالنقاط (%)" inputMode="numeric" value={maxPct} onChange={(e) => setMaxPct(e.target.value)} />
          <p className="text-xs text-ink-70">
            مثال: حجز بـ 200 جنيه بيدّي العميل {ex} نقطة. النقاط بتتحسب على السعر النهائي بعد الخصم، ومبتتحسبش على حجوزات العملاء بدون حساب.
          </p>
          <Button className="w-full" loading={save.isPending} onClick={() => save.mutate()}>حفظ</Button>
        </CardBody>
      </Card>

      <Card>
        <CardBody className="space-y-3 p-4">
          <p className="font-semibold text-espresso">أرصدة العملاء</p>
          {balances.length === 0 ? (
            <p className="text-sm text-ink-70">لسه مفيش نقاط متسجلة.</p>
          ) : (
            <ul className="divide-y divide-bark/10 text-sm">
              {balances.map((b) => (
                <li key={b.user_id} className="flex items-center justify-between gap-2 py-2">
                  <span className="min-w-0 truncate">{b.full_name || 'عميل'} <span className="font-latin text-xs text-ink-70">{b.phone ?? ''}</span></span>
                  <span className="font-latin font-bold">{b.points}</span>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardBody className="space-y-3 p-4">
          <p className="font-semibold text-espresso">تعديل رصيد يدوي (هدية أو تصحيح)</p>
          <select
            value={adjUser}
            onChange={(e) => setAdjUser(e.target.value)}
            className="min-h-11 w-full rounded-btn border border-bark/20 bg-white px-3 text-sm"
          >
            <option value="">— اختار العميل —</option>
            {balances.map((b) => (
              <option key={b.user_id} value={b.user_id}>{b.full_name || 'عميل'} ({b.points})</option>
            ))}
          </select>
          <Input label="عدد النقاط (سالب لو عايز تخصم)" inputMode="numeric" value={adjPts} onChange={(e) => setAdjPts(e.target.value)} />
          <Input label="ملاحظة (اختياري)" value={adjNote} onChange={(e) => setAdjNote(e.target.value)} />
          <Button className="w-full" variant="secondary" loading={adjust.isPending} onClick={() => adjust.mutate()}>تعديل</Button>
          <p className="text-xs text-ink-70">القايمة بتظهر العملاء اللي عندهم حركة نقاط بس. أي عميل جديد هيظهر بعد أول حجز مكتمل.</p>
        </CardBody>
      </Card>
    </div>
  );
}
