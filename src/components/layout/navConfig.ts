import {
  Calendar,
  ClipboardCheck,
  List,
  UserPlus,
  Users,
  Star,
  Gift,
  Ticket,
  Wallet,
  Boxes,
  UserRound,
  Scissors,
  Package,
  Clock,
  CalendarOff,
  Coffee,
  Settings,
  Wrench,
  DatabaseBackup,
  History,
  Eraser,
  TriangleAlert,
  CalendarHeart,
  type LucideIcon,
} from 'lucide-react';

export type NavItem = { to: string; icon: LucideIcon; labelKey: string; badge?: 'routine' };
export type NavGroup = { id: string; titleKey?: string; items: NavItem[] };

/** كل صفحات الأدمن مقسّمة لمجموعات: مرجع واحد للقايمة الجانبية وصفحة "المزيد" */
export const navGroups: NavGroup[] = [
  {
    id: 'main',
    items: [
      { to: '/', icon: Calendar, labelKey: 'nav.today' },
      { to: '/routine', icon: ClipboardCheck, labelKey: 'nav.routine', badge: 'routine' },
      { to: '/more/walk-in', icon: UserPlus, labelKey: 'nav.walkIn' },
    ],
  },
  {
    id: 'money',
    titleKey: 'nav.groupMoney',
    items: [
      { to: '/more/finance', icon: Wallet, labelKey: 'nav.finance' },
    ],
  },
  {
    id: 'customers',
    titleKey: 'nav.groupCustomers',
    items: [
      { to: '/more/customers', icon: Users, labelKey: 'nav.customers' },
      { to: '/bookings', icon: List, labelKey: 'nav.bookings' },
      { to: '/more/reviews', icon: Star, labelKey: 'nav.reviews' },
      { to: '/more/loyalty', icon: Gift, labelKey: 'nav.loyalty' },
      { to: '/more/coupons', icon: Ticket, labelKey: 'nav.coupons' },
      { to: '/more/extras', icon: Boxes, labelKey: 'nav.extras' },
    ],
  },
  {
    id: 'shop',
    titleKey: 'nav.groupShop',
    items: [
      { to: '/more/emergency', icon: TriangleAlert, labelKey: 'nav.emergency' },
      { to: '/more/staff', icon: UserRound, labelKey: 'nav.staff' },
      { to: '/more/services', icon: Scissors, labelKey: 'nav.services' },
      { to: '/more/products', icon: Package, labelKey: 'nav.products' },
      { to: '/more/hours', icon: Clock, labelKey: 'nav.hours' },
      { to: '/more/seasons', icon: CalendarHeart, labelKey: 'nav.seasons' },
      { to: '/more/time-off', icon: CalendarOff, labelKey: 'nav.timeOff' },
      { to: '/more/breaks', icon: Coffee, labelKey: 'nav.breaks' },
    ],
  },
  {
    id: 'system',
    titleKey: 'nav.groupSystem',
    items: [
      { to: '/more/settings', icon: Settings, labelKey: 'nav.settings' },
      { to: '/more/backup', icon: DatabaseBackup, labelKey: 'nav.backup' },
      { to: '/more/audit', icon: History, labelKey: 'nav.audit' },
      { to: '/more/maintenance', icon: Wrench, labelKey: 'nav.maintenance' },
      { to: '/more/cleanup', icon: Eraser, labelKey: 'nav.cleanup' },
    ],
  },
];
