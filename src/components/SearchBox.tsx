import { useId, useMemo, useState, type KeyboardEvent } from 'react';
import { Search } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useNavigate } from 'react-router';
import { PROGRAMMING_LANGUAGES } from '../data/languages';
import { useI18n } from '../lib/i18n';
import { searchItems } from '../lib/search';
import { useWorkspace } from '../lib/workspace';
import { NAV } from './nav';

/** Combobox over pages, courses, projects, skills and languages. */
export function SearchBox({ onDone, focusOnMount }: { onDone?: () => void; focusOnMount?: boolean }) {
  const { t } = useI18n();
  const go = useNavigate();
  const id = useId();
  const { courses, projects, skills } = useWorkspace();
  const [query, setQuery] = useState('');
  const [at, setAt] = useState(0);
  const [open, setOpen] = useState(false);

  const items = useMemo(
    () => [
      ...NAV.map((n) => ({ label: t(n.label), hint: n.label, kind: t('Page'), to: n.to as string })),
      ...courses.map((c) => ({ label: c.title, hint: c.blurb, kind: t('Course'), to: `/learn/${c.id}` })),
      ...projects.map((p) => ({ label: p.title, hint: p.brief, kind: t('Project'), to: `/labs/${p.id}` })),
      ...skills.map((s) => ({ label: s.name, hint: '', kind: t('Skill'), to: `/skills?focus=${s.id}` })),
      ...PROGRAMMING_LANGUAGES.map((l) => ({ label: l.name, hint: l.note, kind: t('Language'), to: `/learn/languages?q=${encodeURIComponent(l.name)}` })),
    ],
    [t, courses, projects, skills],
  );
  const results = useMemo(() => searchItems(items, query).slice(0, 7), [items, query]);
  const shown = open && query.trim() !== '';

  const choose = (to: string) => {
    setQuery('');
    setOpen(false);
    go(to);
    onDone?.();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (results.length) setAt((i) => (i + (e.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length);
    } else if (e.key === 'Enter' && results[at]) {
      e.preventDefault();
      choose(results[at].to);
    } else if (e.key === 'Escape') {
      setQuery('');
    }
  };

  return (
    <div role="search" className="relative w-full">
      <div className="lg-field min-h-11">
        <Search aria-hidden />
        <input
          type="text"
          role="combobox"
          aria-label={t('Search')}
          aria-expanded={shown}
          aria-controls={`${id}-list`}
          aria-activedescendant={shown && results[at] ? `${id}-${at}` : undefined}
          aria-autocomplete="list"
          autoComplete="off"
          // The phone search sheet opens on request, so moving focus into it is expected.
          // oxlint-disable-next-line jsx-a11y/no-autofocus
          autoFocus={focusOnMount}
          placeholder={t('Search courses, projects, skills…')}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setAt(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={onKey}
          className="text-[0.975rem]!"
        />
      </div>
      <AnimatePresence>
        {shown && (
          <motion.ul
            id={`${id}-list`}
            role="listbox"
            aria-label={t('Search results')}
            className="lg-float lg-edge absolute inset-x-0 top-full z-50 mt-2.5 overflow-hidden p-2 tab:-inset-x-6"
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.1 } }}
            transition={{ type: 'spring', stiffness: 420, damping: 26 }}
          >
            {results.map((r, i) => (
              <li
                key={r.to}
                id={`${id}-${i}`}
                role="option"
                aria-selected={i === at}
                className="flex cursor-pointer items-center justify-between gap-4 rounded-2xl px-4 py-2.5 aria-selected:bg-violet aria-selected:text-white"
                onPointerEnter={() => setAt(i)}
                onPointerDown={(e) => {
                  e.preventDefault(); // keep focus until navigation
                  choose(r.to);
                }}
              >
                <span className="truncate font-medium">{r.label}</span>
                <span className="text-sm opacity-80">{r.kind}</span>
              </li>
            ))}
            {results.length === 0 && (
              <li role="option" aria-selected={false} aria-disabled className="px-4 py-3 text-ink-soft">
                {t('Nothing matches “{query}”.', { query: query.trim() })}
              </li>
            )}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
