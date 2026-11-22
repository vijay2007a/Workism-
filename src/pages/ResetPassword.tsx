import { useState, type FormEvent } from 'react';
import { ArrowRight, Lock } from 'lucide-react';
import { Link, useNavigate } from 'react-router';
import { Logo } from '../components/Logo';
import { LiquidGlassButton } from '../glass/LiquidGlassButton';
import { LiquidGlassInput } from '../glass/LiquidGlassInput';
import { LiquidGlassPanel } from '../glass/LiquidGlassPanel';
import { Aurora } from '../glass/LiquidGlassShell';
import { useI18n } from '../lib/i18n';
import { checkPassword } from '../lib/validate';
import { api } from '../services';

export default function ResetPassword() {
  const { t } = useI18n();
  const go = useNavigate();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const issue = checkPassword(password);
    if (issue) return setError(issue);
    setBusy(true);
    setError('');
    try {
      await api.resetPassword(password);
      setDone(true);
    } catch {
      setError('Could not reset your password. Open the recovery link from your email again.');
    }
    setBusy(false);
  };

  return (
    <div className="auth">
      <title>{`Reset password · WORKISM`}</title>
      <Aurora live />
      <header className="flex items-center justify-between gap-4">
        <Link to="/" aria-label={t('WORKISM home')} className="rounded-full">
          <Logo className="text-[1.45rem]" />
        </Link>
      </header>
      <main className="grid flex-1 place-items-center py-8">
        <LiquidGlassPanel className="w-full max-w-md p-7!">
          <h1 className="text-2xl font-bold">Choose a new password</h1>
          {done ? (
            <div className="mt-4 grid gap-4">
              <p className="text-ink-soft">Your password has been updated.</p>
              <LiquidGlassButton variant="primary" onClick={() => go('/login')}>{t('Log in')}</LiquidGlassButton>
            </div>
          ) : (
            <form onSubmit={submit} noValidate className="mt-5 grid gap-4">
              <LiquidGlassInput
                label={t('Password')}
                type="password"
                icon={<Lock aria-hidden />}
                autoComplete="new-password"
                hint={t('At least 8 characters, with a letter and a number.')}
                value={password}
                error={error && t(error)}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError('');
                }}
              />
              <LiquidGlassButton variant="primary" type="submit" loading={busy} icon={<ArrowRight className="order-1" aria-hidden />}>
                Update password
              </LiquidGlassButton>
            </form>
          )}
        </LiquidGlassPanel>
      </main>
    </div>
  );
}
