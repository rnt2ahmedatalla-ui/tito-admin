import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Star, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardBody } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { mapError } from '@/lib/errors';
import { cn } from '@/lib/cn';

type ReviewRow = {
  id: string;
  rating: number;
  comment: string | null;
  display_name: string | null;
  created_at: string;
};

export function ReviewsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(true);
  const [form, setForm] = useState({ display_name: '', rating: 5, comment: '' });

  const list = useQuery({
    queryKey: ['admin-reviews'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('reviews')
        .select('id, rating, comment, display_name, created_at')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as ReviewRow[];
    },
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('admin_add_review', {
        p_rating: form.rating,
        p_comment: form.comment.trim(),
        p_display_name: form.display_name.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-reviews'] });
      setForm({ display_name: '', rating: 5, comment: '' });
      toast.success(t('reviews.added'));
    },
    onError: (e) => toast.error(mapError(e, t)),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('admin_delete_review', { p_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-reviews'] });
      toast.success(t('app.delete'));
    },
    onError: (e) => toast.error(mapError(e, t)),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t('reviews.title')}</h1>
          <p className="mt-1 text-sm text-ink-70">{t('reviews.hint')}</p>
        </div>
        <Button variant="primary" size="sm" onClick={() => setShowForm(true)}>
          <Plus className="size-4" />
          {t('reviews.add')}
        </Button>
      </div>

      {showForm ? (
        <Card>
          <CardBody className="space-y-3">
            <Input
              label={t('reviews.name')}
              value={form.display_name}
              onChange={(e) => setForm({ ...form, display_name: e.target.value })}
              placeholder={t('reviews.namePlaceholder')}
            />
            <div>
              <p className="mb-2 text-sm font-medium text-espresso">{t('reviews.rating')}</p>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setForm({ ...form, rating: n })}
                    className="p-1"
                    aria-label={`${n}`}
                  >
                    <Star
                      className={cn(
                        'size-7',
                        n <= form.rating ? 'fill-gold text-gold' : 'text-bark/30',
                      )}
                    />
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-espresso" htmlFor="review-comment">
                {t('reviews.comment')}
              </label>
              <textarea
                id="review-comment"
                className="min-h-24 w-full rounded-btn border border-bark/20 bg-white px-3 py-2 text-sm"
                maxLength={400}
                value={form.comment}
                onChange={(e) => setForm({ ...form, comment: e.target.value })}
                placeholder={t('reviews.commentPlaceholder')}
              />
            </div>
            <div className="flex gap-2">
              <Button
                variant="primary"
                loading={addMutation.isPending}
                disabled={form.comment.trim().length < 3}
                onClick={() => void addMutation.mutate()}
              >
                {t('app.save')}
              </Button>
              <Button variant="ghost" onClick={() => setShowForm(false)}>
                {t('app.cancel')}
              </Button>
            </div>
          </CardBody>
        </Card>
      ) : null}

      {list.isLoading ? (
        <Skeleton className="h-40" />
      ) : (list.data ?? []).length === 0 ? (
        <p className="text-sm text-ink-70">{t('reviews.empty')}</p>
      ) : (
        <div className="space-y-2">
          {(list.data ?? []).map((r) => (
            <Card key={r.id}>
              <CardBody className="flex items-start justify-between gap-3 p-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="flex gap-0.5">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star
                          key={i}
                          className={cn(
                            'size-3.5',
                            i < r.rating ? 'fill-gold text-gold' : 'text-bark/25',
                          )}
                        />
                      ))}
                    </div>
                    <span className="text-sm font-medium">{r.display_name || t('reviews.guest')}</span>
                  </div>
                  {r.comment ? <p className="mt-1 text-sm text-ink">{r.comment}</p> : null}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void deleteMutation.mutate(r.id)}
                  loading={deleteMutation.isPending}
                >
                  <Trash2 className="size-4 text-danger" />
                </Button>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
