import { CodeXml, ListChecks } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { SampleTag } from '../components/SampleTag';
import { CHALLENGES } from '../data/challenges';
import { Chip, Orb } from '../glass/controls';
import { LiquidGlassButton } from '../glass/LiquidGlassButton';
import { LiquidGlassPanel } from '../glass/LiquidGlassPanel';
import { useI18n } from '../lib/i18n';
import { PASS_MARK } from '../lib/progress';
import { useStore } from '../lib/store';
import { skillColor, useWorkspace } from '../lib/workspace';
import { QUIZ_MINUTES } from './Quiz';

export default function Assessments() {
  const { t, number, percent, date } = useI18n();
  const { skills, courses } = useWorkspace();
  const quiz = useStore((s) => s.quiz);
  const code = useStore((s) => s.code);
  const quizzes = skills.flatMap((skill) => {
    const questions = courses.filter((c) => c.skill === skill.id).flatMap((c) => c.modules.flatMap((m) => m.lessons)).length;
    return questions ? [{ skill, questions }] : [];
  });

  return (
    <>
      <PageHeader title={t('Assessments')} subtitle={t('Practice results stay on this device and replace the matching sample score.')}>
        <SampleTag />
      </PageHeader>
      <h2 className="mb-3 px-1 text-xl font-bold">{t('Quizzes')}</h2>
      <ul className="mb-8 grid gap-5 tab:grid-cols-2 desk:grid-cols-3">
        {quizzes.map(({ skill, questions }, i) => {
          const result = quiz[skill.id];
          return (
            <li key={skill.id}>
              <LiquidGlassPanel className="flex h-full flex-col gap-4" transition={{ type: 'spring', stiffness: 150, damping: 20, delay: i * 0.05 }}>
                <div className="flex items-center gap-4">
                  <Orb color={skillColor(skills, skill.id)} size="3.4rem">
                    <ListChecks className="size-[46%]" aria-hidden />
                  </Orb>
                  <div>
                    <h3 className="text-lg font-bold">{skill.name}</h3>
                    <p className="text-[0.9375rem] text-ink-soft">{t('{n} questions, {m} minutes', { n: number(questions), m: number(QUIZ_MINUTES) })}</p>
                  </div>
                </div>
                <div className="mt-auto flex items-center justify-between gap-3">
                  {result ? (
                    <Chip tone={result.percent >= PASS_MARK ? 'good' : 'warn'}>
                      {percent(result.percent)} · {date(result.at)}
                    </Chip>
                  ) : (
                    <Chip>{t('Not taken')}</Chip>
                  )}
                  <LiquidGlassButton size="sm" variant={result ? 'secondary' : 'primary'} to={`/assessments/quiz/${skill.id}`} aria-label={`${result ? t('Retake') : t('Start')}: ${skill.name}`}>
                    {result ? t('Retake') : t('Start')}
                  </LiquidGlassButton>
                </div>
              </LiquidGlassPanel>
            </li>
          );
        })}
      </ul>
      <h2 className="mb-3 px-1 text-xl font-bold">{t('Coding challenges')}</h2>
      <ul className="grid gap-5 tab:grid-cols-2">
        {CHALLENGES.map((c) => {
          const result = code[c.id];
          return (
            <li key={c.id}>
              <LiquidGlassPanel className="flex h-full flex-col gap-4" tint="rgb(206 190 255 / .5)">
                <div className="flex items-center gap-4">
                  <Orb color="#8a63fb" size="3.4rem">
                    <CodeXml className="size-[46%]" aria-hidden />
                  </Orb>
                  <div>
                    <h3 className="text-lg font-bold">{c.title}</h3>
                    <p className="text-[0.9375rem] text-ink-soft">{t('{n} tests, about {m} minutes', { n: number(c.tests.length), m: number(c.minutes) })}</p>
                  </div>
                </div>
                <div className="mt-auto flex items-center justify-between gap-3">
                  {result ? (
                    <Chip tone={result.passed === result.total ? 'good' : 'warn'}>{t('{n} of {total} tests passed', { n: number(result.passed), total: number(result.total) })}</Chip>
                  ) : (
                    <Chip>{t('Not taken')}</Chip>
                  )}
                  <LiquidGlassButton size="sm" variant={result ? 'secondary' : 'primary'} to={`/assessments/code/${c.id}`} aria-label={t('Open {title}', { title: c.title })}>
                    {t('Open')}
                  </LiquidGlassButton>
                </div>
              </LiquidGlassPanel>
            </li>
          );
        })}
      </ul>
    </>
  );
}
