import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Logo } from '../components/Logo';
import { LiquidGlassButton } from '../glass/LiquidGlassButton';
import { LiquidGlassPanel } from '../glass/LiquidGlassPanel';
import { Aurora } from '../glass/LiquidGlassShell';
import { useAuth } from '../lib/auth';
import { useI18n } from '../lib/i18n';
import { supabase } from '../lib/supabase';
import { useWorkspace } from '../lib/workspace';

export default function AuthCallback() {
  const { t } = useI18n();
  const go = useNavigate();
  const { syncToken } = useAuth();
  const { retry } = useWorkspace();
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    async function finish() {
      if (!supabase) {
        go('/login', { replace: true });
        return;
      }
      const { data, error: err } = await supabase.auth.getSession();
      if (!live) return;
      if (err || !data.session) {
        setError(err?.message || 'Sign-in link expired or invalid. Please log in again.');
        return;
      }
      syncToken(data.session.access_token);
      retry();
      go('/dashboard', { replace: true });
    }
    void finish();
    return () => {
      live = false;
    };
  }, [go, retry, syncToken]);

  return (
    <div className="auth">
      <title>{`Auth · WORKISM`}</title>
      <Aurora />
      <header className="flex items-center justify-between gap-4">
        <Link to="/" aria-label={t('WORKISM home')} className="rounded-full">
          <Logo className="text-[1.45rem]" />
        </Link>
      </header>
      <main className="grid flex-1 place-items-center py-8">
        <LiquidGlassPanel className="w-full max-w-md text-center">
          {error ? (
            <>
              <h1 className="text-2xl font-bold">Could not complete sign-in</h1>
              <p className="mt-2 mb-5 text-ink-soft">{error}</p>
              <LiquidGlassButton variant="primary" to="/login">{t('Log in')}</LiquidGlassButton>
            </>
          ) : (
            <p className="text-ink-soft">{t('Loading')}…</p>
          )}
        </LiquidGlassPanel>
      </main>
    </div>
  );
}
