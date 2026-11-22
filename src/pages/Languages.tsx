import { useState } from 'react';
import { Check, Search } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useSearchParams } from 'react-router';
import { PageHeader } from '../components/PageHeader';
import { LANGUAGE_KINDS, PROGRAMMING_LANGUAGES, type LanguageKind } from '../data/languages';
import { Chip, Choices } from '../glass/controls';
import { LiquidGlassButton } from '../glass/LiquidGlassButton';
import { useToast } from '../glass/GlassToast';
import { useI18n } from '../lib/i18n';
import { searchItems } from '../lib/search';
import { setProfile, useStore } from '../lib/store';

const ALL = PROGRAMMING_LANGUAGES.map((l) => ({ ...l, label: l.name, hint: l.note }));

export default function LanguagesPage() {
  const { t } = useI18n();
  const toast = useToast();
  const chosen = useStore((s) => s.profile.codeLang);
  const [params, setParams] = useSearchParams();
  const query = params.get('q') ?? '';
  const [kind, setKind] = useState<LanguageKind | 'All'>('All');
  const found = (query.trim() ? searchItems(ALL, query) : ALL).filter((l) => kind === 'All' || l.kinds.includes(kind));

  return (
    <>
      <PageHeader title={t('Programming languages')} subtitle={t('Choose the one your challenges open with.')} back={{ to: '/learn', label: t('AI Learning Path') }} />
      <div className="mb-6 grid gap-4">
        <div className="lg-field max-w-md">
          <Search aria-hidden />
          <input type="text" aria-label={t('Search languages')} placeholder={t('Search languages')} value={query} onChange={(e) => setParams(e.target.value ? { q: e.target.value } : {}, { replace: true })} />
        </div>
        <Choices label={t('Category')} options={(['All', ...LANGUAGE_KINDS] as const).map((k) => [k, t(k)] as const)} value={[kind]} onChange={(k) => setKind(k as LanguageKind)} />
      </div>
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,16.5rem),1fr))] gap-4">
        <AnimatePresence mode="popLayout">
          {found.map((l) => {
            const on = chosen === l.id;
            return (
              <motion.li
                key={l.id}
                layout
                className="lg-panel lg-edge lg-light flex flex-col gap-3 rounded-3xl p-5"
                initial={{ opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.92, transition: { duration: 0.12 } }}
                transition={{ type: 'spring', stiffness: 300, damping: 26 }}
              >
                <div className="flex items-center gap-4">
                  <span className="lg-orb size-13 text-base font-extrabold text-[color-mix(in_oklab,var(--orb)_10%,#0d0a22)]!" style={{ ['--orb' as string]: l.color }} aria-hidden>
                    {l.mark}
                  </span>
                  <div className="min-w-0">
                    <h2 className="text-lg font-bold">{l.name}</h2>
                    <p className="text-sm text-ink-soft">{t(l.note)}</p>
                  </div>
                </div>
                <div className="mt-auto flex items-center justify-between gap-3 pt-1">
                  <Chip tone={l.runs ? 'good' : undefined}>{l.runs ? t('Runs here') : t('Editor only')}</Chip>
                  <LiquidGlassButton
                    size="sm"
                    variant={on ? 'primary' : 'secondary'}
                    aria-pressed={on}
                    aria-label={on ? t('{name}, chosen', { name: l.name }) : t('Choose {name}', { name: l.name })}
                    icon={on ? <Check aria-hidden /> : undefined}
                    onClick={() => {
                      setProfile({ codeLang: on ? '' : l.id });
                      if (!on) toast(t('Challenges will open in {name}.', { name: l.name }));
                    }}
                  >
                    {on ? t('Chosen') : t('Choose')}
                  </LiquidGlassButton>
                </div>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>
      {found.length === 0 && <p className="py-10 text-center text-ink-soft">{t('Nothing matches “{query}”.', { query: query.trim() || t(kind) })}</p>}
      <p className="mt-6 text-sm text-ink-soft">{t('“Runs here” means this browser can execute your code. The rest need the WORKISM execution service, which is not connected.')}</p>
    </>
  );
}
