import { useState } from 'react';
import { CircleCheck, Download, Trash2, Unplug, User } from 'lucide-react';
import { useSearchParams } from 'react-router';
import { LanguageList } from '../components/LanguageSelector';
import { PageHeader } from '../components/PageHeader';
import { GOALS, INTERESTS, PACES, STYLES, type Option } from '../data/choices';
import { PROGRAMMING_LANGUAGES } from '../data/languages';
import { Chip, Choices, GlassSelect, GlassSwitch } from '../glass/controls';
import { useToast } from '../glass/GlassToast';
import { LiquidGlassButton } from '../glass/LiquidGlassButton';
import { LiquidGlassInput } from '../glass/LiquidGlassInput';
import { LiquidGlassModal } from '../glass/LiquidGlassModal';
import { LiquidGlassPanel } from '../glass/LiquidGlassPanel';
import { LiquidGlassTabs } from '../glass/LiquidGlassTabs';
import { useAuth } from '../lib/auth';
import { useI18n } from '../lib/i18n';
import { getState, resetState, setProfile, setSettings, useStore } from '../lib/store';
import { api, connected, INTEGRATIONS } from '../services';

const TABS = ['profile', 'preferences', 'language', 'appearance', 'notifications', 'privacy', 'integrations'] as const;
const NAMES: Record<(typeof TABS)[number], string> = {
  profile: 'Profile',
  preferences: 'Preferences',
  language: 'Language',
  appearance: 'Appearance',
  notifications: 'Notifications',
  privacy: 'Privacy',
  integrations: 'Integrations',
};

export default function Settings() {
  const { t } = useI18n();
  const [params, setParams] = useSearchParams();
  const tab = TABS.find((x) => x === params.get('tab')) ?? 'profile';
  const Section = { profile: Profile, preferences: Preferences, language: Language, appearance: Appearance, notifications: Notifications, privacy: Privacy, integrations: Integrations }[tab];
  return (
    <>
      <PageHeader title={t('Settings')} subtitle={t('Changes are saved on this device as you make them.')} />
      <LiquidGlassTabs label={t('Settings')} tabs={TABS.map((id) => ({ id, label: t(NAMES[id]) }))} value={tab} onChange={(id) => setParams({ tab: id }, { replace: true })}>
        <LiquidGlassPanel key={tab} className="max-w-3xl p-6! tab:p-8!">
          <Section />
        </LiquidGlassPanel>
      </LiquidGlassTabs>
    </>
  );
}

const Group = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="mb-7 last:mb-0">
    <h2 className="mb-3 font-semibold">{title}</h2>
    {children}
  </div>
);
const useTranslated = () => {
  const { t } = useI18n();
  return (list: readonly Option[]) => list.map(([v, label]) => [v, t(label)] as const);
};

function Profile() {
  const { t } = useI18n();
  const { authenticated } = useAuth();
  const toast = useToast();
  const tr = useTranslated();
  const p = useStore((s) => s.profile);
  const sync = async () => {
    if (!authenticated) return;
    try {
      await api.updateProfile({ displayName: p.name.trim(), careerGoal: p.goal, interests: p.interests });
      toast('Profile synced to account.');
    } catch {
      toast('Could not sync profile.', 'bad');
    }
  };
  return (
    <div className="grid gap-6">
      <LiquidGlassInput label={t('Name')} icon={<User aria-hidden />} autoComplete="name" maxLength={60} value={p.name} onChange={(e) => setProfile({ name: e.target.value })} />
      <Group title={t('Career goal')}>
        <Choices label={t('Career goal')} options={tr(GOALS)} value={[p.goal]} onChange={(goal) => setProfile({ goal })} />
      </Group>
      <Group title={t('Skill interests')}>
        <Choices
          label={t('Skill interests')}
          options={tr(INTERESTS)}
          value={p.interests}
          onChange={(v) => setProfile({ interests: p.interests.includes(v) ? p.interests.filter((x) => x !== v) : [...p.interests, v] })}
        />
      </Group>
      {authenticated && (
        <LiquidGlassButton variant="primary" className="justify-self-start" onClick={() => void sync()}>
          Save profile to account
        </LiquidGlassButton>
      )}
    </div>
  );
}

function Preferences() {
  const { t } = useI18n();
  const tr = useTranslated();
  const p = useStore((s) => s.profile);
  return (
    <>
      <Group title={t('Style')}>
        <Choices label={t('Style')} options={tr(STYLES)} value={[p.style]} onChange={(style) => setProfile({ style })} />
      </Group>
      <Group title={t('Pace')}>
        <Choices label={t('Pace')} options={tr(PACES)} value={[p.pace]} onChange={(pace) => setProfile({ pace })} />
      </Group>
      <GlassSelect
        label={t('Programming language')}
        value={p.codeLang}
        onChange={(codeLang) => setProfile({ codeLang })}
        options={[['', t('No preference')] as const, ...PROGRAMMING_LANGUAGES.map((l) => [l.id, l.name] as const)]}
      />
    </>
  );
}

function Language() {
  const { t } = useI18n();
  return (
    <>
      <LanguageList />
      <p className="mt-4 text-sm text-ink-soft">{t('Navigation, the dashboard and common actions are translated. Course material stays in English for now.')}</p>
    </>
  );
}

function Appearance() {
  const { t, percent } = useI18n();
  const s = useStore((x) => x.settings);
  return (
    <>
      <Group title={t('Glass')}>
        <div>
          <div className="mb-1 flex justify-between">
            <label htmlFor="frosting">{t('Frosting')}</label>
            <span className="font-semibold">{percent(s.clarity)}</span>
          </div>
          <input id="frosting" type="range" min={0} max={100} value={s.clarity} className="lg-slider" style={{ ['--fill' as string]: `${s.clarity}%` }} onChange={(e) => setSettings({ clarity: Number(e.target.value) })} />
          <div className="flex justify-between text-sm text-ink-soft">
            <span>{t('Clear')}</span>
            <span>{t('Frosted')}</span>
          </div>
        </div>
      </Group>
      <Group title={t('Effects')}>
        <Choices
          label={t('Effects')}
          options={[
            ['auto', t('Automatic')],
            ['full', t('Full')],
            ['light', t('Light')],
          ]}
          value={[s.effects]}
          onChange={(effects) => setSettings({ effects })}
        />
        <p className="mt-2 text-sm text-ink-soft">{t('Light turns off background blur and refraction to save battery.')}</p>
      </Group>
      <GlassSwitch label={t('Reduce motion')} hint={t('Also follows your system setting.')} checked={s.motion === 'reduced'} onChange={(on) => setSettings({ motion: on ? 'reduced' : 'auto' })} />
    </>
  );
}

function Notifications() {
  const { t } = useI18n();
  const on = useStore((s) => s.settings.notices);
  return (
    <>
      <GlassSwitch label={t('In-app notices')} hint={t('Quiz results, saved projects and finished courses, under the bell.')} checked={on} onChange={(notices) => setSettings({ notices })} />
      <p className="lg-inset mt-5 rounded-2xl px-4 py-3 text-[0.9375rem]">{t('Email and push reminders need the notification service, which is not connected.')}</p>
    </>
  );
}

function Privacy() {
  const { t } = useI18n();
  const toast = useToast();
  const [asking, setAsking] = useState(false);
  const showScores = useStore((s) => s.settings.showScores);
  const download = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(getState(), null, 2)], { type: 'application/json' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: 'workism-data.json' });
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <>
      <GlassSwitch label={t('Show scores on my portfolio')} checked={showScores} onChange={(v) => setSettings({ showScores: v })} />
      <div className="mt-6 grid gap-3 border-t border-white/60 pt-6 tab:grid-cols-2">
        <LiquidGlassButton icon={<Download aria-hidden />} onClick={download}>
          {t('Download my data')}
        </LiquidGlassButton>
        <LiquidGlassButton variant="danger" icon={<Trash2 aria-hidden />} onClick={() => setAsking(true)}>
          {t('Erase this device')}
        </LiquidGlassButton>
      </div>
      <LiquidGlassModal open={asking} onClose={() => setAsking(false)} title={t('Erase everything on this device?')}>
        <p className="mb-6 text-ink-soft">{t('Your name, preferences, lesson progress, quiz results and saved projects will be removed from this browser. This cannot be undone.')}</p>
        <div className="flex flex-wrap justify-end gap-3">
          <LiquidGlassButton onClick={() => setAsking(false)}>{t('Keep my data')}</LiquidGlassButton>
          <LiquidGlassButton
            variant="danger"
            icon={<Trash2 aria-hidden />}
            onClick={() => {
              resetState();
              setAsking(false);
              toast(t('This device has been erased'), 'info');
            }}
          >
            {t('Erase')}
          </LiquidGlassButton>
        </div>
      </LiquidGlassModal>
    </>
  );
}

function Integrations() {
  const { t } = useI18n();
  return (
    <>
      <p className="mb-5 text-ink-soft">{connected ? t('Connected to the WORKISM API.') : t('No backend is connected. Set VITE_API_URL and provide these endpoints.')}</p>
      <ul className="grid gap-3">
        {INTEGRATIONS.map((i) => (
          <li key={i.name} className="lg-inset flex flex-wrap items-center justify-between gap-x-4 gap-y-2 p-4">
            <div className="min-w-0">
              <p className="font-semibold">{t(i.name)}</p>
              <code dir="ltr" className="font-mono text-sm break-words text-ink-soft">
                {i.needs}
              </code>
              <p className="text-sm text-ink-soft">{t(i.used)}</p>
            </div>
            <Chip tone={connected ? 'good' : 'warn'} icon={connected ? <CircleCheck aria-hidden /> : <Unplug aria-hidden />}>
              {connected ? t('Connected') : t('Not connected')}
            </Chip>
          </li>
        ))}
      </ul>
    </>
  );
}
