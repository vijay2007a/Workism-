import { useId, useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useI18n } from '../lib/i18n';
import { LiquidGlassButton } from './LiquidGlassButton';

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  icon?: ReactNode;
  error?: string;
  hint?: string;
}

export function LiquidGlassInput({ label, icon, error, hint, type = 'text', className, ...rest }: Props) {
  const { t } = useI18n();
  const id = useId();
  const [shown, setShown] = useState(false);
  const note = error || hint;
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block ps-4 text-[0.9375rem] font-medium">
        {label}
      </label>
      <div className="lg-field" data-invalid={error ? true : undefined}>
        {icon}
        <input
          {...rest}
          id={id}
          type={type === 'password' && shown ? 'text' : type}
          aria-invalid={error ? true : undefined}
          aria-describedby={note ? `${id}-note` : undefined}
        />
        {type === 'password' && (
          <LiquidGlassButton
            variant="icon"
            size="sm"
            className="-me-2"
            aria-label={shown ? t('Hide password') : t('Show password')}
            aria-pressed={shown}
            icon={shown ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
            onClick={() => setShown(!shown)}
          />
        )}
      </div>
      {note && (
        <p id={`${id}-note`} className={error ? 'mt-1.5 ps-4 text-sm font-medium text-bad' : 'mt-1.5 ps-4 text-sm text-ink-soft'}>
          {note}
        </p>
      )}
    </div>
  );
}
