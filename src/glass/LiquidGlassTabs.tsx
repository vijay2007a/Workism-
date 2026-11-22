import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { useI18n } from '../lib/i18n';

interface Props<T extends string> {
  label: string;
  tabs: readonly { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
  children?: ReactNode;
}

/** Tablist with a sliding drop of glass. Children are the panel for the current tab. */
export function LiquidGlassTabs<T extends string>({ label, tabs, value, onChange, children }: Props<T>) {
  const { dir } = useI18n();
  const id = useId();
  const list = useRef<HTMLDivElement>(null);

  // On narrow screens the list scrolls; keep the current tab in view.
  useEffect(() => {
    const el = list.current;
    const tab = el?.querySelector<HTMLElement>('[aria-selected=true]');
    if (el && tab && el.scrollWidth > el.clientWidth) void el.scrollTo({ left: tab.offsetLeft - (el.clientWidth - tab.offsetWidth) / 2 });
  }, [value]);

  const onKey = (e: KeyboardEvent) => {
    const i = tabs.findIndex((t) => t.id === value);
    const step = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
    const next = step ? (i + step * (dir === 'rtl' ? -1 : 1) + tabs.length) % tabs.length : { Home: 0, End: tabs.length - 1 }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    onChange(tabs[next].id);
    list.current?.querySelectorAll<HTMLElement>('[role=tab]')[next].focus();
  };

  return (
    <>
      <div ref={list} role="tablist" aria-label={label} className="lg-tabs" onKeyDown={onKey}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`${id}-${tab.id}`}
            aria-selected={tab.id === value}
            aria-controls={children ? `${id}-panel` : undefined}
            tabIndex={tab.id === value ? 0 : -1}
            className="lg-tab"
            onClick={() => onChange(tab.id)}
          >
            {tab.id === value && <motion.span layoutId={`${id}-thumb`} className="lg-tab-thumb" transition={{ type: 'spring', stiffness: 420, damping: 26 }} />}
            {tab.label}
          </button>
        ))}
      </div>
      {children && (
        <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-${value}`} className="mt-5">
          {children}
        </div>
      )}
    </>
  );
}
