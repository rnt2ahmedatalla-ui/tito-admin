import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/cn';
import { Button } from './Button';

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  className?: string;
}

export function Sheet({ open, onClose, title, children, className }: SheetProps) {
  const { t } = useTranslation();

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-espresso/40 motion-reduce:transition-none lg:bg-espresso/20"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal
        aria-label={title}
        className={cn(
          'fixed z-50 flex flex-col bg-cream shadow-warm-lg motion-reduce:transition-none',
          'inset-x-0 bottom-0 max-h-[90vh] rounded-t-card animate-in slide-in-from-bottom duration-200',
          'lg:inset-y-0 lg:end-0 lg:start-auto lg:w-[420px] lg:max-h-full lg:rounded-none lg:rounded-s-card lg:slide-in-from-end',
          className,
        )}
      >
        <div className="flex items-center justify-between border-b border-bark/10 px-4 py-3">
          {title ? <h2 className="text-lg font-semibold">{title}</h2> : <span />}
          <Button variant="ghost" size="sm" onClick={onClose} aria-label={t('app.close')}>
            <X className="size-5" />
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {children}
        </div>
      </div>
    </>
  );
}
