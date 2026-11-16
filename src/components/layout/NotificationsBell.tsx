import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Bell, ChevronLeft } from 'lucide-react';
import {
  notificationHref,
  useAdminNotifications,
} from '@/hooks/useAdminNotifications';
import { cn } from '@/lib/cn';

const DESKTOP_BREAKPOINT = 1024;
const PANEL_WIDTH = 384;

export function NotificationsBell() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { data = [], unread, markAll, markOne } = useAdminNotifications();
  const [open, setOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const locale = i18n.language?.startsWith('ar') ? 'ar' : 'en';

  const toggle = () => {
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      const desktop = window.innerWidth >= DESKTOP_BREAKPOINT;
      setIsDesktop(desktop);
      // على اللابتوب: اللوحة تتحط تحت الجرس مباشرة وتفضل جوه الشاشة
      setPos({
        top: rect.bottom + 8,
        left: Math.max(8, Math.min(rect.left, window.innerWidth - PANEL_WIDTH - 8)),
      });
    }
    setOpen((v) => !v);
  };

  const openItem = (id: string, kind: string, entity: string | null) => {
    setOpen(false);
    if (!data.find((n) => n.id === id)?.is_read) {
      void markOne.mutate(id);
    }
    navigate(notificationHref({ kind, entity }));
  };

  const panel = (
    <>
      <div className="fixed inset-0 z-40 bg-espresso/40 lg:bg-transparent" onClick={() => setOpen(false)} />
      <div
        style={isDesktop ? { top: pos.top, left: pos.left, width: PANEL_WIDTH } : undefined}
        className={cn(
          'z-50 overflow-hidden rounded-card border border-bark/15 bg-white shadow-warm-lg',
          // الموبايل: شريط عريض تحت الهيدر
          'fixed inset-x-3 top-[4.25rem] max-h-[min(70dvh,28rem)]',
        )}
      >
        <div className="flex items-center justify-between gap-2 border-b border-bark/10 px-4 py-3">
          <p className="text-base font-semibold text-espresso">{t('notifications.title')}</p>
          {unread > 0 ? (
            <button
              type="button"
              className="shrink-0 text-sm font-medium text-gold"
              onClick={() => void markAll.mutate()}
            >
              {t('notifications.markAll')}
            </button>
          ) : null}
        </div>
        <ul className="max-h-[min(60dvh,24rem)] divide-y divide-bark/10 overflow-y-auto overscroll-contain">
          {data.length === 0 ? (
            <li className="px-4 py-6 text-sm text-ink-70">{t('notifications.empty')}</li>
          ) : (
            data.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  className={cn(
                    'flex w-full items-start gap-3 px-4 py-3.5 text-start transition-colors hover:bg-sand/50',
                    !n.is_read && 'bg-gold/10',
                  )}
                  onClick={() => openItem(n.id, n.kind, n.entity)}
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      {!n.is_read ? (
                        <span className="size-2 shrink-0 rounded-full bg-gold" aria-hidden />
                      ) : null}
                      <span className="text-sm font-semibold text-espresso">
                        {locale === 'ar' ? n.title_ar : n.title_en}
                      </span>
                    </span>
                    {(locale === 'ar' ? n.body_ar : n.body_en) ? (
                      <span className="mt-1 block text-sm leading-snug text-ink-70">
                        {locale === 'ar' ? n.body_ar : n.body_en}
                      </span>
                    ) : null}
                    <span className="mt-1.5 block text-xs text-gold">
                      {t('notifications.openAction')}
                    </span>
                  </span>
                  <ChevronLeft className="mt-1 size-4 shrink-0 text-ink-70 rtl:-scale-x-100" aria-hidden />
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </>
  );

  return (
    <div className="relative">
      <button
        ref={btnRef}
        type="button"
        className="relative inline-flex min-h-10 min-w-10 items-center justify-center rounded-btn border border-gold/40 bg-bark/40 p-2 text-cream hover:bg-bark/60 hover:text-gold"
        aria-label={t('notifications.title')}
        aria-expanded={open}
        onClick={toggle}
      >
        <Bell className="size-5 text-gold" />
        {unread > 0 ? (
          <span className="absolute -end-1.5 -top-1.5 flex min-h-5 min-w-5 items-center justify-center rounded-full bg-gold px-1.5 text-[11px] font-bold text-espresso shadow">
            {unread > 9 ? '9+' : unread}
          </span>
        ) : null}
      </button>

      {open ? createPortal(panel, document.body) : null}
    </div>
  );
}
