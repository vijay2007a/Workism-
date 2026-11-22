import { useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowRight, Check, User } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { Link, useNavigate } from 'react-router';
import { LanguageList, LanguageSelector } from '../components/LanguageSelector';
import { Logo } from '../components/Logo';
import { GOALS, INTERESTS, PACES, STYLES, type Option } from '../data/choices';
import { Choices } from '../glass/controls';
import { LiquidGlassButton } from '../glass/LiquidGlassButton';
import { LiquidGlassInput } from '../glass/LiquidGlassInput';
import { Aurora } from '../glass/LiquidGlassShell';
import { LiquidProgressBar } from '../glass/LiquidProgressBar';
import { useAuth } from '../lib/auth';
import { useI18n } from '../lib/i18n';
import { notify, setProfile, useStore } from '../lib/store';
import { checkName } from '../lib/validate';
import { api } from '../services';

const STEPS = ['What are you working towards?', 'Which skills interest you?', 'How do you like to learn?', 'Which language should WORKISM use?'];

export default function Onboarding() {
  const { t, number, lang } = useI18n();
  const { authenticated } = useAuth();
  const go = useNavigate();
  const profile = useStore((s) => s.profile);
  const [step, setStep] = useState(0);
  const [forward, setForward] = useState(true);
  const [nameError, setNameError] = useState('');
  const last = step === STEPS.length - 1;
  const translated = (list: Option[]) => list.map(([v, label]) => [v, t(label)] as const);
  const toggle = (v: string) => setProfile({ interests: profile.interests.includes(v) ? profile.interests.filter((x) => x !== v) : [...profile.interests, v] });

  const move = (to: number) => {
    setForward(to > step);
    setStep(to);
  };
  const next = (e: FormEvent) => {
    e.preventDefault();
    if (step === 0) {
      const problem = checkName(profile.name);
      setNameError(problem);
      if (problem) return;
    }
    if (!last) return move(step + 1);
    setProfile({ name: profile.name.trim() });
    if (authenticated) {
      void api.updateProfile({
        displayName: profile.name.trim(),
        careerGoal: profile.goal,
        interests: profile.interests,
        learningStyle: profile.style,
        learningPace: profile.pace,
        preferredLanguage: lang,
      }).catch(() => {});
    }
    notify({ id: 'onboarded', text: 'Your preferences are saved. Take an assessment to replace the sample scores.', to: '/assessments' });
    go('/dashboard');
  };

  return (
    <div className="auth">
      <title>{`${t(STEPS[step])} · WORKISM`}</title>
      <Aurora live />
      <header className="flex items-center justify-between gap-4">
        <Link to="/" aria-label={t('WORKISM home')} className="rounded-full">
          <Logo className="text-[1.45rem]" />
        </Link>
        <LanguageSelector />
      </header>
      <main className="grid flex-1 place-items-center py-8">
        <motion.section
          className="lg-panel lg-edge w-full max-w-2xl p-6 tab:p-9"
          initial={{ opacity: 0, y: 30, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: 'spring', stiffness: 140, damping: 18 }}
        >
          <p className="mb-2 font-medium text-ink-soft">{t('Step {n} of {total}', { n: number(step + 1), total: number(STEPS.length) })}</p>
          <LiquidProgressBar value={((step + 1) / STEPS.length) * 100} label={t('Setup progress')} />
          <form onSubmit={next} noValidate>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={step}
                className="min-h-80 pt-8"
                initial={{ opacity: 0, x: forward ? 40 : -40 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: forward ? -30 : 30, transition: { duration: 0.12 } }}
                transition={{ type: 'spring', stiffness: 260, damping: 24 }}
              >
                <h1 className="mb-6 text-[clamp(1.6rem,4vw,2.1rem)] leading-tight font-bold tracking-[-0.02em] text-balance">{t(STEPS[step])}</h1>
                {step === 0 && (
                  <div className="grid gap-6">
                    <LiquidGlassInput
                      label={t('What should we call you?')}
                      icon={<User aria-hidden />}
                      autoComplete="given-name"
                      value={profile.name}
                      error={nameError && t(nameError)}
                      onChange={(e) => {
                        setProfile({ name: e.target.value });
                        setNameError('');
                      }}
                    />
                    <Choices label={t('Career goal')} options={translated(GOALS)} value={[profile.goal]} onChange={(goal) => setProfile({ goal })} />
                  </div>
                )}
                {step === 1 && <Choices label={t('Skill interests')} options={translated(INTERESTS)} value={profile.interests} onChange={toggle} />}
                {step === 2 && (
                  <div className="grid gap-6">
                    <div>
                      <h2 className="mb-3 font-semibold">{t('Style')}</h2>
                      <Choices label={t('Style')} options={translated(STYLES)} value={[profile.style]} onChange={(style) => setProfile({ style })} />
                    </div>
                    <div>
                      <h2 className="mb-3 font-semibold">{t('Pace')}</h2>
                      <Choices label={t('Pace')} options={translated(PACES)} value={[profile.pace]} onChange={(pace) => setProfile({ pace })} />
                    </div>
                  </div>
                )}
                {step === 3 && <LanguageList />}
              </motion.div>
            </AnimatePresence>
            <div className="mt-6 flex justify-between gap-3">
              {step > 0 ? (
                <LiquidGlassButton onClick={() => move(step - 1)} icon={<ArrowLeft className="rtl:-scale-x-100" aria-hidden />}>
                  {t('Back')}
                </LiquidGlassButton>
              ) : (
                <LiquidGlassButton variant="ghost" to="/dashboard">
                  {t('Skip for now')}
                </LiquidGlassButton>
              )}
              <LiquidGlassButton variant="primary" type="submit" icon={last ? <Check className="order-1" aria-hidden /> : <ArrowRight className="order-1 rtl:-scale-x-100" aria-hidden />}>
                {last ? t('Finish') : t('Next')}
              </LiquidGlassButton>
            </div>
          </form>
        </motion.section>
      </main>
    </div>
  );
}
