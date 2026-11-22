import { useState, type FormEvent } from 'react';
import { Check, CircleDashed, GitBranch, Send } from 'lucide-react';
import { useParams } from 'react-router';
import { GitHubConnect } from '../components/GitHubConnect';
import { PageHeader } from '../components/PageHeader';
import { ProjectTimeline, STAGE_TEXT } from '../components/ProjectLabCard';
import { NeedsIntegration, SampleTag } from '../components/SampleTag';
import { Chip } from '../glass/controls';
import { useToast } from '../glass/GlassToast';
import { LiquidGlassButton } from '../glass/LiquidGlassButton';
import { LiquidGlassInput } from '../glass/LiquidGlassInput';
import { LiquidGlassModal } from '../glass/LiquidGlassModal';
import { LiquidGlassPanel } from '../glass/LiquidGlassPanel';
import { ScoreRing } from '../glass/LiquidProgressBar';
import { useI18n } from '../lib/i18n';
import { projectStage } from '../lib/progress';
import { notify, saveSubmission, useStore } from '../lib/store';
import { checkRepo } from '../lib/validate';
import { useWorkspace } from '../lib/workspace';
import { api, NotConnected } from '../services';
import NotFound from './NotFound';

export default function ProjectPage() {
  const { t, percent, date } = useI18n();
  const { id = '' } = useParams();
  const { projects, retry } = useWorkspace();
  const project = projects.find((p) => p.id === id);
  const saved = useStore((s) => s.submissions[id]);
  const toast = useToast();
  const [repo, setRepo] = useState(saved?.repo ?? '');
  const [note, setNote] = useState(saved?.note ?? '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  if (!project) return <NotFound inside />;
  const stage = projectStage(project, saved);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const problem = checkRepo(repo);
    setError(problem);
    if (problem) return;
    setBusy(true);
    const link = repo.trim();
    try {
      await api.submitProject(project.id, link, note.trim());
      toast(t('Submitted for evaluation'));
      retry();
    } catch (err) {
      if (err instanceof NotConnected) {
        saveSubmission(project.id, link, note.trim());
        notify({ id: `project-${project.id}`, text: 'Your project is saved on this device. It has not been sent for evaluation.', to: `/labs/${project.id}` });
        toast(t('Saved on this device'), 'info');
      } else {
        setError('The submission did not go through. Your link is still here; try again.');
      }
    }
    setBusy(false);
  };

  return (
    <>
      <PageHeader title={project.title} subtitle={project.brief} back={{ to: '/labs', label: t('Project Labs') }}>
        <SampleTag />
        <Chip tone={STAGE_TEXT[stage].tone}>{t(STAGE_TEXT[stage].label)}</Chip>
      </PageHeader>
      <div className="grid items-start gap-5 desk:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="grid gap-5">
          <LiquidGlassPanel title={t('Requirements')}>
            <ul className="grid gap-2.5">
              {project.requirements.map((r) => (
                <li key={r} className="flex gap-3">
                  <CircleDashed className="mt-0.5 size-5 flex-none text-violet" strokeWidth={1.7} aria-hidden />
                  {r}
                </li>
              ))}
            </ul>
            <h3 className="mt-6 mb-2.5 font-semibold">{t('Scored on')}</h3>
            <div className="flex flex-wrap gap-2">
              {project.rubric.map((r) => (
                <Chip key={r}>{r}</Chip>
              ))}
            </div>
          </LiquidGlassPanel>

          <LiquidGlassPanel title={t('Submit your work')} tint="rgb(206 190 255 / .5)">
            <form onSubmit={submit} noValidate className="grid gap-4">
              <LiquidGlassInput label={t('Repository link')} type="url" icon={<GitBranch aria-hidden />} placeholder="https://github.com/you/project" spellCheck={false} value={repo} error={error && t(error)} onChange={(e) => setRepo(e.target.value)} />
              <LiquidGlassButton size="sm" className="justify-self-start" onClick={() => setPicking(true)}>
                {t('Pick from my GitHub')}
              </LiquidGlassButton>
              <div>
                <label htmlFor="note" className="mb-1.5 block ps-4 text-[0.9375rem] font-medium">
                  {t('Notes for the reviewer (optional)')}
                </label>
                <div className="lg-field">
                  <textarea id="note" rows={3} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-4">
                <LiquidGlassButton variant="primary" type="submit" loading={busy} icon={<Send className="rtl:-scale-x-100" aria-hidden />}>
                  {saved ? t('Update submission') : t('Submit project')}
                </LiquidGlassButton>
                {saved && <p className="text-sm text-ink-soft">{t('Saved {date}', { date: date(saved.at, { dateStyle: 'medium', timeStyle: 'short' }) })}</p>}
              </div>
              {stage === 'saved' && <NeedsIntegration>{t('The evaluation service is not connected, so this project is kept here and has not been sent.')}</NeedsIntegration>}
            </form>
          </LiquidGlassPanel>
        </div>

        <div className="grid gap-5">
          <LiquidGlassPanel title={t('Progress')} tint="rgb(190 226 255 / .55)">
            <ProjectTimeline stage={stage} size="4rem" />
          </LiquidGlassPanel>
          <LiquidGlassPanel title={t('Evaluation')}>
            {project.score !== undefined ? (
              <div className="flex items-center gap-5">
                <ScoreRing value={project.score} color="#6a48ec" className="size-24" />
                <p>
                  <span className="block text-4xl font-bold">{percent(project.score)}</span>
                  <span className="text-ink-soft">{t('Overall score')}</span>
                </p>
              </div>
            ) : (
              <div className="flex items-center gap-5 text-ink-soft">
                <ScoreRing value={0} color="#6a48ec" className="size-20" />
                <p>{t('Your score appears here once the project has been evaluated.')}</p>
              </div>
            )}
            <h3 className="mt-6 mb-2 font-semibold text-ink">{t('Feedback')}</h3>
            <p className="whitespace-pre-line text-ink-soft">{project.feedback ?? t('No feedback yet.')}</p>
          </LiquidGlassPanel>
        </div>
      </div>

      <LiquidGlassModal open={picking} onClose={() => setPicking(false)} title={t('Pick a repository')}>
        <GitHubConnect
          action={(r) => (
            <LiquidGlassButton
              size="sm"
              icon={<Check aria-hidden />}
              aria-label={t('Use {name}', { name: r.name })}
              onClick={() => {
                setRepo(r.html_url);
                setError('');
                setPicking(false);
              }}
            >
              {t('Use')}
            </LiquidGlassButton>
          )}
        />
      </LiquidGlassModal>
    </>
  );
}
