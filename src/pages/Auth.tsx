import { useState, type FormEvent } from 'react';
import { ArrowRight, Lock, Mail, User } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { Link, useNavigate } from 'react-router';
import { LanguageSelector } from '../components/LanguageSelector';
import { Logo } from '../components/Logo';
import { NeedsIntegration } from '../components/SampleTag';
import { LiquidGlassButton } from '../glass/LiquidGlassButton';
import { LiquidGlassInput } from '../glass/LiquidGlassInput';
import { Aurora } from '../glass/LiquidGlassShell';
import { useI18n } from '../lib/i18n';
import { setProfile } from '../lib/store';
import { checkEmail, checkName, checkPassword } from '../lib/validate';
import { useWorkspace } from '../lib/workspace';
import { api, NotConnected } from '../services';

type Field = 'name' | 'email' | 'password';

export default function Auth({ mode }: { mode: 'login' | 'register' }) {
  const { t } = useI18n();
  const go = useNavigate();
  const { retry } = useWorkspace();
  const joining = mode === 'register';
  const [values, setValues] = useState({ name: '', email: '', password: '' });
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [problem, setProblem] = useState<'' | 'offline' | 'rejected'>('');
  const [busy, setBusy] = useState(false);

  const check = (f: Field) =>
    ({
      name: () => (joining ? checkName(values.name) : ''),
      email: () => checkEmail(values.email),
      // Signing in must accept whatever password the account already has.
      password: () => (joining ? checkPassword(values.password) : values.password ? '' : 'Enter your password.'),
    })[f]();

  const field = (f: Field) => ({
    name: f,
    value: values[f],
    error: errors[f] && t(errors[f]),
    onChange: (e: { target: { value: string } }) => {
      setValues({ ...values, [f]: e.target.value });
      setErrors({ ...errors, [f]: '' });
    },
    onBlur: () => values[f] && setErrors({ ...errors, [f]: check(f) }),
  });

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const found = { name: check('name'), email: check('email'), password: check('password') };
    setErrors(found);
    const bad = (['name', 'email', 'password'] as const).find((f) => found[f]);
    if (bad) {
      e.currentTarget.querySelector<HTMLInputElement>(`[name=${bad}]`)?.focus();
      return;
    }
    setBusy(true);
    setProblem('');
    try {
      if (joining) await api.register(values.name.trim(), values.email.trim(), values.password);
      else await api.login(values.email.trim(), values.password);
      retry(); // records now belong to the signed-in learner
      go(joining ? '/onboarding' : '/dashboard');
    } catch (err) {
      setProblem(err instanceof NotConnected ? 'offline' : 'rejected');
    }
    setBusy(false);
  };

  /** Without the API there is no account. Only the name and email stay, on this device; the password is dropped. */
  const continueHere = () => {
    if (joining) setProfile({ name: values.name.trim(), email: values.email.trim() });
    go(joining ? '/onboarding' : '/dashboard');
  };

  return (
    <div className="auth">
      <title>{`${joining ? t('Create your account') : t('Log in')} · WORKISM`}</title>
      <Aurora live />
      <header className="flex items-center justify-between gap-4">
        <Link to="/" aria-label={t('WORKISM home')} className="rounded-full">
          <Logo className="text-[1.45rem]" />
        </Link>
        <LanguageSelector />
      </header>
      <main className="auth-main">
        <div className="auth-art" aria-hidden>
          <span className="lg-orb floaty" style={{ ['--orb' as string]: '#a679ff', width: '13rem', height: '13rem' }} />
          <span className="lg-orb floaty [animation-delay:-2s]" style={{ ['--orb' as string]: '#6ecdf6', width: '7.5rem', height: '7.5rem' }} />
          <span className="lg-orb floaty [animation-delay:-4s]" style={{ ['--orb' as string]: '#f09cc8', width: '4.6rem', height: '4.6rem' }} />
        </div>
        <motion.section
          className="lg-panel lg-edge lg-light auth-card"
          initial={{ opacity: 0, y: 30, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: 'spring', stiffness: 140, damping: 18 }}
        >
          <h1 className="text-[2rem] leading-tight font-bold tracking-[-0.02em]">{joining ? t('Create your account') : t('Welcome back')}</h1>
          <p className="mt-1 mb-6 text-ink-soft">{joining ? t('A few details, then we map your skills.') : t('Pick up where you left off.')}</p>
          <form noValidate onSubmit={submit} className="grid gap-4">
            {joining && <LiquidGlassInput label={t('Name')} icon={<User aria-hidden />} autoComplete="name" {...field('name')} />}
            <LiquidGlassInput label={t('Email')} type="email" icon={<Mail aria-hidden />} autoComplete="email" inputMode="email" {...field('email')} />
            <LiquidGlassInput
              label={t('Password')}
              type="password"
              icon={<Lock aria-hidden />}
              autoComplete={joining ? 'new-password' : 'current-password'}
              hint={joining ? t('At least 8 characters, with a letter and a number.') : undefined}
              {...field('password')}
            />
            <AnimatePresence>
              {problem && (
                <motion.div role="alert" className="grid gap-3" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                  <NeedsIntegration>
                    {problem === 'rejected'
                      ? t('That did not work. Check your details and try again.')
                      : joining
                        ? t('Accounts are not connected yet, so nothing was sent. You can continue on this device; your password is not kept.')
                        : t('Sign-in is not connected yet, so nothing was sent. You can look around with sample data.')}
                  </NeedsIntegration>
                  {problem === 'offline' && (
                    <LiquidGlassButton onClick={continueHere}>{joining ? t('Continue on this device') : t('Explore with sample data')}</LiquidGlassButton>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
            <LiquidGlassButton variant="primary" size="lg" type="submit" loading={busy} className="mt-1 w-full" icon={<ArrowRight className="order-1 rtl:-scale-x-100" aria-hidden />}>
              {joining ? t('Create account') : t('Log in')}
            </LiquidGlassButton>
          </form>
          <p className="mt-6 text-center">
            {joining ? t('Already have an account?') : t('New to WORKISM?')}{' '}
            <Link to={joining ? '/login' : '/register'} className="font-semibold text-violet-deep underline-offset-4 hover:underline">
              {joining ? t('Log in') : t('Create an account')}
            </Link>
          </p>
        </motion.section>
      </main>
    </div>
  );
}
