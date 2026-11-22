import { Check, Circle } from 'lucide-react';
import { CertificatePreview } from '../components/CertificateCard';
import { PageHeader } from '../components/PageHeader';
import { SampleTag } from '../components/SampleTag';
import { LiquidGlassButton } from '../glass/LiquidGlassButton';
import { LiquidGlassPanel } from '../glass/LiquidGlassPanel';
import { useI18n } from '../lib/i18n';
import { certificateSteps, PASS_MARK } from '../lib/progress';
import { useStore } from '../lib/store';
import { useWorkspace } from '../lib/workspace';
import type { Certificate } from '../services';

export function useCertificateSteps(certificate: Certificate) {
  const { t, percent } = useI18n();
  const { courses, projects, lessonsDone, skills } = useWorkspace();
  const quiz = useStore((s) => s.quiz);
  const course = courses.find((c) => c.id === certificate.course);
  const project = projects.find((p) => p.id === certificate.project);
  const skill = skills.find((s) => s.id === certificate.skill);
  const text = {
    course: { label: t('Finish {title}', { title: course?.title ?? '' }), to: `/learn/${certificate.course}` },
    assessment: { label: t('Score {p} in the {skill} quiz', { p: percent(PASS_MARK), skill: skill?.name ?? '' }), to: `/assessments/quiz/${certificate.skill}` },
    project: { label: t('Verify {title}', { title: project?.title ?? '' }), to: `/labs/${certificate.project}` },
  };
  return certificateSteps(course ?? { modules: [] }, lessonsDone, quiz[certificate.skill], project ?? {}).map((s) => ({ ...s, ...text[s.id] }));
}

export function CertificateChecklist({ certificate }: { certificate: Certificate }) {
  const { t } = useI18n();
  return (
    <ul className="grid gap-2.5">
      {useCertificateSteps(certificate).map(({ id, done, label }) => (
        <li key={id} className="flex items-start gap-3">
          {done ? (
            <span className="mt-0.5 grid size-5 flex-none place-items-center rounded-full bg-good text-white">
              <Check className="size-3.5" strokeWidth={3} aria-label={t('Done')} />
            </span>
          ) : (
            <Circle className="mt-0.5 size-5 flex-none text-ink-soft" strokeWidth={1.6} aria-label={t('To do')} />
          )}
          <span className={done ? undefined : 'text-ink-soft'}>{label}</span>
        </li>
      ))}
    </ul>
  );
}

export default function Certificates() {
  const { t } = useI18n();
  const { certificates } = useWorkspace();
  return (
    <>
      <PageHeader title={t('Certificates')} subtitle={t('Issued by WORKISM once all three requirements are met and checked.')}>
        <SampleTag />
      </PageHeader>
      <ul className="grid gap-5 desk:grid-cols-2">
        {certificates.map((c, i) => (
          <li key={c.id}>
            <LiquidGlassPanel className="flex h-full flex-col gap-5" tint="rgb(150 214 250 / .55)" transition={{ type: 'spring', stiffness: 150, damping: 20, delay: i * 0.05 }}>
              <CertificatePreview certificate={c} />
              <CertificateChecklist certificate={c} />
              <LiquidGlassButton className="mt-auto w-full" to={`/certificates/${c.id}`} aria-label={`${t('View certificate')}: ${t(c.title)}`}>
                {t('View certificate')}
              </LiquidGlassButton>
            </LiquidGlassPanel>
          </li>
        ))}
      </ul>
    </>
  );
}
