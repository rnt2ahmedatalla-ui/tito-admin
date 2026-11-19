import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Card, CardBody } from '@/components/ui/Card';
import { downloadBlob, lastBackupAgeDays, runBackup } from './backupLib';

export function BackupPage() {
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith('ar');
  const L = (ar: string, en: string) => (isAr ? ar : en);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Record<string, number | null>>({});
  const [age, setAge] = useState<number | null>(() => lastBackupAgeDays());

  const run = async () => {
    setBusy(true);
    setDone({});
    try {
      const r = await runBackup((t, c) => setDone((p) => ({ ...p, [t]: c })));
      downloadBlob(r.blob, r.name);
      setAge(0);
      toast.success(L('النسخة الاحتياطية اتحمّلت على جهازك', 'Backup downloaded to your device'));
    } catch {
      toast.error(L('حصلت مشكلة، جرّب تاني', 'Something went wrong, try again'));
    } finally {
      setBusy(false);
    }
  };

  const entries = Object.entries(done);
  return (
    <div className="w-full min-w-0 max-w-full space-y-4 overflow-x-clip">
      <h1 className="text-xl font-bold text-espresso">{L('نسخة احتياطية', 'Backup')}</h1>
      <Card>
        <CardBody className="space-y-3 p-4">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 size-6 shrink-0 text-gold" aria-hidden />
            <div className="min-w-0 text-sm text-ink-70">
              <p className="font-semibold text-espresso">{L('نسخة كاملة من بياناتك على جهازك', 'A full copy of your data on your device')}</p>
              <p className="mt-1">
                {L(
                  'بتحمّل ملف واحد فيه الحجوزات والعملاء والمالية والإعدادات. ببلاش ومن غير أي اشتراك. اعملها مرة كل أسبوع واحفظ الملف في مكان آمن (جوجل درايف مثلاً).',
                  'Downloads one file with bookings, customers, finance and settings. Free, no subscription. Do it weekly and keep the file somewhere safe.',
                )}
              </p>
              <p className="mt-1 text-xs text-danger">{L('الملف فيه أرقام تليفونات العملاء، متبعتوش لحد.', 'The file contains customer phone numbers. Do not share it.')}</p>
            </div>
          </div>
          <p className="text-sm font-medium text-espresso">
            {age === null ? L('لسه معملتش نسخة على الجهاز ده.', 'No backup made on this device yet.') : age === 0 ? L('آخر نسخة: النهاردة ✅', 'Last backup: today ✅') : L(`آخر نسخة من ${age} يوم`, `Last backup ${age} day(s) ago`)}
          </p>
          <Button variant="primary" size="lg" loading={busy} onClick={() => void run()}>
            <Download className="size-5" />
            {L('حمّل نسخة احتياطية الآن', 'Download backup now')}
          </Button>
          {entries.length > 0 ? (
            <ul className="grid max-h-64 grid-cols-1 gap-1 overflow-y-auto rounded-btn bg-sand/40 p-2 text-xs sm:grid-cols-2">
              {entries.map(([t, c]) => (
                <li key={t} className="flex min-w-0 items-center justify-between gap-2">
                  <span className="truncate font-latin">{t}</span>
                  <span className="shrink-0 font-latin text-ink-70">{c === null ? '—' : c}</span>
                </li>
              ))}
            </ul>
          ) : null}
          <p className="text-xs text-ink-70">{L('لو حصلت أي مشكلة مستقبلاً، ابعتلي الملف وأرجّع البيانات.', 'If anything ever goes wrong, send me the file and I will restore the data.')}</p>
        </CardBody>
      </Card>
    </div>
  );
}
