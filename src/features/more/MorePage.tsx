import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Settings,
  Users,
  Scissors,
  Clock,
  CalendarOff,
  UserPlus,
  Wrench,
  Globe,
  LogOut,
  ChevronLeft,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { setLanguage } from '@/lib/i18n';
import { cn } from '@/lib/cn';

const links = [
  { to: '/more/services', icon: Scissors, labelKey: 'nav.services' },
  { to: '/more/hours', icon: Clock, labelKey: 'nav.hours' },
  { to: '/more/time-off', icon: CalendarOff, labelKey: 'nav.timeOff' },
  { to: '/more/customers', icon: Users, labelKey: 'nav.customers' },
  { to: '/more/walk-in', icon: UserPlus, labelKey: 'nav.walkIn' },
  { to: '/more/settings', icon: Settings, labelKey: 'nav.settings' },
  { to: '/more/maintenance', icon: Wrench, labelKey: 'nav.maintenance' },
];

export function MorePage() {
  const { t, i18n } = useTranslation();
  const { signOut } = useAuth();

  return (
    <div className="space-y-4 lg:hidden">
      <h1 className="text-2xl font-semibold">{t('nav.more')}</h1>
      <nav className="space-y-1">
        {links.map((link) => {
          const Icon = link.icon;
          return (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-btn px-4 py-3 text-base transition-colors',
                  isActive ? 'bg-gold/15 text-espresso' : 'hover:bg-sand/60',
                )
              }
            >
              <Icon className="size-5 shrink-0" />
              <span className="flex-1">{t(link.labelKey)}</span>
              <ChevronLeft className="size-4 text-ink-70 rtl:-scale-x-100" />
            </NavLink>
          );
        })}
      </nav>
      <button
        type="button"
        className="flex w-full items-center gap-3 rounded-btn px-4 py-3 hover:bg-sand/60"
        onClick={() => setLanguage(i18n.language === 'ar' ? 'en' : 'ar')}
      >
        <Globe className="size-5" />
        {t('app.language')}
      </button>
      <button
        type="button"
        className="flex w-full items-center gap-3 rounded-btn px-4 py-3 text-danger hover:bg-danger/10"
        onClick={() => void signOut()}
      >
        <LogOut className="size-5" />
        {t('app.signOut')}
      </button>
    </div>
  );
}
