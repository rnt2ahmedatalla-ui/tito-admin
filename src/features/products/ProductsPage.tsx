import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardBody } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { formatEGP } from '@/lib/money';
import { mapError } from '@/lib/errors';

type Product = {
  id: string;
  name_ar: string;
  name_en: string;
  price_egp: number;
  image_path: string | null;
  is_active: boolean;
  sort_order: number;
};

type ProductOrder = {
  id: string;
  product_name_ar: string;
  product_name_en: string;
  price_egp: number;
  status: string;
  created_at: string;
};

export function ProductsPage() {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name_ar: '', name_en: '', price_egp: 0 });
  const [file, setFile] = useState<File | null>(null);

  const productsQuery = useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const { data, error } = await supabase.from('products').select('*').order('sort_order');
      if (error) throw error;
      return (data ?? []) as Product[];
    },
  });

  const ordersQuery = useQuery({
    queryKey: ['product-orders'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('product_orders')
        .select('id, product_name_ar, product_name_en, price_egp, status, created_at')
        .in('status', ['awaiting', 'submitted'])
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as ProductOrder[];
    },
    refetchInterval: 20_000,
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      let image_path: string | null = null;
      if (file) {
        const path = `${Date.now()}-${file.name.replace(/[^\w.-]+/g, '_')}`;
        const { error: upErr } = await supabase.storage.from('product-images').upload(path, file, {
          upsert: false,
        });
        if (upErr) throw upErr;
        image_path = path;
      }
      const maxOrder = (productsQuery.data ?? []).reduce((m, p) => Math.max(m, p.sort_order), 0);
      const { error } = await supabase.from('products').insert({
        name_ar: form.name_ar,
        name_en: form.name_en,
        price_egp: form.price_egp,
        image_path,
        is_active: true,
        sort_order: maxOrder + 1,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['products'] });
      setShowForm(false);
      setForm({ name_ar: '', name_en: '', price_egp: 0 });
      setFile(null);
      toast.success(t('app.save'));
    },
    onError: (e) => toast.error(mapError(e, t)),
  });

  const orderStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.rpc('admin_set_product_order_status', {
        p_order_id: id,
        p_status: status,
      });
      if (error) throw error;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['product-orders'] }),
    onError: (e) => toast.error(mapError(e, t)),
  });

  const locale = i18n.language;
  const publicUrl = (path: string | null) =>
    path
      ? `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/product-images/${path}`
      : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{t('products.title')}</h1>
        <Button variant="primary" size="sm" onClick={() => setShowForm(true)}>
          <Plus className="size-4" />
          {t('products.add')}
        </Button>
      </div>

      {showForm ? (
        <Card>
          <CardBody className="space-y-3">
            <Input label={t('products.nameAr')} value={form.name_ar} onChange={(e) => setForm({ ...form, name_ar: e.target.value })} />
            <Input label={t('products.nameEn')} value={form.name_en} onChange={(e) => setForm({ ...form, name_en: e.target.value })} />
            <Input label={t('products.price')} type="number" value={form.price_egp} onChange={(e) => setForm({ ...form, price_egp: Number(e.target.value) })} />
            <Input label={t('products.image')} type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            <div className="flex gap-2">
              <Button variant="primary" loading={saveMutation.isPending} disabled={!form.name_ar || !form.name_en} onClick={() => void saveMutation.mutate()}>
                {t('app.save')}
              </Button>
              <Button variant="ghost" onClick={() => setShowForm(false)}>{t('app.cancel')}</Button>
            </div>
          </CardBody>
        </Card>
      ) : null}

      {productsQuery.isLoading ? (
        <Skeleton className="h-40" />
      ) : (productsQuery.data ?? []).length === 0 ? (
        <p className="text-sm text-ink-70">{t('products.empty')}</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {(productsQuery.data ?? []).map((p) => (
            <Card key={p.id}>
              <CardBody className="flex gap-3 p-3">
                {publicUrl(p.image_path) ? (
                  <img src={publicUrl(p.image_path)!} alt="" className="size-16 rounded-btn object-cover" />
                ) : (
                  <div className="size-16 rounded-btn bg-sand" />
                )}
                <div className="min-w-0">
                  <p className="font-medium">{locale === 'ar' ? p.name_ar : p.name_en}</p>
                  <p className="font-latin text-sm text-ink-70">{formatEGP(p.price_egp)}</p>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      <h2 className="text-lg font-semibold">{t('products.orders')}</h2>
      {ordersQuery.isLoading ? (
        <Skeleton className="h-24" />
      ) : (ordersQuery.data ?? []).length === 0 ? (
        <p className="text-sm text-ink-70">{t('products.emptyOrders')}</p>
      ) : (
        <div className="space-y-2">
          {(ordersQuery.data ?? []).map((o) => (
            <Card key={o.id}>
              <CardBody className="flex flex-wrap items-center gap-2 p-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{locale === 'ar' ? o.product_name_ar : o.product_name_en}</p>
                  <p className="font-latin text-sm text-ink-70">{formatEGP(o.price_egp)} · {o.status}</p>
                </div>
                {o.status === 'submitted' || o.status === 'awaiting' ? (
                  <>
                    <Button size="sm" variant="primary" onClick={() => void orderStatus.mutate({ id: o.id, status: 'confirmed' })}>
                      {t('products.confirm')}
                    </Button>
                    <Button size="sm" variant="danger" onClick={() => void orderStatus.mutate({ id: o.id, status: 'rejected' })}>
                      {t('products.reject')}
                    </Button>
                  </>
                ) : null}
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
