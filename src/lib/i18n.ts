import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import ar from '@/locales/ar.json';
import en from '@/locales/en.json';

const STORAGE_KEY = 'tito-admin-lang';

function getInitialLang(): string {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'en' || stored === 'ar') return stored;
  return 'ar';
}

export function setLanguage(lang: 'ar' | 'en'): void {
  localStorage.setItem(STORAGE_KEY, lang);
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  void i18n.changeLanguage(lang);
}

const initialLang = getInitialLang();
document.documentElement.lang = initialLang;
document.documentElement.dir = initialLang === 'ar' ? 'rtl' : 'ltr';

void i18n.use(initReactI18next).init({
  resources: {
    ar: { translation: ar },
    en: { translation: en },
  },
  lng: initialLang,
  fallbackLng: 'ar',
  interpolation: { escapeValue: false },
});

export default i18n;
