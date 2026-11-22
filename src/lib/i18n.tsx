import { createContext, use, useEffect, useMemo, useState, type ReactNode } from 'react';
import { dirOf, isLang, resolveLang, translate, type Dict, type LangCode } from './lang';
import { useStore } from './store';

// One lazy chunk per language. Keys are the English source text (see translate()).
const loaders = import.meta.glob<{ default: Dict }>('../locales/*.ts');

const make = (lang: LangCode, dict: Dict) => ({
  lang,
  dir: dirOf(lang) as 'ltr' | 'rtl',
  t: (text: string, vars?: Record<string, string | number>) => translate(dict, text, vars),
  percent: (n: number) => new Intl.NumberFormat(lang, { style: 'percent', maximumFractionDigits: 0 }).format(n / 100),
  number: (n: number) => new Intl.NumberFormat(lang).format(n),
  date: (ms: number, style: Intl.DateTimeFormatOptions = { dateStyle: 'medium' }) => new Intl.DateTimeFormat(lang, style).format(ms),
});

export type I18n = ReturnType<typeof make>;
const Ctx = createContext(make('en', {}));
export const useI18n = () => use(Ctx);

export function I18nProvider({ children }: { children: ReactNode }) {
  const chosen = useStore((s) => s.settings.lang);
  const lang = isLang(chosen) ? chosen : resolveLang(navigator.languages);
  const [loaded, setLoaded] = useState<{ lang: LangCode; dict: Dict }>({ lang: 'en', dict: {} });

  useEffect(() => {
    let live = true;
    const load = loaders[`../locales/${lang}.ts`];
    // English is the source language, so it has no file.
    (load ? load() : Promise.resolve({ default: {} })).then(
      (m) => live && setLoaded({ lang, dict: m.default }),
      () => live && setLoaded({ lang: 'en', dict: {} }),
    );
    return () => {
      live = false;
    };
  }, [lang]);

  const value = useMemo(() => make(loaded.lang, loaded.dict), [loaded]);
  useEffect(() => {
    document.documentElement.lang = value.lang;
    document.documentElement.dir = value.dir;
  }, [value]);

  return <Ctx value={value}>{children}</Ctx>;
}
