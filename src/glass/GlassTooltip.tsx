import type { ReactNode } from 'react';

/** Repeats or expands the label of a control on hover and focus. The control must already have its own accessible name. */
export function GlassTooltip({ text, side = 'top', align, children }: { text: string; side?: 'top' | 'bottom'; align?: 'end'; children: ReactNode }) {
  return (
    <span className="lg-tip-host">
      {children}
      <span className="lg-tip" data-side={side} data-align={align} aria-hidden>
        {text}
      </span>
    </span>
  );
}
