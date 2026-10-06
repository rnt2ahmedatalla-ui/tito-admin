import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
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
import { cn } from '@/lib/cn';

const serviceSchema = z.object({
  name_ar: z.string().min(1),
  name_en: z.string().min(1),
  price_egp: z.coerce.number().min(0),
  duration_minutes: z.coerce.number().min(0).max(480),
  is_active: z.boolean(),
  is_extra: z.boolean(),
}).refine((value) => (value.is_extra ? value.duration_minutes === 0 : value.duration_minutes >= 5));

function SortableServiceRow({
  service,
  locale,
  isExtra,
  onEdit,
  onToggle,
}: {
  service: Service;
  locale: string;
  isExtra: boolean;
  onEdit: () => void;
  onToggle: () => void;
}) {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: service.id,
  });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={cn(isDragging && 'opacity-80')}
    >
      <Card className={cn(isDragging && 'shadow-lg ring-2 ring-gold/40')}>
        <CardBody className="flex items-center gap-3 p-3">
          <button
            type="button"
            className="shrink-0 cursor-grab touch-none rounded p-1 text-ink-70 hover:bg-sand active:cursor-grabbing"
            aria-label="Reorder"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="size-4" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="font-medium">{locale === 'ar' ? service.name_ar : service.name_en}</p>
            <p className="font-latin text-sm text-ink-70">
              {formatEGP(service.price_egp)}
              {isExtra ? ` · ${t('services.noTime')}` : ` · ${service.duration_minutes} min`}
            </p>
          </div>
          <span className={`text-xs ${service.is_active ? 'text-success' : 'text-ink-70'}`}>
            {service.is_active ? t('services.active') : t('services.hidden')}
          </span>
          <Button variant="ghost" size="sm" onClick={onEdit}>
            {t('app.edit')}
          </Button>
          <Button variant="ghost" size="sm" onClick={onToggle}>
            {service.is_active ? t('services.hidden') : t('services.active')}
          </Button>
        </CardBody>
      </Card>
    </div>
  );
}

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
    is_extra: false,
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

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
            duration_minutes: payload.is_extra ? 0 : payload.duration_minutes,
            is_active: payload.is_active,
            is_extra: payload.is_extra,
          })
          .eq('id', payload.id);
        if (error) throw error;
      } else {
        const maxOrder = services.reduce((m, s) => Math.max(m, s.sort_order), 0);
        const { error } = await supabase.from('services').insert({
          name_ar: payload.name_ar,
          name_en: payload.name_en,
          price_egp: payload.price_egp,
          duration_minutes: payload.is_extra ? 0 : payload.duration_minutes,
          is_active: payload.is_active,
          is_extra: payload.is_extra,
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

  const reorderMutation = useMutation({
    mutationFn: async (ordered: Service[]) => {
      await Promise.all(
        ordered.map((s, i) =>
          supabase.from('services').update({ sort_order: i + 1 }).eq('id', s.id).then(({ error }) => {
            if (error) throw error;
          }),
        ),
      );
    },
    onMutate: async (ordered) => {
      await queryClient.cancelQueries({ queryKey: ['services'] });
      const prev = queryClient.getQueryData<Service[]>(['services']);
      const others = (prev ?? []).filter((s) => s.is_extra !== ordered[0]?.is_extra);
      queryClient.setQueryData<Service[]>(['services'], [...others, ...ordered].sort((a, b) => {
        if (a.is_extra !== b.is_extra) return a.is_extra ? 1 : -1;
        return a.sort_order - b.sort_order;
      }).map((s) => {
        const idx = ordered.findIndex((o) => o.id === s.id);
        return idx >= 0 ? { ...s, sort_order: idx + 1 } : s;
      }));
      return { prev };
    },
    onError: (e, _v, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(['services'], ctx.prev);
      toast.error(mapError(e, t));
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ['services'] }),
  });

  const startEdit = (s: Service) => {
    setEditing(s);
    setForm({
      name_ar: s.name_ar,
      name_en: s.name_en,
      price_egp: s.price_egp,
      duration_minutes: s.duration_minutes,
      is_active: s.is_active,
      is_extra: s.is_extra,
    });
    setShowForm(true);
  };

  const handleSave = () => {
    const parsed = serviceSchema.safeParse(form);
    if (!parsed.success) return;
    void saveMutation.mutate({ ...parsed.data, id: editing?.id });
  };

  const locale = i18n.language;
  const mains = services.filter((s) => !s.is_extra).sort((a, b) => a.sort_order - b.sort_order);
  const extras = services.filter((s) => s.is_extra).sort((a, b) => a.sort_order - b.sort_order);

  const onDragEnd = (list: Service[], isExtra: boolean) => (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = list.findIndex((s) => s.id === active.id);
    const newIndex = list.findIndex((s) => s.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(list, oldIndex, newIndex).map((s, i) => ({ ...s, sort_order: i + 1, is_extra: isExtra }));
    void reorderMutation.mutate(next);
  };

  const openForm = (extra: boolean) => {
    setEditing(null);
    setForm({
      name_ar: '',
      name_en: '',
      price_egp: 0,
      duration_minutes: extra ? 0 : 30,
      is_active: true,
      is_extra: extra,
    });
    setShowForm(true);
  };

  const renderList = (list: Service[], isExtra: boolean) => (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd(list, isExtra)}>
      <SortableContext items={list.map((s) => s.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-2">
          {list.map((s) => (
            <SortableServiceRow
              key={s.id}
              service={s}
              locale={locale}
              isExtra={isExtra}
              onEdit={() => startEdit(s)}
              onToggle={() => void toggleActive.mutate({ id: s.id, active: !s.is_active })}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{t('services.title')}</h1>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" size="sm" onClick={() => openForm(false)}>
            <Plus className="size-4" />
            {t('services.add')}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => openForm(true)}>
            <Plus className="size-4" />
            {t('services.addExtra')}
          </Button>
        </div>
      </div>

      {showForm ? (
        <Card>
          <CardBody className="space-y-3">
            <Input label={t('services.nameAr')} value={form.name_ar} onChange={(e) => setForm({ ...form, name_ar: e.target.value })} />
            <Input label={t('services.nameEn')} value={form.name_en} onChange={(e) => setForm({ ...form, name_en: e.target.value })} />
            <Input label={t('services.price')} type="number" value={form.price_egp} onChange={(e) => setForm({ ...form, price_egp: Number(e.target.value) })} />
            {form.is_extra ? (
              <p className="text-sm text-ink-70">{t('services.extraHint')}</p>
            ) : (
              <Input label={t('services.duration')} type="number" value={form.duration_minutes} onChange={(e) => setForm({ ...form, duration_minutes: Number(e.target.value) })} />
            )}
            {editing ? <p className="text-sm text-warning">{t('services.priceWarning')}</p> : null}
            <div className="flex gap-2">
              <Button variant="primary" onClick={handleSave} loading={saveMutation.isPending}>{t('app.save')}</Button>
              <Button variant="ghost" onClick={() => setShowForm(false)}>{t('app.cancel')}</Button>
            </div>
          </CardBody>
        </Card>
      ) : null}

      {isLoading ? <Skeleton className="h-48" /> : renderList(mains, false)}

      <h2 className="pt-2 text-lg font-semibold">{t('services.extrasTitle')}</h2>
      <p className="text-sm text-ink-70">{t('services.extraHint')}</p>
      {!isLoading && extras.length === 0 ? (
        <p className="text-sm text-ink-70">{t('services.extrasEmpty')}</p>
      ) : null}
      {!isLoading && extras.length > 0 ? renderList(extras, true) : null}
    </div>
  );
}
