import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Bell } from 'lucide-react';
import { useAdminNotifications } from '@/hooks/useAdminNotifications';
import { cn } from '@/lib/cn';

export function NotificationsBell() {
  const { t, i18n } = useTranslation();
  const { data = [], unread, markAll } = useAdminNotifications();
  const [open, setOpen] = useState(false);
  const locale = i18n.language?.startsWith('ar') ? 'ar' : 'en';

  return (
    <div className="relative">
      <button
        type="button"
        className="relative rounded-btn border border-cream/20 bg-bark/25 p-2 text-cream hover:text-gold"
        aria-label={t('notifications.title')}
        onClick={() => setOpen((v) => !v)}
      >
        <Bell className="size-4" />
        {unread > 0 ? (
          <span className="absolute -end-1 -top-1 flex min-w-4 items-center justify-center rounded-full bg-gold px-1 text-[10px] font-bold text-espresso">
            {unread > 9 ? '9+' : unread}
          </span>
        ) : null}
      </button>
      {open ? (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute end-0 z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-card border border-bark/15 bg-white p-3 shadow-lg">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="font-semibold text-espresso">{t('notifications.title')}</p>
              {unread > 0 ? (
                <button
                  type="button"
                  className="text-xs text-gold"
                  onClick={() => void markAll.mutate()}
                >
                  {t('notifications.markAll')}
                </button>
              ) : null}
            </div>
            <ul className="max-h-72 space-y-2 overflow-y-auto">
              {data.length === 0 ? (
                <li className="text-sm text-ink-70">{t('notifications.empty')}</li>
              ) : (
                data.map((n) => (
                  <li
                    key={n.id}
                    className={cn(
                      'rounded-btn border px-2 py-2 text-sm',
                      n.is_read ? 'border-bark/10 bg-cream/40' : 'border-gold/40 bg-gold/10',
                    )}
                  >
                    <p className="font-medium text-espresso">
                      {locale === 'ar' ? n.title_ar : n.title_en}
                    </p>
                    {(locale === 'ar' ? n.body_ar : n.body_en) ? (
                      <p className="mt-0.5 text-xs text-ink-70">
                        {locale === 'ar' ? n.body_ar : n.body_en}
                      </p>
                    ) : null}
                  </li>
                ))
              )}
            </ul>
          </div>
        </>
      ) : null}
    </div>
  );
}
