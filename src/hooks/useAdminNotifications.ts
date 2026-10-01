import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export type AdminNotification = {
  id: string;
  kind: string;
  title_ar: string;
  title_en: string;
  body_ar: string | null;
  body_en: string | null;
  is_read: boolean;
  created_at: string;
};

export function useAdminNotifications() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['admin-notifications'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('admin_notifications')
        .select('id, kind, title_ar, title_en, body_ar, body_en, is_read, created_at')
        .order('created_at', { ascending: false })
        .limit(40);
      if (error) throw error;
      return (data ?? []) as AdminNotification[];
    },
    refetchInterval: 15_000,
  });

  const unread = (query.data ?? []).filter((n) => !n.is_read).length;

  const markAll = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('admin_mark_notifications_read');
      if (error) throw error;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['admin-notifications'] }),
  });

  return { ...query, unread, markAll };
}
