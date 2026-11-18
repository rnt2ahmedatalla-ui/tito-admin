import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { Card, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { mapError } from '@/lib/errors';
import { formatEGP } from '@/lib/money';
import { cn } from '@/lib/cn';

// جدول الكوبونات مش في تعريفات الأنواع الحالية، فبنتعامل معاه بشكل عام
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

type Coupon = {
  id: string;
  code: string;
  percent_off: number | null;
  amount_off_egp: number | null;
  active: boolean;
  valid_until: string | null;
  note: string | null;
};

export function CouponsPage() {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language?.startsWith('ar');
  const queryClient = useQueryClient();

  const [code, setCode] = useState('');
  const [kind, setKind] = useState<'percent' | 'amount'>('percent');
  const [value, setValue] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [note, setNote] = useState('');

  const couponsQuery = useQuery({
    queryKey: ['coupons'],
    queryFn: async () => {
      const { data, error } = await db
        .from('coupons')
        .select('id, code, percent_off, amount_off_egp, active, valid_until, note')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Coupon[];
    },
    staleTime: 15_000,
  });

  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['coupons'] });

  const createCoupon = useMutation({
    mutationFn: async () => {
      const cleanCode = code.trim().toUpperCase().replace(/\s+/g, '');
      const num = Number(value);
      if (!cleanCode) throw new Error('CODE_REQUIRED');
      if (!num || num <= 0) throw new Error('VALUE_REQUIRED');
      if (kind === 'percent' && num > 100) throw new Error('PERCENT_TOO_HIGH');
      const { error } = await db.from('coupons').insert({
        code: cleanCode,
        percent_off: kind === 'percent' ? Math.round(num) : null,
        amount_off_egp: kind === 'amount' ? num : null,
        valid_until: validUntil ? new Date(`${validUntil}T23:59:59+02:00`).toISOString() : null,
        note: note.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(isAr ? 'اتضاف الكوبون' : 'Coupon added');
      setCode('');
      setValue('');
      setValidUntil('');
      setNote('');
      refresh();
    },
    onError: (e) => {
      const msg = (e as Error).message;
      if (msg === 'CODE_REQUIRED') toast.error(isAr ? 'اكتب كود الكوبون' : 'Enter a coupon code');
      else if (msg === 'VALUE_REQUIRED') toast.error(isAr ? 'اكتب قيمة الخصم' : 'Enter the discount value');
      else if (msg === 'PERCENT_TOO_HIGH') toast.error(isAr ? 'النسبة متتعديش 100%' : 'Percent cannot exceed 100');
      else toast.error(mapError(e, t));
    },
  });

  const toggleCoupon = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await db.from('coupons').update({ active: !active }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: refresh,
    onError: (e) => toast.error(mapError(e, t)),
  });

  const coupons = couponsQuery.data ?? [];

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold text-espresso">{isAr ? 'الكوبونات' : 'Coupons'}</h1>

      <Card>
        <CardBody className="space-y-3 p-4">
          <p className="font-semibold text-espresso">{isAr ? 'كوبون جديد' : 'New coupon'}</p>
          <Input
            label={isAr ? 'كود الكوبون (مثلاً: BACK10)' : 'Coupon code (e.g. BACK10)'}
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          <div className="grid grid-cols-2 gap-2">
            {(['percent', 'amount'] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={cn(
                  'rounded-btn border px-3 py-2 text-sm transition-colors',
                  kind === k ? 'border-gold bg-gold/20 font-semibold' : 'border-bark/20 bg-white text-ink-70',
                )}
              >
                {k === 'percent' ? (isAr ? 'نسبة %' : 'Percent %') : isAr ? 'مبلغ جنيه' : 'Amount EGP'}
              </button>
            ))}
          </div>
          <Input
            label={isAr ? (kind === 'percent' ? 'النسبة (%)' : 'المبلغ (جنيه)') : kind === 'percent' ? 'Percent (%)' : 'Amount (EGP)'}
            type="number"
            min={1}
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
          <Input
            label={isAr ? 'ينتهي في (اختياري)' : 'Expires on (optional)'}
            type="date"
            value={validUntil}
            onChange={(e) => setValidUntil(e.target.value)}
          />
          <Input
            label={isAr ? 'ملاحظة للمحل (اختياري)' : 'Internal note (optional)'}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <div className="flex justify-end">
            <Button loading={createCoupon.isPending} onClick={() => createCoupon.mutate()}>
              {isAr ? 'أضف الكوبون' : 'Add coupon'}
            </Button>
          </div>
        </CardBody>
      </Card>

      <div className="space-y-2">
        {coupons.length === 0 ? (
          <p className="py-4 text-sm text-ink-70">{isAr ? 'مفيش كوبونات لسه' : 'No coupons yet'}</p>
        ) : (
          coupons.map((c) => (
            <Card key={c.id}>
              <CardBody className="flex items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="truncate font-latin font-bold text-espresso">{c.code}</p>
                  <p className="text-sm text-ink-70">
                    {c.percent_off !== null
                      ? `${c.percent_off}%`
                      : formatEGP(Number(c.amount_off_egp ?? 0))}
                    {c.valid_until
                      ? ` · ${isAr ? 'لحد' : 'until'} ${new Date(c.valid_until).toLocaleDateString('en-GB')}`
                      : ''}
                  </p>
                  {c.note ? <p className="truncate text-xs text-ink-70">{c.note}</p> : null}
                </div>
                <Button
                  size="sm"
                  variant={c.active ? 'secondary' : 'primary'}
                  loading={toggleCoupon.isPending}
                  onClick={() => toggleCoupon.mutate({ id: c.id, active: c.active })}
                >
                  {c.active ? (isAr ? 'وقف' : 'Disable') : isAr ? 'فعّل' : 'Enable'}
                </Button>
              </CardBody>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
