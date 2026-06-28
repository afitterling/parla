import { createContext, useContext, useMemo } from 'react';
import { makeT, TFn, UiLang } from './index';

type I18nValue = { t: TFn; lang: UiLang };

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ lang, children }: { lang: UiLang; children: React.ReactNode }) {
  const value = useMemo<I18nValue>(() => ({ t: makeT(lang), lang }), [lang]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useT/useUiLang must be used inside an I18nProvider');
  return ctx;
}

export function useT(): TFn {
  return useI18n().t;
}

export function useUiLang(): UiLang {
  return useI18n().lang;
}
