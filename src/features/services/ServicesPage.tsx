import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { GripVertical, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import type { Service } from '@/types/database';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardBody } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { formatEGP } from '@/lib/money';
import { mapError } from '@/lib/errors';

const serviceSchema = z.object({
  name_ar: z.string().min(1),
  name_en: z.string().min(1),
  price_egp: z.coerce.number().min(0),
  duration_minutes: z.coerce.number().min(5).max(480),
  is_active: z.boolean(),
});

export function ServicesPage() {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Service | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name_ar: '',
    name_en: '',
    price_egp: 0,
    duration_minutes: 30,
    is_active: true,
  });

  const { data: services = [], isLoading } = useQuery({
    queryKey: ['services'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('services')
        .select('*')
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return data as Service[];
    },
    staleTime: 60_000,
  });

  const saveMutation = useMutation({
    mutationFn: async (payload: z.infer<typeof serviceSchema> & { id?: string }) => {
      if (payload.id) {
        const { error } = await supabase
          .from('services')
          .update({
            name_ar: payload.name_ar,
            name_en: payload.name_en,
            price_egp: payload.price_egp,
            duration_minutes: payload.duration_minutes,
            is_active: payload.is_active,
          })
          .eq('id', payload.id);
        if (error) throw error;
      } else {
        const maxOrder = services.reduce((m, s) => Math.max(m, s.sort_order), 0);
        const { error } = await supabase.from('services').insert({
          name_ar: payload.name_ar,
          name_en: payload.name_en,
          price_egp: payload.price_egp,
          duration_minutes: payload.duration_minutes,
          is_active: payload.is_active,
          sort_order: maxOrder + 1,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['services'] });
      setShowForm(false);
      setEditing(null);
      toast.success(t('app.save'));
    },
    onError: (e) => toast.error(mapError(e, t)),
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.from('services').update({ is_active: active }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['services'] }),
    onError: (e) => toast.error(mapError(e, t)),
  });

  const startEdit = (s: Service) => {
    setEditing(s);
    setForm({
      name_ar: s.name_ar,
      name_en: s.name_en,
      price_egp: s.price_egp,
      duration_minutes: s.duration_minutes,
      is_active: s.is_active,
    });
    setShowForm(true);
  };

  const handleSave = () => {
    const parsed = serviceSchema.safeParse(form);
    if (!parsed.success) return;
    void saveMutation.mutate({ ...parsed.data, id: editing?.id });
  };

  const locale = i18n.language;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{t('services.title')}</h1>
        <Button variant="primary" size="sm" onClick={() => { setEditing(null); setShowForm(true); }}>
          <Plus className="size-4" />
          {t('services.add')}
        </Button>
      </div>

      {showForm ? (
        <Card>
          <CardBody className="space-y-3">
            <Input label={t('services.nameAr')} value={form.name_ar} onChange={(e) => setForm({ ...form, name_ar: e.target.value })} />
            <Input label={t('services.nameEn')} value={form.name_en} onChange={(e) => setForm({ ...form, name_en: e.target.value })} />
            <Input label={t('services.price')} type="number" value={form.price_egp} onChange={(e) => setForm({ ...form, price_egp: Number(e.target.value) })} />
            <Input label={t('services.duration')} type="number" value={form.duration_minutes} onChange={(e) => setForm({ ...form, duration_minutes: Number(e.target.value) })} />
            {editing ? <p className="text-sm text-warning">{t('services.priceWarning')}</p> : null}
            <div className="flex gap-2">
              <Button variant="primary" onClick={handleSave} loading={saveMutation.isPending}>{t('app.save')}</Button>
              <Button variant="ghost" onClick={() => setShowForm(false)}>{t('app.cancel')}</Button>
            </div>
          </CardBody>
        </Card>
      ) : null}

      {isLoading ? (
        <Skeleton className="h-48" />
      ) : (
        <div className="space-y-2">
          {services.map((s) => (
            <Card key={s.id}>
              <CardBody className="flex items-center gap-3 p-3">
                <GripVertical className="size-4 text-ink-70 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium">{locale === 'ar' ? s.name_ar : s.name_en}</p>
                  <p className="text-sm text-ink-70 font-latin">
                    {formatEGP(s.price_egp)} · {s.duration_minutes} min
                  </p>
                </div>
                <span className={`text-xs ${s.is_active ? 'text-success' : 'text-ink-70'}`}>
                  {s.is_active ? t('services.active') : t('services.hidden')}
                </span>
                <Button variant="ghost" size="sm" onClick={() => startEdit(s)}>{t('app.edit')}</Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void toggleActive.mutate({ id: s.id, active: !s.is_active })}
                >
                  {s.is_active ? t('services.hidden') : t('services.active')}
                </Button>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
