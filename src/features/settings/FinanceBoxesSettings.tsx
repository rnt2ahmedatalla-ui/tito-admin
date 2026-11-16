import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { mapError } from '@/lib/errors';
import {
  sanitizeBoxes,
  untypedDb,
  useFinanceBoxes,
  type FinanceBox,
} from '@/features/payments/useFinanceBoxes';

const MAX_BOXES = 12;

type Row = { id: string; name: string; pct: string };

function newId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `box-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function toRows(boxes: FinanceBox[]): Row[] {
  return boxes.map((b) => ({ id: b.id, name: b.name, pct: String(b.pct) }));
}

export function FinanceBoxesSettings() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const boxesQuery = useFinanceBoxes();
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    if (boxesQuery.data) setRows(toRows(boxesQuery.data));
  }, [boxesQuery.data]);

  const pctSum = rows.reduce((sum, r) => sum + (Number(r.pct) || 0), 0);
  const remainder = Math.round((100 - pctSum) * 100) / 100;
  const over = pctSum > 100.0001;
  const invalidRow = rows.some((r) => {
    const n = Number(r.pct);
    return !r.name.trim() || r.pct.trim() === '' || !Number.isFinite(n) || n < 0 || n > 100;
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const boxes = sanitizeBoxes(
        rows.map((r) => ({ id: r.id, name: r.name, pct: Number(r.pct) })),
      );
      const { error } = await untypedDb
        .from('admin_finance_boxes')
        .upsert({ id: 1, boxes, updated_at: new Date().toISOString() });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['finance-boxes'] });
      toast.success(t('settings.boxesSaved'));
    },
    onError: (e) => toast.error(mapError(e, t)),
  });

  const updateRow = (id: string, patch: Partial<Row>) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  return (
    <Card>
      <CardHeader>
        <h2 className="font-semibold">{t('settings.financeBoxes')}</h2>
        <p className="mt-1 text-sm text-ink-70">{t('settings.financeBoxesHint')}</p>
      </CardHeader>
      <CardBody className="grid gap-3">
        {boxesQuery.isLoading ? (
          <Skeleton className="h-24" />
        ) : boxesQuery.isError ? (
          <p className="rounded-btn bg-sand/50 p-3 text-sm text-ink">{t('settings.boxesSetupNeeded')}</p>
        ) : (
          <>
            {rows.length === 0 ? (
              <p className="text-sm text-ink-70">{t('settings.boxesNone')}</p>
            ) : null}

            {rows.map((r, i) => (
              <div key={r.id} className="flex items-end gap-2">
                <div className="min-w-0 flex-1">
                  <Input
                    id={`box-name-${r.id}`}
                    label={`${t('settings.boxName')} ${i + 1}`}
                    value={r.name}
                    maxLength={30}
                    onChange={(e) => updateRow(r.id, { name: e.target.value })}
                  />
                </div>
                <div className="w-24 shrink-0">
                  <Input
                    id={`box-pct-${r.id}`}
                    label={t('settings.boxPct')}
                    type="number"
                    inputMode="decimal"
                    min={0}
                    max={100}
                    step="0.5"
                    value={r.pct}
                    onChange={(e) => updateRow(r.id, { pct: e.target.value })}
                  />
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={t('settings.removeBox')}
                  onClick={() => setRows((prev) => prev.filter((x) => x.id !== r.id))}
                >
                  <Trash2 className="size-4" aria-hidden />
                </Button>
              </div>
            ))}

            <div>
              <Button
                variant="secondary"
                size="sm"
                disabled={rows.length >= MAX_BOXES}
                onClick={() => setRows((prev) => [...prev, { id: newId(), name: '', pct: '' }])}
              >
                <Plus className="size-4" aria-hidden />
                {t('settings.addBox')}
              </Button>
            </div>

            <div className="rounded-btn bg-sand/40 p-3 text-sm">
              <p className="text-ink-70">
                {t('settings.boxesSum')}: <span className="font-latin font-semibold text-espresso">{pctSum}%</span>
              </p>
              {over ? (
                <p className="mt-1 text-danger" role="alert">{t('settings.boxesOver100')}</p>
              ) : (
                <p className="mt-1 text-ink-70">
                  {t('payments.boxRemainder')}: <span className="font-latin font-semibold text-espresso">{remainder}%</span>
                </p>
              )}
            </div>

            <Button
              variant="primary"
              onClick={() => saveMutation.mutate()}
              loading={saveMutation.isPending}
              disabled={over || invalidRow}
            >
              {t('app.save')}
            </Button>
          </>
        )}
      </CardBody>
    </Card>
  );
}
