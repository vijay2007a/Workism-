import { useMemo, useState } from 'react';
import { Check, Globe, Search } from 'lucide-react';
import { GlassMenu } from '../glass/GlassMenu';
import { LiquidGlassButton } from '../glass/LiquidGlassButton';
import { useI18n } from '../lib/i18n';
import { dirOf, LANGS } from '../lib/lang';
import { searchItems } from '../lib/search';
import { setSettings } from '../lib/store';

/** The list itself, shared by the navbar popover, onboarding and Settings. Every language is named in its own script. */
export function LanguageList({ onPick }: { onPick?: () => void }) {
  const { t, lang } = useI18n();
  const [query, setQuery] = useState('');
  const all = useMemo(() => LANGS.map((l) => ({ ...l, label: l.english, hint: l.native })), []);
  const list = query.trim() ? searchItems(all, query) : all;
  return (
    <>
      <div className="lg-field mb-2 min-h-11">
        <Search aria-hidden />
        <input type="text" aria-label={t('Find a language')} placeholder={t('Find a language')} value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      <ul className="grid max-h-[min(22rem,50dvh)] grid-cols-2 gap-1.5 overflow-y-auto p-1">
        {list.map((l) => (
          <li key={l.code}>
            <button
              type="button"
              lang={l.code}
              dir={dirOf(l.code)}
              aria-pressed={l.code === lang}
              className="lg-language"
              onClick={() => {
                setSettings({ lang: l.code });
                onPick?.();
              }}
            >
              <span className="min-w-0">
                <span className="block truncate text-[1.0625rem] leading-snug font-semibold">{l.native}</span>
                <span lang="en" className="block truncate text-[0.8125rem] leading-snug opacity-80">
                  {l.english}
                </span>
              </span>
              {l.code === lang && <Check className="size-4 flex-none" aria-hidden />}
            </button>
          </li>
        ))}
        {list.length === 0 && <li className="col-span-2 px-3 py-4 text-ink-soft">{t('Nothing matches “{query}”.', { query: query.trim() })}</li>}
      </ul>
    </>
  );
}

export function LanguageSelector() {
  const { t, lang } = useI18n();
  const current = LANGS.find((l) => l.code === lang)!;
  return (
    <GlassMenu
      label={t('Language')}
      className="tab:w-96"
      trigger={(p) => (
        <LiquidGlassButton variant="icon" {...p} aria-label={`${t('Language')}: ${current.native}`} icon={<Globe aria-hidden />} />
      )}
    >
      {(close) => <LanguageList onPick={close} />}
    </GlassMenu>
  );
}
