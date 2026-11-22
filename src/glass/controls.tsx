import { useId, type CSSProperties, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../lib/cn';

export function Orb({ color, size = '4.75rem', className, children }: { color: string; size?: string; className?: string; children?: ReactNode }) {
  return (
    <span className={cn('lg-orb', className)} style={{ '--orb': color, width: size, height: size } as CSSProperties}>
      {children}
    </span>
  );
}

export function Chip({ tone, icon, className, children }: { tone?: 'good' | 'warn' | 'violet'; icon?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <span className={cn('lg-chip', className)} data-tone={tone}>
      {icon}
      {children}
    </span>
  );
}

export function GlassSwitch({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-5 py-2">
      <div>
        <p id={id} className="font-medium">
          {label}
        </p>
        {hint && <p className="text-sm text-ink-soft">{hint}</p>}
      </div>
      <button type="button" role="switch" aria-checked={checked} aria-labelledby={id} className="lg-switch" onClick={() => onChange(!checked)}>
        <i />
      </button>
    </div>
  );
}

export function GlassSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: readonly (readonly [value: string, label: string])[] }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block ps-4 text-[0.9375rem] font-medium">
        {label}
      </label>
      <div className="lg-field">
        <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
          {options.map(([v, text]) => (
            <option key={v} value={v}>
              {text}
            </option>
          ))}
        </select>
        <ChevronDown aria-hidden />
      </div>
    </div>
  );
}

/** Single or multiple choice, as capsules. */
export function Choices({ label, options, value, onChange }: { label: string; options: readonly (readonly [value: string, label: string])[]; value: readonly string[]; onChange: (v: string) => void }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2.5">
      {options.map(([v, text]) => (
        <button key={v} type="button" className="lg-chip lg-choice" aria-pressed={value.includes(v)} onClick={() => onChange(v)}>
          {text}
        </button>
      ))}
    </div>
  );
}
