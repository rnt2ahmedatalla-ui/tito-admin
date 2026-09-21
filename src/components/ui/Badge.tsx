import { useTranslation } from 'react-i18next';
import type { BookingStatus } from '@/types/database';
import { getStatusConfig } from '@/lib/status';
import { cn } from '@/lib/cn';

interface StatusBadgeProps {
  status: BookingStatus;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const { t } = useTranslation();
  const config = getStatusConfig(status);
  const Icon = config.icon;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
        config.bgClass,
        config.textClass,
        className,
      )}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden />
      {t(config.labelKey)}
    </span>
  );
}

interface CountBadgeProps {
  count: number;
  className?: string;
}

export function CountBadge({ count, className }: CountBadgeProps) {
  if (count <= 0) return null;
  return (
    <span
      className={cn(
        'inline-flex min-w-5 items-center justify-center rounded-full bg-gold px-1.5 py-0.5 text-xs font-semibold text-espresso',
        className,
      )}
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}
