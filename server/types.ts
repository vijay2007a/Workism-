export type Role = 'student' | 'instructor' | 'admin';

export interface AuthUser {
  id: string;
  email: string;
  role: Role;
  displayName: string;
  token: string;
}

export interface ProfileRecord {
  id: string;
  role: Role;
  displayName: string;
  email: string;
  careerGoal: string;
  interests: string[];
  learningStyle: string;
  learningPace: string;
  preferredLanguage: string;
  preferredCodeLanguage: string;
  githubUsername: string;
  portfolioSlug: string | null;
  portfolioPublic: boolean;
  showScoresPublic: boolean;
  inAppNotices: boolean;
}

export interface SkillCatalogItem {
  id: string;
  name: string;
  categoryId: string;
  defaultTarget: number;
}

export interface UserSkillView {
  id: string;
  name: string;
  score: number;
  target: number;
  history: number[];
  source: 'api';
}

export interface LessonRecord {
  id: string;
  moduleId: string;
  courseId: string;
  title: string;
  minutes: number;
  body: string[];
  code?: string;
  check: { q: string; options: string[]; answer: number; why: string };
}

export interface CourseRecord {
  id: string;
  skill: string;
  title: string;
  blurb: string;
  level: string;
  modules: { id: string; title: string; lessons: LessonRecord[] }[];
}

export interface AssessmentQuestionPublic {
  id: string;
  prompt: string;
  options: string[];
  difficulty: string;
}

export interface AssessmentQuestionInternal extends AssessmentQuestionPublic {
  correctIndex: number;
  explanation: string;
}

export interface AssessmentAttemptRecord {
  id: string;
  userId: string;
  assessmentId: string;
  skillId: string;
  status: 'in_progress' | 'submitted' | 'expired';
  startedAt: string;
  expiresAt: string;
  submittedAt: string | null;
  answers: (number | null)[];
  correctCount: number | null;
  totalCount: number | null;
  scorePercent: number | null;
  aiExplanation: string | null;
  languageCode: string;
}

export interface RoadmapMilestone {
  courseId: string | null;
  skillId: string | null;
  title: string;
  objective: string;
  lessonIds: string[];
}

export interface RoadmapRecord {
  id: string;
  userId: string;
  goal: string;
  preferredLanguage: string;
  summary: string;
  milestones: RoadmapMilestone[];
  createdAt: string;
}

export interface TutorMessageRecord {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  languageCode: string;
  createdAt: string;
}

export interface SpokenLanguageRecord {
  code: string;
  nativeName: string;
  englishName: string;
  isRtl: boolean;
  aiQualityTier: 'high' | 'good' | 'beta';
  enabled: boolean;
}

export interface ProgrammingLanguageRecord {
  id: string;
  name: string;
  mark: string;
  color: string;
  kinds: string[];
  note: string;
  capabilities: {
    canAiExplain: boolean;
    hasAssessments: boolean;
    canExecuteSandbox: boolean;
    executionRuntime: string | null;
  };
  enabled: boolean;
}

export interface ProjectCatalogRecord {
  id: string;
  title: string;
  skills: string[];
  level: string;
  hours: number;
  brief: string;
  requirements: string[];
  rubric: { criterion: string; description: string; maxPoints: number }[];
  instructorId?: string | null;
}

export interface ProjectSubmissionRecord {
  id: string;
  projectId: string;
  userId: string;
  version: number;
  repoUrl: string | null;
  storagePath: string | null;
  fileName: string | null;
  fileSizeBytes: number | null;
  fileMime: string | null;
  note: string;
  status: 'submitted' | 'evaluating' | 'evaluated' | 'verified' | 'changes_requested';
  overallScore: number | null;
  aiFeedback: string | null;
  automatedTests: { executed: boolean; passed?: number; total?: number; note: string } | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectEvaluationRecord {
  id: string;
  submissionId: string;
  evaluatorId: string | null;
  evaluatorType: 'ai' | 'instructor' | 'automated';
  rubricScores: { criterion: string; score: number; maxPoints: number; comment: string }[];
  totalScore: number | null;
  feedback: string;
  approved: boolean;
  createdAt: string;
}

export interface CertificateTemplateRecord {
  id: string;
  title: string;
  skillId: string;
  courseId: string;
  projectId: string;
  passMark: number;
}

export interface IssuedCertificateRecord {
  id: string;
  verificationCode: string;
  templateId: string;
  userId: string;
  holderName: string;
  title: string;
  skillName: string;
  status: 'verified' | 'revoked';
  issuedAt: string;
  issuedBy: string | null;
  signatureAlg: string;
  signaturePayload: Record<string, unknown>;
  signatureHex: string;
  revokedAt: string | null;
  revokedBy: string | null;
  revocationReason: string | null;
}

export interface NotificationRecord {
  id: string;
  text: string;
  to: string;
  read: boolean;
  at: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: string;
}

export interface AiCompletionResult {
  text: string;
  model: string;
  promptTokens: number;
  outputTokens: number;
  latencyMs: number;
}

export interface CodeExecutionResult {
  status: 'completed' | 'failed' | 'unavailable';
  simulated: false;
  results?: { ok: boolean; got: string }[];
  runtimeMs?: number;
  stdout?: string;
  error?: string;
}

export interface BackendRuntime {
  auth: {
    verifyToken(token: string): Promise<AuthUser | null>;
    register(name: string, email: string, password: string, redirectTo?: string): Promise<{ userId: string; emailConfirmed: boolean; accessToken?: string; refreshToken?: string }>;
    login(email: string, password: string): Promise<{ accessToken: string; refreshToken: string; user: AuthUser }>;
    logout(token: string): Promise<void>;
    recoverPassword(email: string, redirectTo: string): Promise<void>;
    resetPassword(token: string, newPassword: string): Promise<void>;
    googleOAuthUrl(redirectTo: string): Promise<string>;
  };
  rateLimit(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult>;
  auditLog(entry: { actorId?: string | null; action: string; resourceType: string; resourceId?: string | null; ipHash?: string; metadata?: Record<string, unknown> }): Promise<void>;
  ai: {
    complete(input: { userId: string; endpoint: string; languageCode: string; systemPrompt: string; userPrompt: string; maxOutputTokens?: number }): Promise<AiCompletionResult>;
    getDailyUsageCount(userId: string): Promise<number>;
    listUsageSummary(): Promise<{ totalRequests: number; byEndpoint: Record<string, number>; byStatus: Record<string, number> }>;
  };
  sandbox: {
    execute(input: { languageId: string; runtime: string | null; code: string; fnName: string; tests: { args: unknown[]; expected: unknown }[] }): Promise<CodeExecutionResult>;
  };
  storage: {
    createSignedUploadUrl(userId: string, objectPath: string, contentType: string): Promise<{ signedUrl: string; path: string; expiresInSeconds: number }>;
    readUpload(objectPath: string): Promise<Blob>;
    uploadBytes(objectPath: string, bytes: Uint8Array, contentType: string): Promise<{ path: string }>;
    createSignedDownloadUrl(objectPath: string): Promise<{ signedUrl: string; expiresInSeconds: number }>;
  };
  db: {
    // Profiles & Users
    getProfile(userId: string, caller: AuthUser): Promise<ProfileRecord | null>;
    updateProfile(userId: string, patch: Partial<Omit<ProfileRecord, 'id' | 'role' | 'email'>>, caller: AuthUser): Promise<ProfileRecord>;
    listAllProfiles(caller: AuthUser): Promise<ProfileRecord[]>;
    setUserRole(targetUserId: string, role: Role, caller: AuthUser): Promise<ProfileRecord>;
    getPublicPortfolio(slug: string): Promise<Record<string, unknown> | null>;

    // Languages
    listSpokenLanguages(includeDisabled?: boolean): Promise<SpokenLanguageRecord[]>;
    setSpokenLanguageEnabled(code: string, enabled: boolean, caller: AuthUser): Promise<SpokenLanguageRecord>;
    listProgrammingLanguages(includeDisabled?: boolean): Promise<ProgrammingLanguageRecord[]>;

    // Skills & Assessments
    listSkills(): Promise<SkillCatalogItem[]>;
    getUserSkills(userId: string, caller: AuthUser): Promise<UserSkillView[]>;
    getAssessmentBySkill(skillId: string): Promise<{ id: string; skillId: string; title: string; passMark: number; timeLimitSeconds: number; questions: AssessmentQuestionInternal[] } | null>;
    createAssessmentAttempt(userId: string, assessmentId: string, skillId: string, timeLimitSeconds: number, languageCode: string): Promise<AssessmentAttemptRecord>;
    getAssessmentAttempt(attemptId: string, caller: AuthUser): Promise<AssessmentAttemptRecord | null>;
    completeAssessmentAttempt(input: {
      attemptId: string;
      userId: string;
      skillId: string;
      answers: (number | null)[];
      correctCount: number;
      totalCount: number;
      scorePercent: number;
      aiExplanation: string | null;
    }): Promise<AssessmentAttemptRecord>;

    // Courses, Progress, Roadmaps, Tutor
    listCourses(): Promise<CourseRecord[]>;
    createCourse(input: { id: string; skill: string; title: string; blurb: string; level: string; instructorId: string }): Promise<CourseRecord>;
    enrollCourse(userId: string, courseId: string): Promise<void>;
    listLessonsDone(userId: string, caller: AuthUser): Promise<string[]>;
    completeLesson(userId: string, courseId: string, lessonId: string, checkPassed: boolean): Promise<string[]>;
    getActiveRoadmap(userId: string, caller: AuthUser): Promise<RoadmapRecord | null>;
    saveRoadmap(userId: string, goal: string, languageCode: string, summary: string, milestones: RoadmapMilestone[]): Promise<RoadmapRecord>;
    listTutorMessages(userId: string, limit?: number): Promise<TutorMessageRecord[]>;
    appendTutorMessages(userId: string, languageCode: string, userText: string, assistantText: string): Promise<void>;
    clearTutorMessages(userId: string): Promise<void>;

    // Coding Challenges
    getChallenge(id: string): Promise<{ id: string; skillId: string; languageId: string; title: string; fnName: string; publicTests: { args: unknown[]; expected: unknown }[]; hiddenTests: { args: unknown[]; expected: unknown }[] } | null>;
    recordCodeSubmission(input: { userId: string; challengeId: string; languageId: string; sourceCode: string; executionMode: 'browser_js' | 'remote_sandbox' | 'unavailable'; passedCount: number; totalCount: number; results: unknown[] }): Promise<{ id: string }>;

    // Projects
    listProjects(): Promise<ProjectCatalogRecord[]>;
    listUserProjectSubmissions(userId: string, caller: AuthUser): Promise<ProjectSubmissionRecord[]>;
    listInstructorSubmissions(caller: AuthUser): Promise<ProjectSubmissionRecord[]>;
    getProjectSubmission(submissionId: string, caller: AuthUser): Promise<ProjectSubmissionRecord | null>;
    createProjectSubmission(input: {
      projectId: string;
      userId: string;
      repoUrl: string | null;
      storagePath: string | null;
      fileName: string | null;
      fileSizeBytes: number | null;
      fileMime: string | null;
      note: string;
      aiFeedback: string | null;
    }): Promise<ProjectSubmissionRecord>;
    reviewProjectSubmission(input: {
      submissionId: string;
      evaluatorId: string;
      rubricScores: { criterion: string; score: number; maxPoints: number; comment: string }[];
      totalScore: number;
      feedback: string;
      approved: boolean;
    }): Promise<{ submission: ProjectSubmissionRecord; evaluation: ProjectEvaluationRecord }>;
    upsertProjectRubric(projectId: string, criterion: string, description: string, maxPoints: number, caller: AuthUser): Promise<void>;

    // Certificates
    listCertificateTemplates(): Promise<CertificateTemplateRecord[]>;
    listUserCertificates(userId: string, caller: AuthUser): Promise<IssuedCertificateRecord[]>;
    getIssuedCertificateByCode(code: string): Promise<IssuedCertificateRecord | null>;
    saveIssuedCertificate(cert: Omit<IssuedCertificateRecord, 'id' | 'revokedAt' | 'revokedBy' | 'revocationReason'>): Promise<IssuedCertificateRecord>;
    revokeCertificate(certId: string, actorId: string, reason: string): Promise<IssuedCertificateRecord>;
    logCertificateVerification(input: { certificateId: string | null; verificationCode: string; outcome: 'verified' | 'revoked' | 'not_found' | 'tampered'; clientHash: string }): Promise<void>;

    // Notifications & Audit
    listNotifications(userId: string): Promise<NotificationRecord[]>;
    pushNotification(userId: string, dedupeKey: string, text: string, linkTo: string): Promise<void>;
    markNotificationsRead(userId: string): Promise<void>;
    listAuditLogs(caller: AuthUser, limit?: number): Promise<Record<string, unknown>[]>;
    isInstructorForProject(instructorId: string, projectId: string): Promise<boolean>;
  };
}
