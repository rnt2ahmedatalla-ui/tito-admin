import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { BellRing } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { adminPushIsOn, disableAdminPush, enableAdminPush, pushSupported, sendAdminTestPush } from '@/lib/push';

/** إشعارات الأدمن على الموبايل: حجز جديد، إلغاء، دفعة، انتظار... بتوصلك زي أي إشعار وبتفتح التفاصيل */
export function AdminPushCard() {
  const { i18n } = useTranslation();
  const isAr = !!i18n.language?.startsWith('ar');
  const L = (ar: string, en: string) => (isAr ? ar : en);
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const supported = pushSupported();

  useEffect(() => {
    void adminPushIsOn().then(setOn);
  }, []);

  const enable = async () => {
    setBusy(true);
    try {
      const r = await enableAdminPush(isAr ? 'ar' : 'en');
      if (r === 'ok') { setOn(true); toast.success(L('اشتغلت الإشعارات على الجهاز ده', 'Notifications enabled on this device')); }
      else if (r === 'denied') toast.error(L('الإذن اترفض. فعّله من إعدادات المتصفح للموقع.', 'Permission denied. Enable it in the browser site settings.'));
      else toast.error(L('المتصفح ده مش بيدعم الإشعارات', 'This browser does not support notifications'));
    } catch (e) {
      toast.error(L('معرفتش أفعّلها. اتأكد إنك شغّلت features-v49.sql.', 'Could not enable. Make sure features-v49.sql was run.') + ` (${(e as Error).message})`);
    } finally { setBusy(false); }
  };
  const disable = async () => {
    setBusy(true);
    try { await disableAdminPush(); setOn(false); toast.success(L('اتقفلت على الجهاز ده', 'Turned off on this device')); }
    catch { toast.error(L('حصل خطأ', 'Error')); }
    finally { setBusy(false); }
  };
  const test = async () => {
    setBusy(true);
    try { await sendAdminTestPush(); toast.success(L('اتبعت. هيوصلك خلال ثواني.', 'Sent. It should arrive within seconds.')); }
    catch (e) { toast.error((e as Error).message.includes('PUSH_URL') ? L('رابط الدالة مش متسجّل (push_config).', 'Function URL missing (push_config).') : L('معرفتش أبعت. اتأكد إن الدالة في Supabase اتحدّثت.', 'Could not send. Make sure the Supabase function was updated.')); }
    finally { setBusy(false); }
  };

  return (
    <Card>
      <CardHeader>
        <h2 className="flex items-center gap-2 font-semibold"><BellRing className="size-4 text-gold" aria-hidden />{L('إشعارات الأدمن على موبايلك (مجانية)', 'Admin phone notifications (free)')}</h2>
        <p className="mt-1 text-sm text-ink-70">{L('أي حجز جديد أو إلغاء أو دفعة أو انتظار بيوصلك إشعار، وبتدوس عليه فيفتح تفاصيله على طول.', 'New bookings, cancellations, payments and waiting-list entries reach you as phone notifications; tap one to open its details.')}</p>
      </CardHeader>
      <CardBody className="space-y-3">
        {!supported ? <p className="rounded-btn bg-sand/50 p-3 text-sm">{L('المتصفح ده مش بيدعم الإشعارات. على الآيفون: ضيف الموقع للشاشة الرئيسية الأول.', 'Notifications are not supported here. On iPhone: add the site to the Home Screen first.')}</p> : null}
        <p className="text-sm">{L('الحالة على الجهاز ده:', 'Status on this device:')} <b className={on ? 'text-success' : 'text-ink-70'}>{on ? L('شغّالة ✅', 'On ✅') : L('مقفولة', 'Off')}</b></p>
        <div className="flex flex-wrap gap-2">
          {on ? (
            <>
              <Button variant="primary" loading={busy} onClick={() => void test()}>{L('جرّب إشعار دلوقتي', 'Send a test')}</Button>
              <Button variant="secondary" loading={busy} onClick={() => void disable()}>{L('اقفلها على الجهاز ده', 'Turn off here')}</Button>
            </>
          ) : (
            <Button variant="primary" loading={busy} disabled={!supported} onClick={() => void enable()}>{L('فعّل الإشعارات على الجهاز ده', 'Enable on this device')}</Button>
          )}
        </div>
        <p className="text-xs text-ink-70">{L('فعّلها على كل جهاز عايز الإشعارات توصله. على الآيفون لازم الموقع يكون مضاف للشاشة الرئيسية. ولو ضفته للشاشة الرئيسية على الأندرويد، الإشعار بيظهر باسم "tito" بس من غير رابط الموقع.', 'Enable it on every device you want. On iPhone the site must be added to the Home Screen. On Android, installing the app shows just "tito" instead of the site address.')}</p>
      </CardBody>
    </Card>
  );
}
