import { randomUUID } from 'node:crypto';
import * as sample from '../src/data/sample.ts';
import { CHALLENGES } from '../src/data/challenges.ts';
import { PROGRAMMING_LANGUAGES } from '../src/data/languages.ts';
import { SPOKEN_LANGUAGE_NAMES } from './ai.ts';
import { ApiError } from './security.ts';
import type {
  AssessmentAttemptRecord,
  AssessmentQuestionInternal,
  BackendRuntime,
  CertificateTemplateRecord,
  CourseRecord,
  IssuedCertificateRecord,
  NotificationRecord,
  ProfileRecord,
  ProgrammingLanguageRecord,
  ProjectCatalogRecord,
  ProjectEvaluationRecord,
  ProjectSubmissionRecord,
  RoadmapMilestone,
  RoadmapRecord,
  Role,
  SkillCatalogItem,
  SpokenLanguageRecord,
  TutorMessageRecord,
} from './types.ts';

interface StoredUser {
  id: string;
  email: string;
  password: string;
  emailConfirmed: boolean;
}

export interface MemoryRuntimeOptions {
  aiDailyQuota?: number;
  aiResponder?: (input: { endpoint: string; languageCode: string; userPrompt: string }) => string;
  sandboxConfigured?: boolean;
}

/**
 * Isolated in-memory test runtime enforcing the exact same ownership, RLS, RBAC,
 * quota, rate-limit, and answer-key isolation contracts as Supabase PostgreSQL.
 */
export function createMemoryRuntime(opts: MemoryRuntimeOptions = {}) {
  const aiDailyQuota = opts.aiDailyQuota ?? 40;
  const uploads = new Map<string, Blob>();
  const users = new Map<string, StoredUser>();
  const tokens = new Map<string, string>(); // token -> userId
  const profiles = new Map<string, ProfileRecord>();
  const instructorProjects = new Map<string, Set<string>>(); // instructorId -> projectIds
  const rateBuckets = new Map<string, { hits: number; resetAt: number }>();
  const aiUsage: { userId: string; endpoint: string; status: string; createdAt: number }[] = [];
  const auditLogs: Record<string, unknown>[] = [];

  const skills: SkillCatalogItem[] = sample.workspace.skills.map((s) => ({
    id: s.id,
    name: s.name,
    categoryId: s.id === 'cl' ? 'infrastructure' : s.id === 'ml' || s.id === 'db' ? 'ai-data' : 'programming',
    defaultTarget: s.target,
  }));

  const courses: CourseRecord[] = sample.workspace.courses.map((c) => ({
    id: c.id,
    skill: c.skill,
    title: c.title,
    blurb: c.blurb,
    level: c.level,
    modules: c.modules.map((m, idx) => ({
      id: `${c.id}-m${idx + 1}`,
      title: m.title,
      lessons: m.lessons.map((l) => ({ ...l, moduleId: `${c.id}-m${idx + 1}`, courseId: c.id })),
    })),
  }));

  const spokenLanguages: SpokenLanguageRecord[] = Object.entries(SPOKEN_LANGUAGE_NAMES).map(([code, englishName]) => ({
    code,
    nativeName: englishName,
    englishName,
    isRtl: code === 'ar',
    aiQualityTier: 'high',
    enabled: true,
  }));

  const programmingLanguages: ProgrammingLanguageRecord[] = PROGRAMMING_LANGUAGES.map((l) => ({
    id: l.id,
    name: l.name,
    mark: l.mark,
    color: l.color,
    kinds: [...l.kinds],
    note: l.note,
    capabilities: {
      canAiExplain: true,
      hasAssessments: ['python', 'javascript', 'sql'].includes(l.id),
      canExecuteSandbox: Boolean(l.runs),
      executionRuntime: l.runs ? 'browser-worker-js' : l.id === 'python' ? 'python3.12' : null,
    },
    enabled: true,
  }));

  const assessments = new Map<string, { id: string; skillId: string; title: string; passMark: number; timeLimitSeconds: number; questions: AssessmentQuestionInternal[] }>();
  for (const sk of skills) {
    const qs: AssessmentQuestionInternal[] = courses
      .filter((c) => c.skill === sk.id)
      .flatMap((c) => c.modules.flatMap((m) => m.lessons))
      .map((l, idx) => ({
        id: `q-${sk.id}-${idx + 1}`,
        prompt: l.check.q,
        options: [...l.check.options],
        correctIndex: l.check.answer,
        explanation: l.check.why,
        difficulty: 'core',
      }));
    assessments.set(sk.id, { id: `assess-${sk.id}`, skillId: sk.id, title: `${sk.name} Skill Assessment`, passMark: 70, timeLimitSeconds: 300, questions: qs });
  }

  const projects: ProjectCatalogRecord[] = sample.workspace.projects.map((p) => ({
    id: p.id,
    title: p.title,
    skills: [...p.skills],
    level: p.level,
    hours: p.hours,
    brief: p.brief,
    requirements: [...p.requirements],
    rubric: p.rubric.map((criterion, index) => ({ criterion, description: criterion, maxPoints: index === 0 ? 40 : 30 })),
    instructorId: null,
  }));

  const templates: CertificateTemplateRecord[] = sample.workspace.certificates.map((c) => ({
    id: c.id,
    title: c.title,
    skillId: c.skill,
    courseId: c.course,
    projectId: c.project,
    passMark: 70,
  }));

  const attempts = new Map<string, AssessmentAttemptRecord>();
  const skillScores = new Map<string, Map<string, { score: number; target: number; history: number[] }>>();
  const enrollments = new Map<string, Set<string>>();
  const lessonsDone = new Map<string, Set<string>>();
  const roadmaps = new Map<string, RoadmapRecord>();
  const tutorMessages = new Map<string, TutorMessageRecord[]>();
  const codeSubmissions: Record<string, unknown>[] = [];
  const projectSubmissions = new Map<string, ProjectSubmissionRecord>();
  const projectEvaluations = new Map<string, ProjectEvaluationRecord[]>();
  const issuedCerts = new Map<string, IssuedCertificateRecord>();
  const certVerifications: Record<string, unknown>[] = [];
  const notifications = new Map<string, NotificationRecord[]>();

  function seedUser(input: { id?: string; email: string; password: string; displayName: string; role: Role; assignedProjects?: string[] }) {
    const id = input.id ?? randomUUID();
    users.set(id, { id, email: input.email.toLowerCase(), password: input.password, emailConfirmed: true });
    profiles.set(id, {
      id,
      role: input.role,
      displayName: input.displayName,
      email: input.email.toLowerCase(),
      careerGoal: 'fullstack',
      interests: ['js', 'py'],
      learningStyle: 'build',
      learningPace: '30',
      preferredLanguage: 'en',
      preferredCodeLanguage: 'javascript',
      githubUsername: '',
      portfolioSlug: null,
      portfolioPublic: false,
      showScoresPublic: false,
      inAppNotices: true,
    });
    if (input.assignedProjects) instructorProjects.set(id, new Set(input.assignedProjects));
    const token = `tok_${id}`;
    tokens.set(token, id);
    return { id, token };
  }

  const runtime: BackendRuntime = {
    auth: {
      async verifyToken(token) {
        const uid = tokens.get(token);
        if (!uid) return null;
        const p = profiles.get(uid);
        if (!p) return null;
        return { id: p.id, email: p.email, role: p.role, displayName: p.displayName, token };
      },
      async register(name, email, password) {
        const norm = email.toLowerCase();
        for (const u of users.values()) {
          if (u.email === norm) throw new ApiError(400, 'registration_failed', 'Email already registered.');
        }
        const id = randomUUID();
        users.set(id, { id, email: norm, password, emailConfirmed: true });
        profiles.set(id, {
          id,
          role: 'student', // ALWAYS student
          displayName: name.slice(0, 60),
          email: norm,
          careerGoal: '',
          interests: [],
          learningStyle: '',
          learningPace: '',
          preferredLanguage: 'en',
          preferredCodeLanguage: '',
          githubUsername: '',
          portfolioSlug: null,
          portfolioPublic: false,
          showScoresPublic: false,
          inAppNotices: true,
        });
        const token = `tok_${id}`;
        tokens.set(token, id);
        return { userId: id, emailConfirmed: true, accessToken: token, refreshToken: `ref_${id}` };
      },
      async login(email, password) {
        const norm = email.toLowerCase();
        const found = [...users.values()].find((u) => u.email === norm && u.password === password);
        if (!found) throw new ApiError(401, 'invalid_credentials', 'Invalid email or password.');
        const p = profiles.get(found.id)!;
        const token = `tok_${found.id}_${Date.now()}`;
        tokens.set(token, found.id);
        return {
          accessToken: token,
          refreshToken: `ref_${found.id}`,
          user: { id: p.id, email: p.email, role: p.role, displayName: p.displayName, token },
        };
      },
      async logout(token) {
        tokens.delete(token);
      },
      async recoverPassword() {},
      async resetPassword(token, newPassword) {
        const uid = tokens.get(token);
        if (!uid) throw new ApiError(401, 'unauthorized', 'Invalid session.');
        const u = users.get(uid);
        if (u) u.password = newPassword;
      },
      async googleOAuthUrl(redirectTo) {
        return `https://accounts.google.com/o/oauth2/v2/auth?redirect_uri=${encodeURIComponent(redirectTo)}`;
      },
    },

    async rateLimit(key, limit, windowSeconds) {
      const now = Date.now();
      const cur = rateBuckets.get(key);
      if (!cur || cur.resetAt <= now) {
        const resetAt = now + windowSeconds * 1000;
        rateBuckets.set(key, { hits: 1, resetAt });
        return { allowed: true, remaining: Math.max(limit - 1, 0), resetAt: new Date(resetAt).toISOString() };
      }
      cur.hits += 1;
      return { allowed: cur.hits <= limit, remaining: Math.max(limit - cur.hits, 0), resetAt: new Date(cur.resetAt).toISOString() };
    },

    async auditLog(entry) {
      auditLogs.unshift({ id: randomUUID(), ...entry, created_at: new Date().toISOString() });
    },

    ai: {
      async complete(input) {
        const used = await runtime.ai.getDailyUsageCount(input.userId);
        if (used >= aiDailyQuota) {
          aiUsage.push({ userId: input.userId, endpoint: input.endpoint, status: 'quota_blocked', createdAt: Date.now() });
          throw new ApiError(429, 'ai_quota_exceeded', 'Daily AI usage quota reached.');
        }
        const text = opts.aiResponder
          ? opts.aiResponder({ endpoint: input.endpoint, languageCode: input.languageCode, userPrompt: input.userPrompt })
          : `[${input.languageCode}] Guided explanation for ${input.endpoint}.`;
        aiUsage.push({ userId: input.userId, endpoint: input.endpoint, status: 'ok', createdAt: Date.now() });
        return { text, model: 'gemini-2.5-flash', promptTokens: 120, outputTokens: 80, latencyMs: 12 };
      },
      async getDailyUsageCount(userId) {
        const dayStart = new Date();
        dayStart.setUTCHours(0, 0, 0, 0);
        return aiUsage.filter((u) => u.userId === userId && u.status === 'ok' && u.createdAt >= dayStart.getTime()).length;
      },
      async listUsageSummary() {
        const byEndpoint: Record<string, number> = {};
        const byStatus: Record<string, number> = {};
        for (const u of aiUsage) {
          byEndpoint[u.endpoint] = (byEndpoint[u.endpoint] ?? 0) + 1;
          byStatus[u.status] = (byStatus[u.status] ?? 0) + 1;
        }
        return { totalRequests: aiUsage.length, byEndpoint, byStatus };
      },
    },

    sandbox: {
      async execute(input) {
        if (!opts.sandboxConfigured) {
          return {
            status: 'unavailable',
            simulated: false,
            error: `Remote execution sandbox is not configured for ${input.languageId}. Tests were not executed or simulated.`,
          };
        }
        return {
          status: 'completed',
          simulated: false,
          results: input.tests.map((t) => ({ ok: true, got: JSON.stringify(t.expected) })),
          runtimeMs: 42,
        };
      },
    },

    storage: {
      async createSignedUploadUrl(_userId, objectPath) {
        return { signedUrl: `https://storage.test/upload/${encodeURIComponent(objectPath)}`, path: objectPath, expiresInSeconds: 120 };
      },
      async readUpload(path) {
        const file = uploads.get(path);
        if (!file) throw new ApiError(400, 'upload_missing', 'The uploaded file could not be read.');
        return file;
      },
      async uploadBytes(objectPath, bytes, type) {
        uploads.set(objectPath, new Blob([Uint8Array.from(bytes)], { type }));
        return { path: objectPath };
      },
      async createSignedDownloadUrl(objectPath) {
        return { signedUrl: `https://storage.test/download/${encodeURIComponent(objectPath)}`, expiresInSeconds: 300 };
      },
    },

    db: {
      async getProfile(userId, caller) {
        if (caller.id !== userId && caller.role !== 'admin') return null;
        return profiles.get(userId) ?? null;
      },
      async updateProfile(userId, patch, caller) {
        if (caller.id !== userId && caller.role !== 'admin') throw new ApiError(403, 'forbidden', 'Cannot modify another user profile.');
        const cur = profiles.get(userId);
        if (!cur) throw new ApiError(404, 'not_found', 'Profile not found.');
        if (patch.portfolioSlug) {
          for (const p of profiles.values()) {
            if (p.id !== userId && p.portfolioSlug === patch.portfolioSlug) {
              throw new ApiError(409, 'slug_taken', 'Portfolio URL slug is already in use.');
            }
          }
        }
        const next: ProfileRecord = { ...cur, ...patch, id: cur.id, role: cur.role, email: cur.email };
        profiles.set(userId, next);
        return next;
      },
      async listAllProfiles(caller) {
        if (caller.role !== 'admin') throw new ApiError(403, 'forbidden', 'Administrator access required.');
        return [...profiles.values()];
      },
      async setUserRole(targetUserId, role, caller) {
        if (caller.role !== 'admin') throw new ApiError(403, 'forbidden', 'Administrator access required.');
        const cur = profiles.get(targetUserId);
        if (!cur) throw new ApiError(404, 'user_not_found', 'User not found.');
        const next = { ...cur, role };
        profiles.set(targetUserId, next);
        return next;
      },
      async getPublicPortfolio(slug) {
        const p = [...profiles.values()].find((x) => x.portfolioSlug === slug && x.portfolioPublic);
        if (!p) return null;
        const userScores = skillScores.get(p.id);
        const verifiedProjects = [...projectSubmissions.values()]
          .filter((s) => s.userId === p.id && s.status === 'verified')
          .map((s) => {
            const proj = projects.find((x) => x.id === s.projectId);
            return { id: s.projectId, title: proj?.title ?? s.projectId, brief: proj?.brief ?? '', repoUrl: s.repoUrl };
          });
        const verifiedCerts = [...issuedCerts.values()]
          .filter((c) => c.userId === p.id && c.status === 'verified')
          .map((c) => ({ verificationCode: c.verificationCode, title: c.title, skillName: c.skillName, issuedAt: c.issuedAt }));
        return {
          displayName: p.displayName,
          careerGoal: p.careerGoal,
          githubUsername: p.githubUsername,
          showScores: p.showScoresPublic,
          skills: skills.map((sk) => ({
            id: sk.id,
            name: sk.name,
            score: p.showScoresPublic ? (userScores?.get(sk.id)?.score ?? 0) : null,
            source: 'assessed',
          })),
          projects: verifiedProjects,
          certificates: verifiedCerts,
        };
      },

      async listSpokenLanguages(includeDisabled = false) {
        return includeDisabled ? spokenLanguages : spokenLanguages.filter((l) => l.enabled);
      },
      async setSpokenLanguageEnabled(code, enabled, caller) {
        if (caller.role !== 'admin') throw new ApiError(403, 'forbidden', 'Administrator access required.');
        const found = spokenLanguages.find((l) => l.code === code);
        if (!found) throw new ApiError(404, 'language_not_found', 'Language not found.');
        found.enabled = enabled;
        return found;
      },
      async listProgrammingLanguages(includeDisabled = false) {
        return includeDisabled ? programmingLanguages : programmingLanguages.filter((l) => l.enabled);
      },

      async listSkills() {
        return skills;
      },
      async getUserSkills(userId, caller) {
        if (caller.id !== userId && caller.role !== 'admin') throw new ApiError(403, 'forbidden', 'Cannot access another learner skills.');
        const map = skillScores.get(userId);
        return skills.map((sk) => {
          const cur = map?.get(sk.id);
          return {
            id: sk.id,
            name: sk.name,
            score: cur?.score ?? 0,
            target: cur?.target ?? sk.defaultTarget,
            history: cur?.history ?? [0],
            source: 'api',
          };
        });
      },
      async getAssessmentBySkill(skillId) {
        return assessments.get(skillId) ?? null;
      },
      async createAssessmentAttempt(userId, assessmentId, skillId, timeLimitSeconds, languageCode) {
        const now = Date.now();
        const rec: AssessmentAttemptRecord = {
          id: randomUUID(),
          userId,
          assessmentId,
          skillId,
          status: 'in_progress',
          startedAt: new Date(now).toISOString(),
          expiresAt: new Date(now + timeLimitSeconds * 1000).toISOString(),
          submittedAt: null,
          answers: [],
          correctCount: null,
          totalCount: null,
          scorePercent: null,
          aiExplanation: null,
          languageCode,
        };
        attempts.set(rec.id, rec);
        return rec;
      },
      async getAssessmentAttempt(attemptId, caller) {
        const rec = attempts.get(attemptId);
        if (!rec) return null;
        if (rec.userId !== caller.id && caller.role !== 'admin') return null;
        return rec;
      },
      async completeAssessmentAttempt(input) {
        const cur = attempts.get(input.attemptId);
        if (!cur || cur.userId !== input.userId) throw new ApiError(404, 'attempt_not_found', 'Attempt not found.');
        const next: AssessmentAttemptRecord = {
          ...cur,
          status: 'submitted',
          submittedAt: new Date().toISOString(),
          answers: input.answers,
          correctCount: input.correctCount,
          totalCount: input.totalCount,
          scorePercent: input.scorePercent,
          aiExplanation: input.aiExplanation,
        };
        attempts.set(input.attemptId, next);

        let userMap = skillScores.get(input.userId);
        if (!userMap) {
          userMap = new Map();
          skillScores.set(input.userId, userMap);
        }
        const sk = skills.find((s) => s.id === input.skillId);
        const prev = userMap.get(input.skillId);
        const history = [...(prev?.history ?? []), input.scorePercent].slice(-12);
        userMap.set(input.skillId, { score: input.scorePercent, target: prev?.target ?? sk?.defaultTarget ?? 75, history });
        return next;
      },

      async listCourses() {
        return courses;
      },
      async createCourse(input) {
        if (courses.some((c) => c.id === input.id)) throw new ApiError(409, 'course_exists', 'Course already exists.');
        const rec: CourseRecord = { id: input.id, skill: input.skill, title: input.title, blurb: input.blurb, level: input.level, modules: [] };
        courses.push(rec);
        return rec;
      },
      async enrollCourse(userId, courseId) {
        let set = enrollments.get(userId);
        if (!set) {
          set = new Set();
          enrollments.set(userId, set);
        }
        set.add(courseId);
      },
      async listLessonsDone(userId, caller) {
        if (caller.id !== userId && caller.role !== 'admin') throw new ApiError(403, 'forbidden', 'Access denied.');
        return [...(lessonsDone.get(userId) ?? [])];
      },
      async completeLesson(userId, courseId, lessonId) {
        await runtime.db.enrollCourse(userId, courseId);
        let set = lessonsDone.get(userId);
        if (!set) {
          set = new Set();
          lessonsDone.set(userId, set);
        }
        set.add(lessonId);
        return [...set];
      },
      async getActiveRoadmap(userId, caller) {
        if (caller.id !== userId && caller.role !== 'admin') return null;
        return roadmaps.get(userId) ?? null;
      },
      async saveRoadmap(userId, goal, languageCode, summary, milestones: RoadmapMilestone[]) {
        const rec: RoadmapRecord = { id: randomUUID(), userId, goal, preferredLanguage: languageCode, summary, milestones, createdAt: new Date().toISOString() };
        roadmaps.set(userId, rec);
        return rec;
      },
      async listTutorMessages(userId, limit = 30) {
        return (tutorMessages.get(userId) ?? []).slice(-limit);
      },
      async appendTutorMessages(userId, languageCode, userText, assistantText) {
        const list = tutorMessages.get(userId) ?? [];
        const now = new Date().toISOString();
        list.push(
          { id: randomUUID(), role: 'user', text: userText, languageCode, createdAt: now },
          { id: randomUUID(), role: 'assistant', text: assistantText, languageCode, createdAt: now },
        );
        tutorMessages.set(userId, list);
      },
      async clearTutorMessages(userId) {
        tutorMessages.set(userId, []);
      },

      async getChallenge(id) {
        const c = CHALLENGES.find((x) => x.id === id);
        if (!c) return null;
        return {
          id: c.id,
          skillId: 'js',
          languageId: 'javascript',
          title: c.title,
          fnName: c.fn,
          publicTests: c.tests,
          hiddenTests: [{ args: [[0, 2]], expected: 2 }],
        };
      },
      async recordCodeSubmission(input) {
        const id = randomUUID();
        codeSubmissions.push({ id, ...input, createdAt: new Date().toISOString() });
        return { id };
      },

      async listProjects() {
        return projects;
      },
      async listUserProjectSubmissions(userId, caller) {
        if (caller.id !== userId && caller.role !== 'admin') throw new ApiError(403, 'forbidden', 'Access denied.');
        return [...projectSubmissions.values()].filter((s) => s.userId === userId);
      },
      async listInstructorSubmissions(caller) {
        if (caller.role === 'admin') return [...projectSubmissions.values()];
        const allowed = instructorProjects.get(caller.id) ?? new Set<string>();
        return [...projectSubmissions.values()].filter((s) => allowed.has(s.projectId));
      },
      async getProjectSubmission(submissionId, caller) {
        const sub = projectSubmissions.get(submissionId);
        if (!sub) return null;
        if (caller.role === 'admin' || sub.userId === caller.id) return sub;
        if (caller.role === 'instructor' && instructorProjects.get(caller.id)?.has(sub.projectId)) return sub;
        return null;
      },
      async createProjectSubmission(input) {
        const prev = [...projectSubmissions.values()].filter((s) => s.userId === input.userId && s.projectId === input.projectId);
        const now = new Date().toISOString();
        const rec: ProjectSubmissionRecord = {
          id: randomUUID(),
          projectId: input.projectId,
          userId: input.userId,
          version: prev.length + 1,
          repoUrl: input.repoUrl,
          storagePath: input.storagePath,
          fileName: input.fileName,
          fileSizeBytes: input.fileSizeBytes,
          fileMime: input.fileMime,
          note: input.note,
          status: input.aiFeedback ? 'evaluated' : 'submitted',
          overallScore: null,
          aiFeedback: input.aiFeedback,
          automatedTests: null,
          createdAt: now,
          updatedAt: now,
        };
        projectSubmissions.set(rec.id, rec);
        return rec;
      },
      async reviewProjectSubmission(input) {
        const cur = projectSubmissions.get(input.submissionId);
        if (!cur) throw new ApiError(404, 'submission_not_found', 'Submission not found.');
        const next: ProjectSubmissionRecord = {
          ...cur,
          status: input.approved ? 'verified' : 'changes_requested',
          overallScore: input.totalScore,
          aiFeedback: input.feedback,
          updatedAt: new Date().toISOString(),
        };
        projectSubmissions.set(cur.id, next);
        const evaluation: ProjectEvaluationRecord = {
          id: randomUUID(),
          submissionId: cur.id,
          evaluatorId: input.evaluatorId,
          evaluatorType: 'instructor',
          rubricScores: input.rubricScores,
          totalScore: input.totalScore,
          feedback: input.feedback,
          approved: input.approved,
          createdAt: new Date().toISOString(),
        };
        const list = projectEvaluations.get(cur.id) ?? [];
        list.push(evaluation);
        projectEvaluations.set(cur.id, list);
        return { submission: next, evaluation };
      },
      async upsertProjectRubric(projectId, criterion, description, maxPoints, caller) {
        const isAllowed = caller.role === 'admin' || Boolean(instructorProjects.get(caller.id)?.has(projectId));
        if (!isAllowed) throw new ApiError(403, 'forbidden', 'Not authorized to edit this project rubric.');
        const proj = projects.find((p) => p.id === projectId);
        if (!proj) throw new ApiError(404, 'project_not_found', 'Project not found.');
        const existing = proj.rubric.find((r) => r.criterion === criterion);
        if (existing) {
          existing.description = description;
          existing.maxPoints = maxPoints;
        } else {
          proj.rubric.push({ criterion, description, maxPoints });
        }
      },

      async listCertificateTemplates() {
        return templates;
      },
      async listUserCertificates(userId, caller) {
        if (caller.id !== userId && caller.role !== 'admin') throw new ApiError(403, 'forbidden', 'Access denied.');
        return [...issuedCerts.values()].filter((c) => c.userId === userId);
      },
      async getIssuedCertificateByCode(code) {
        return [...issuedCerts.values()].find((c) => c.verificationCode === code) ?? null;
      },
      async saveIssuedCertificate(cert) {
        const dup = [...issuedCerts.values()].find((c) => c.userId === cert.userId && c.templateId === cert.templateId);
        if (dup) throw new ApiError(409, 'certificate_exists', 'Certificate already issued.');
        const rec: IssuedCertificateRecord = {
          id: randomUUID(),
          ...cert,
          revokedAt: null,
          revokedBy: null,
          revocationReason: null,
        };
        issuedCerts.set(rec.id, rec);
        return rec;
      },
      async revokeCertificate(certId, actorId, reason) {
        const cur = issuedCerts.get(certId) ?? [...issuedCerts.values()].find((c) => c.verificationCode === certId);
        if (!cur) throw new ApiError(404, 'certificate_not_found', 'Certificate not found.');
        const next: IssuedCertificateRecord = {
          ...cur,
          status: 'revoked',
          revokedAt: new Date().toISOString(),
          revokedBy: actorId,
          revocationReason: reason,
        };
        issuedCerts.set(cur.id, next);
        return next;
      },
      async logCertificateVerification(input) {
        certVerifications.push({ ...input, checkedAt: new Date().toISOString() });
      },

      async listNotifications(userId) {
        return notifications.get(userId) ?? [];
      },
      async pushNotification(userId, dedupeKey, text, linkTo) {
        const list = notifications.get(userId) ?? [];
        const filtered = list.filter((n) => n.id !== dedupeKey);
        filtered.unshift({ id: dedupeKey, text, to: linkTo, read: false, at: Date.now() });
        notifications.set(userId, filtered.slice(0, 25));
      },
      async markNotificationsRead(userId) {
        const list = notifications.get(userId) ?? [];
        notifications.set(userId, list.map((n) => ({ ...n, read: true })));
      },
      async listAuditLogs(caller, limit = 100) {
        if (caller.role !== 'admin') throw new ApiError(403, 'forbidden', 'Administrator access required.');
        return auditLogs.slice(0, limit);
      },
      async isInstructorForProject(instructorId, projectId) {
        return Boolean(instructorProjects.get(instructorId)?.has(projectId));
      },
    },
  };

  return {
    runtime,
    seedUser,
    inspect: { issuedCerts, projectSubmissions, auditLogs, certVerifications, codeSubmissions },
  };
}
