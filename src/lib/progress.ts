export interface LessonRef { id: string }
export interface CourseShape<L extends LessonRef = LessonRef> { modules: readonly { lessons: readonly L[] }[] }

const lessonsOf = <L extends LessonRef>(course: CourseShape<L>) => course.modules.flatMap((m) => m.lessons);

/** Modules finished, plus a lesson-level percentage so the bar moves after every lesson. */
export function courseProgress(course: CourseShape, done: readonly string[]) {
  const lessons = lessonsOf(course);
  const finished = lessons.filter((l) => done.includes(l.id)).length;
  return {
    done: course.modules.filter((m) => m.lessons.length > 0 && m.lessons.every((l) => done.includes(l.id))).length,
    total: course.modules.length,
    percent: lessons.length ? Math.round((finished / lessons.length) * 100) : 0,
  };
}

export const nextLesson = <L extends LessonRef>(course: CourseShape<L>, done: readonly string[]) =>
  lessonsOf(course).find((l) => !done.includes(l.id));

export type LessonState = 'done' | 'current' | 'locked';

export function lessonState(course: CourseShape, done: readonly string[], id: string): LessonState {
  if (done.includes(id)) return 'done';
  return nextLesson(course, done)?.id === id ? 'current' : 'locked';
}

export function gradeQuiz(questions: readonly { answer: number }[], answers: readonly (number | undefined)[]) {
  const correct = questions.filter((q, i) => answers[i] === q.answer).length;
  return { correct, total: questions.length, percent: questions.length ? Math.round((correct / questions.length) * 100) : 0 };
}

export interface QuizResult { percent: number; at: number }
export type SkillSource = 'sample' | 'practice' | 'api';

/** A practice result from this device outranks a sample value, and is labelled as such. */
export const withResults = <S extends { id: string; score: number; source: SkillSource }>(skills: readonly S[], quiz: Record<string, QuizResult>): S[] =>
  skills.map((s) => (s.source === 'sample' && quiz[s.id] ? { ...s, score: quiz[s.id].percent, source: 'practice' } : s));

export type CertificateState = 'verified' | 'pending' | 'revoked' | 'preview';

/** Nothing reads as issued unless the API said so. */
export const certificateStatus = (c: { status: 'verified' | 'pending' | 'revoked'; source: 'sample' | 'api' }): CertificateState =>
  c.source === 'api' ? c.status : 'preview';

export type ProjectStage = 'new' | 'saved' | 'submitted' | 'evaluating' | 'evaluated' | 'verified';

/** 'saved' means kept on this device only: the evaluation service has not received it. */
export const projectStage = (project: { status?: Exclude<ProjectStage, 'new' | 'saved'> }, saved?: object): ProjectStage =>
  project.status ?? (saved ? 'saved' : 'new');

export const PASS_MARK = 70;

export const certificateSteps = (course: CourseShape, done: readonly string[], quiz: QuizResult | undefined, project: { status?: string }) => [
  { id: 'course' as const, done: courseProgress(course, done).percent === 100 },
  { id: 'assessment' as const, done: (quiz?.percent ?? 0) >= PASS_MARK },
  { id: 'project' as const, done: project.status === 'verified' },
];
