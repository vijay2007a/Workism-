import { useCallback, useEffect, useState } from 'react';
import { Check, ShieldAlert } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { Chip } from '../glass/controls';
import { useToast } from '../glass/GlassToast';
import { LiquidGlassButton } from '../glass/LiquidGlassButton';
import { LiquidGlassPanel } from '../glass/LiquidGlassPanel';
import { useWorkspace } from '../lib/workspace';
import { api } from '../services';

interface SubmissionRow {
  id: string;
  projectId: string;
  userId: string;
  version: number;
  repoUrl: string | null;
  fileName: string | null;
  note: string;
  status: string;
  overallScore: number | null;
  createdAt: string;
}

export default function Instructor() {
  const { role } = useWorkspace();
  const toast = useToast();
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [submissions, setSubmissions] = useState<SubmissionRow[]>([]);
  const [feedback, setFeedback] = useState<Record<string, string>>({});
  const [score, setScore] = useState<Record<string, number>>({});
  const [error, setError] = useState('');

  const allowed = role === 'instructor' || role === 'admin';

  const load = useCallback(async () => {
    if (!allowed) return;
    try {
      const [ov, subs] = await Promise.all([api.instructorOverview(), api.instructorSubmissions()]);
      setCounts(ov.counts);
      setSubmissions(subs.submissions);
      setError('');
    } catch {
      setError('Could not load instructor queue. Sign in with an instructor or administrator account.');
    }
  }, [allowed]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!allowed) {
    return (
      <LiquidGlassPanel title="Instructor access required">
        <p className="flex items-center gap-2 text-ink-soft">
          <ShieldAlert className="size-5 text-bad" aria-hidden />
          Only assigned instructors or administrators can open this workspace.
        </p>
      </LiquidGlassPanel>
    );
  }

  const review = async (sub: SubmissionRow, approved: boolean) => {
    const pts = Math.max(0, Math.min(100, score[sub.id] ?? 85));
    const text = (feedback[sub.id] ?? '').trim() || (approved ? 'Meets rubric requirements.' : 'Please address the rubric feedback and resubmit.');
    try {
      await api.reviewSubmission(sub.id, {
        rubricScores: [{ criterion: 'Overall Rubric', score: pts, maxPoints: 100, comment: text }],
        feedback: text,
        approved,
      });
      toast(approved ? 'Project verified' : 'Feedback sent');
      await load();
    } catch {
      toast('Review failed. Check your assigned project scope.', 'bad');
    }
  };

  return (
    <>
      <PageHeader title="Instructor Console" subtitle="Review student project submissions within your assigned scope." />
      {error && <LiquidGlassPanel className="mb-5 text-bad">{error}</LiquidGlassPanel>}
      <div className="mb-5 grid gap-4 tab:grid-cols-4">
        <LiquidGlassPanel title="Courses"><p className="text-3xl font-bold">{counts.courses ?? 0}</p></LiquidGlassPanel>
        <LiquidGlassPanel title="Projects"><p className="text-3xl font-bold">{counts.projects ?? 0}</p></LiquidGlassPanel>
        <LiquidGlassPanel title="Pending"><p className="text-3xl font-bold">{counts.pendingSubmissions ?? 0}</p></LiquidGlassPanel>
        <LiquidGlassPanel title="Verified"><p className="text-3xl font-bold">{counts.verifiedSubmissions ?? 0}</p></LiquidGlassPanel>
      </div>

      <LiquidGlassPanel title="Project Submissions">
        {submissions.length === 0 ? (
          <p className="text-ink-soft">No submissions in your assigned scope yet.</p>
        ) : (
          <ul className="grid gap-4">
            {submissions.map((s) => (
              <li key={s.id} className="lg-inset grid gap-3 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-bold">{s.projectId} · v{s.version}</p>
                    {s.repoUrl && <a href={s.repoUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-violet-deep underline">{s.repoUrl}</a>}
                    {s.fileName && <p className="text-sm text-ink-soft">File: {s.fileName}</p>}
                  </div>
                  <Chip tone={s.status === 'verified' ? 'good' : 'violet'}>{s.status}</Chip>
                </div>
                {s.note && <p className="text-sm text-ink-soft">Student note: {s.note}</p>}
                <div className="grid gap-3 tab:grid-cols-[8rem_1fr]">
                  <div className="lg-field">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      aria-label="Score percent"
                      value={score[s.id] ?? s.overallScore ?? 85}
                      onChange={(e) => setScore({ ...score, [s.id]: Number(e.target.value) })}
                    />
                  </div>
                  <div className="lg-field">
                    <input
                      type="text"
                      aria-label="Instructor feedback"
                      placeholder="Rubric feedback for the learner…"
                      value={feedback[s.id] ?? ''}
                      onChange={(e) => setFeedback({ ...feedback, [s.id]: e.target.value })}
                    />
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <LiquidGlassButton size="sm" variant="primary" icon={<Check aria-hidden />} onClick={() => void review(s, true)}>
                    Verify &amp; Approve
                  </LiquidGlassButton>
                  <LiquidGlassButton size="sm" onClick={() => void review(s, false)}>
                    Request Changes
                  </LiquidGlassButton>
                </div>
              </li>
            ))}
          </ul>
        )}
      </LiquidGlassPanel>
    </>
  );
}
