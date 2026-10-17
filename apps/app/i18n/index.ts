import { getLocales } from 'expo-localization';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './locales/en.json';
import sw from './locales/sw.json';

const deviceLanguage = getLocales()[0]?.languageCode ?? 'en';
const defaultLocale = deviceLanguage === 'sw' ? 'sw' : 'en';

export const SUPPORTED_LOCALES = ['en', 'sw'] as const;
export type AppLocale = (typeof SUPPORTED_LOCALES)[number];

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    sw: { translation: sw },
  },
  lng: defaultLocale,
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  returnNull: false,
});

export function setLocale(locale: AppLocale) {
  void i18n.changeLanguage(locale);
}

export default i18n;
