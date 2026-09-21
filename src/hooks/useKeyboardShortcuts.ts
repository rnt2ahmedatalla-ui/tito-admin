import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const TAB_ROUTES = ['/', '/payments', '/reminders', '/bookings', '/more'];

export function useGlobalShortcuts(onSearchFocus?: () => void, onHelp?: () => void) {
  const navigate = useNavigate();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

      if (e.key === '/' && !isInput) {
        e.preventDefault();
        onSearchFocus?.();
      }

      if (e.key === '?' && !isInput) {
        e.preventDefault();
        onHelp?.();
      }

      if (!isInput && e.key >= '1' && e.key <= '5') {
        const idx = parseInt(e.key, 10) - 1;
        const route = TAB_ROUTES[idx];
        if (route) navigate(route);
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [navigate, onSearchFocus, onHelp]);
}
