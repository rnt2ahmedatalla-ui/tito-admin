import { useTranslation } from 'react-i18next';
import { Button } from './Button';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  variant?: 'danger' | 'primary';
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  variant = 'danger',
  loading,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const { t } = useTranslation();
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center p-4 lg:items-center">
      <div className="absolute inset-0 bg-espresso/50" onClick={onCancel} aria-hidden />
      <div className="relative w-full max-w-md rounded-card bg-white p-4 shadow-warm-lg">
        <h3 className="text-lg font-semibold">{title}</h3>
        <p className="mt-2 text-ink-70">{message}</p>
        <div className="mt-4 flex gap-2 justify-end">
          <Button variant="ghost" onClick={onCancel} disabled={loading}>
            {t('app.cancel')}
          </Button>
          <Button variant={variant} onClick={onConfirm} loading={loading}>
            {confirmLabel ?? t('app.confirm')}
          </Button>
        </div>
      </div>
    </div>
  );
}
