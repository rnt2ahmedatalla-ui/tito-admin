import type { BookingStatus } from '@/types/database';
import {
  AlertCircle,
  Ban,
  CheckCircle2,
  CircleDashed,
  Clock,
  XCircle,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface StatusConfig {
  color: 'warning' | 'success' | 'info' | 'ink' | 'danger';
  bgClass: string;
  textClass: string;
  dotClass: string;
  labelKey: string;
  icon: LucideIcon;
}

export const BOOKING_STATUS: Record<BookingStatus, StatusConfig> = {
  pending_payment: {
    color: 'warning',
    bgClass: 'bg-warning/15',
    textClass: 'text-warning',
    dotClass: 'bg-warning',
    labelKey: 'status.pending_payment',
    icon: Clock,
  },
  confirmed: {
    color: 'success',
    bgClass: 'bg-success/15',
    textClass: 'text-success',
    dotClass: 'bg-success',
    labelKey: 'status.confirmed',
    icon: CheckCircle2,
  },
  completed: {
    color: 'info',
    bgClass: 'bg-info/15',
    textClass: 'text-info',
    dotClass: 'bg-info',
    labelKey: 'status.completed',
    icon: CircleDashed,
  },
  cancelled: {
    color: 'ink',
    bgClass: 'bg-ink-70/15',
    textClass: 'text-ink-70',
    dotClass: 'bg-ink-70',
    labelKey: 'status.cancelled',
    icon: XCircle,
  },
  expired: {
    color: 'ink',
    bgClass: 'bg-ink-70/15',
    textClass: 'text-ink-70',
    dotClass: 'bg-ink-70',
    labelKey: 'status.expired',
    icon: AlertCircle,
  },
  no_show: {
    color: 'danger',
    bgClass: 'bg-danger/15',
    textClass: 'text-danger',
    dotClass: 'bg-danger',
    labelKey: 'status.no_show',
    icon: Ban,
  },
};

export function getStatusConfig(status: BookingStatus): StatusConfig {
  return BOOKING_STATUS[status];
}
