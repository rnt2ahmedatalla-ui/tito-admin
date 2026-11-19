import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardBody } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { supabase } from '@/lib/supabase';
import { mapError } from '@/lib/errors';
import { useStaff } from './StaffPage';

const rpc = supabase.rpc.bind(supabase) as unknown as (
  fn: string,
  args?: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message: string } | null }>;

/** حساب دخول للحلاق: يشوف حجوزاته بس (من غير مالية ولا عملاء ولا إعدادات) */
export function StaffAccessCard() {
  const { i18n, t } = useTranslation();
  const isAr = i18n.language?.startsWith('ar');
  const L = (ar: string, en: string) => (isAr ? ar : en);
  const qc = useQueryClient();
  const staff = (useStaff().data ?? []).filter((m) => !m.is_owner);
  const [emails, setEmails] = useState<Record<string, string>>({});

  const linked = useQuery({
    queryKey: ['staff-emails'],
    retry: false,
    queryFn: async (): Promise<Record<string, string>> => {
      const { data, error } = await rpc('admin_staff_emails');
      if (error) throw new Error(error.message);
      const map: Record<string, string> = {};
      ((data ?? []) as Array<{ staff_id: string; email: string }>).forEach((r) => (map[r.staff_id] = r.email));
      return map;
    },
  });

  const link = useMutation({
    mutationFn: async (v: { id: string; email: string }) => {
      const { data, error } = await rpc('admin_link_staff_user', { p_staff: v.id, p_email: v.email });
      if (error) throw new Error(error.message);
      if (!data) throw new Error('NO_USER');
    },
    onSuccess: () => {
      toast.success(L('اتربط الحساب. الحلاق يقدر يدخل دلوقتي.', 'Account linked. The barber can sign in now.'));
      void qc.invalidateQueries({ queryKey: ['staff-emails'] });
    },
    onError: (e) => {
      const m = (e as Error).message;
      toast.error(m.includes('NO_USER') ? L('مفيش حساب بالإيميل ده. اعمله من Supabase الأول (الشرح تحت).', 'No account with that email. Create it in Supabase first.') : m.includes('IS_ADMIN') ? L('الإيميل ده حساب أدمن.', 'That email is an admin account.') : mapError(e, t));
    },
  });
  const unlink = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await rpc('admin_unlink_staff_user', { p_staff: id });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['staff-emails'] }),
    onError: (e) => toast.error(mapError(e, t)),
  });

  if (linked.isError || staff.length === 0) return null;
  return (
    <Card>
      <CardBody className="space-y-3 p-4">
        <div className="flex items-center gap-2">
          <KeyRound className="size-5 shrink-0 text-gold" aria-hidden />
          <h2 className="text-lg font-bold text-espresso">{L('دخول الحلاقين', 'Barber sign-in')}</h2>
        </div>
        <p className="text-sm text-ink-70">
          {L(
            'الحلاق اللي تربطه بحساب بيدخل نفس لوحة الأدمن بس يشوف جدول حجوزاته بس: من غير مالية ولا أسعار ولا أرقام عملاء ولا أي إعدادات.',
            'A linked barber sees only his own schedule: no finance, prices, phone numbers or settings.',
          )}
        </p>
        <ol className="list-decimal space-y-1 ps-5 text-xs text-ink-70">
          <li>{L('افتح Supabase ← Authentication ← Users ← Add user.', 'Supabase → Authentication → Users → Add user.')}</li>
          <li>{L('اكتب إيميل وباسورد للحلاق وفعّل "Auto Confirm User".', 'Enter his email and a password, enable "Auto Confirm User".')}</li>
          <li>{L('اكتب نفس الإيميل هنا واضغط ربط، وادّي الحلاق الإيميل والباسورد.', 'Enter the same email here and tap Link, then give him the credentials.')}</li>
        </ol>
        {staff.map((m) => {
          const email = linked.data?.[m.id];
          return (
            <div key={m.id} className="space-y-2 rounded-btn border border-default p-3">
              <p className="font-semibold text-espresso">{m.name}</p>
              {email ? (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="min-w-0 truncate font-latin text-sm text-ink-70" dir="ltr">{email}</span>
                  <Button size="sm" variant="ghost" className="text-danger" loading={unlink.isPending} onClick={() => unlink.mutate(m.id)}>
                    {L('فك الربط', 'Unlink')}
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                  <div className="min-w-0 flex-1">
                    <Input
                      label={L('إيميل الحلاق', 'Barber email')}
                      dir="ltr"
                      inputMode="email"
                      value={emails[m.id] ?? ''}
                      onChange={(e) => setEmails((p) => ({ ...p, [m.id]: e.target.value }))}
                    />
                  </div>
                  <Button
                    variant="primary"
                    loading={link.isPending}
                    disabled={!(emails[m.id] ?? '').includes('@')}
                    onClick={() => link.mutate({ id: m.id, email: emails[m.id] ?? '' })}
                  >
                    {L('ربط', 'Link')}
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </CardBody>
    </Card>
  );
}
