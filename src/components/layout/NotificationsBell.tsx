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
        className="relative inline-flex min-h-10 min-w-10 items-center justify-center rounded-btn border border-gold/40 bg-bark/40 p-2 text-cream hover:bg-bark/60 hover:text-gold"
        aria-label={t('notifications.title')}
        onClick={() => setOpen((v) => !v)}
      >
        <Bell className="size-5 text-gold" />
        {unread > 0 ? (
          <span className="absolute -end-1.5 -top-1.5 flex min-h-5 min-w-5 items-center justify-center rounded-full bg-gold px-1.5 text-[11px] font-bold text-espresso shadow">
            {unread > 9 ? '9+' : unread}
          </span>
        ) : null}
      </button>
      {open ? (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute end-0 z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-card border border-bark/15 bg-white p-3 shadow-lg lg:end-auto lg:start-0">
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
