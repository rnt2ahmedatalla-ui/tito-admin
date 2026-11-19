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
import { loginMessage, useStaffPhones, waLink } from './staffLogin';

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

  const [users, setUsers] = useState<Record<string, string>>({});
  const [pwds, setPwds] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [fresh, setFresh] = useState<Record<string, { user: string; pass: string }>>({});
  const phones = useStaffPhones().data ?? {};
  const save = useMutation({
    mutationFn: async (v: { id: string; username: string; password: string }) => {
      const { error } = await rpc('admin_set_staff_login', { p_staff: v.id, p_username: v.username, p_password: v.password });
      if (error) throw new Error(error.message);
    },
    onSuccess: (_d, v) => {
      toast.success(L('اتحفظ. اديله اسم المستخدم والباسورد.', 'Saved. Give him the username and password.'));
      setFresh((p) => ({ ...p, [v.id]: { user: v.username.trim().toLowerCase(), pass: v.password } }));
      setPwds((p) => ({ ...p, [v.id]: '' }));
      setEditing(null);
      void qc.invalidateQueries({ queryKey: ['staff-emails'] });
    },
    onError: (e) => {
      const m = (e as Error).message;
      toast.error(
        m.includes('BAD_USERNAME') ? L('اسم المستخدم لازم 3 حروف أو أرقام إنجليزي على الأقل.', 'Username needs at least 3 letters/numbers.')
        : m.includes('BAD_PASSWORD') ? L('الباسورد لازم 6 حروف على الأقل.', 'Password needs at least 6 characters.')
        : m.includes('USERNAME_TAKEN') ? L('اسم المستخدم ده مستخدم، اختار غيره.', 'Username already taken.')
        : mapError(e, t),
      );
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
            'إنت اللي بتحدد اسم المستخدم والباسورد لكل حلاق من هنا. الحلاق بيشوف جدول حجوزاته بس: من غير مالية ولا أسعار ولا أرقام عملاء ولا أي إعدادات.',
            'A linked barber sees only his own schedule: no finance, prices, phone numbers or settings.',
          )}
        </p>
        {staff.map((m) => {
          const email = linked.data?.[m.id];
          return (
            <div key={m.id} className="space-y-2 rounded-btn border border-default p-3">
              <p className="font-semibold text-espresso">{m.name}</p>
              {fresh[m.id] ? (
                <div className="rounded-btn bg-gold/10 p-2 text-sm">
                  <p className="whitespace-pre-line text-ink-70" dir={isAr ? 'rtl' : 'ltr'}>{loginMessage(m.name, fresh[m.id]?.user ?? '', fresh[m.id]?.pass ?? '', isAr)}</p>
                  <Button
                    size="sm"
                    className="mt-2"
                    disabled={!phones[m.id]}
                    onClick={() => {
                      const f = fresh[m.id];
                      const url = f ? waLink(phones[m.id] ?? '', loginMessage(m.name, f.user, f.pass, isAr)) : null;
                      if (url) window.open(url, '_blank', 'noopener');
                    }}
                  >
                    {phones[m.id] ? L('ابعتهاله على واتساب', 'Send on WhatsApp') : L('ضيف رقمه من تعديل الحلاق الأول', 'Add his phone in Edit first')}
                  </Button>
                </div>
              ) : null}
              {email && editing !== m.id ? (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="min-w-0 truncate font-latin text-sm text-ink-70" dir="ltr">
                    {L('اسم المستخدم: ', 'Username: ')}{email.split('@')[0]}
                  </span>
                  <div className="flex gap-1">
                    <Button size="sm" variant="secondary" onClick={() => { setEditing(m.id); setUsers((p) => ({ ...p, [m.id]: email.split('@')[0] ?? '' })); }}>
                      {L('تغيير الاسم/الباسورد', 'Change login')}
                    </Button>
                    <Button size="sm" variant="ghost" className="text-danger" loading={unlink.isPending} onClick={() => unlink.mutate(m.id)}>
                      {L('إيقاف الدخول', 'Disable')}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                  <Input
                    label={L('اسم المستخدم', 'Username')}
                    dir="ltr"
                    autoCapitalize="none"
                    value={users[m.id] ?? ''}
                    onChange={(e) => setUsers((p) => ({ ...p, [m.id]: e.target.value }))}
                  />
                  <Input
                    label={L('الباسورد', 'Password')}
                    dir="ltr"
                    value={pwds[m.id] ?? ''}
                    onChange={(e) => setPwds((p) => ({ ...p, [m.id]: e.target.value }))}
                  />
                  <Button
                    variant="primary"
                    loading={save.isPending}
                    disabled={(users[m.id] ?? '').trim().length < 3 || (pwds[m.id] ?? '').length < 6}
                    onClick={() => save.mutate({ id: m.id, username: users[m.id] ?? '', password: pwds[m.id] ?? '' })}
                  >
                    {L('حفظ', 'Save')}
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
