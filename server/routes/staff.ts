import { z } from 'zod';
import { enforceRateLimit, requireRole, type RouteDef } from '../router-utils.ts';
import { ApiError, jsonResponse, parseJsonBody } from '../security.ts';

const ReviewSubmissionSchema = z.object({
  rubricScores: z.array(
    z.object({
      criterion: z.string().min(1).max(120),
      score: z.number().min(0).max(100),
      maxPoints: z.number().min(1).max(100),
      comment: z.string().max(500).default(''),
    }),
  ).min(1).max(20),
  feedback: z.string().trim().min(5).max(2000),
  approved: z.boolean(),
});

const CreateCourseSchema = z.object({
  id: z.string().trim().regex(/^[a-z0-9][a-z0-9-]{2,60}$/),
  skill: z.string().trim().min(1).max(32),
  title: z.string().trim().min(3).max(120),
  blurb: z.string().trim().min(10).max(400),
  level: z.enum(['Beginner', 'Intermediate', 'Advanced']),
});

const UpsertRubricSchema = z.object({
  projectId: z.string().trim().min(1).max(80),
  criterion: z.string().trim().min(2).max(120),
  description: z.string().trim().max(400).default(''),
  maxPoints: z.number().int().min(1).max(100),
});

const UpdateRoleSchema = z.object({
  role: z.enum(['student', 'instructor', 'admin']),
});

const RevokeCertSchema = z.object({
  reason: z.string().trim().min(5).max(500),
});

const ToggleLanguageSchema = z.object({
  enabled: z.boolean(),
});

export const staffRoutes: RouteDef[] = [
  // --- Instructor endpoints ---
  {
    method: 'GET',
    pattern: '/api/instructor/submissions/:id/file',
    async handler(ctx) {
      const staff = await requireRole(ctx, ['instructor', 'admin']);
      await enforceRateLimit(ctx, 'instructor:file', staff.id, 30, 600);
      const sub = await ctx.runtime.db.getProjectSubmission(ctx.params.id, staff);
      if (!sub?.storagePath || !sub.storagePath.startsWith(sub.userId + '/' + sub.projectId + '/') ||
          sub.storagePath.includes('..') || sub.storagePath.includes('\\')) {
        throw new ApiError(404, 'file_not_found', 'Submission file is unavailable.');
      }
      if (staff.role !== 'admin' && !(await ctx.runtime.db.isInstructorForProject(staff.id, sub.projectId))) {
        throw new ApiError(403, 'forbidden', 'This project is outside your review assignments.');
      }
      return jsonResponse(await ctx.runtime.storage.createSignedDownloadUrl(sub.storagePath), 200, ctx.headers);
    },
  },
  {
    method: 'GET',
    pattern: '/api/instructor/overview',
    async handler(ctx) {
      const staff = await requireRole(ctx, ['instructor', 'admin']);
      const [courses, projects, submissions] = await Promise.all([
        ctx.runtime.db.listCourses(),
        ctx.runtime.db.listProjects(),
        ctx.runtime.db.listInstructorSubmissions(staff),
      ]);
      return jsonResponse({
        counts: {
          courses: courses.length,
          projects: projects.length,
          pendingSubmissions: submissions.filter((s) => s.status === 'submitted' || s.status === 'evaluated').length,
          verifiedSubmissions: submissions.filter((s) => s.status === 'verified').length,
        },
        projects,
      }, 200, ctx.headers);
    },
  },
  {
    method: 'GET',
    pattern: '/api/instructor/submissions',
    async handler(ctx) {
      const staff = await requireRole(ctx, ['instructor', 'admin']);
      const submissions = await ctx.runtime.db.listInstructorSubmissions(staff);
      return jsonResponse({ submissions }, 200, ctx.headers);
    },
  },
  {
    method: 'POST',
    pattern: '/api/instructor/submissions/:id/review',
    async handler(ctx) {
      const staff = await requireRole(ctx, ['instructor', 'admin']);
      await enforceRateLimit(ctx, 'instructor:review', staff.id, 60, 600);
      const sub = await ctx.runtime.db.getProjectSubmission(ctx.params.id, staff);
      if (!sub) throw new ApiError(404, 'submission_not_found', 'Submission not found or outside your assigned scope.');
      if (staff.role === 'instructor') {
        const scoped = await ctx.runtime.db.isInstructorForProject(staff.id, sub.projectId);
        if (!scoped) throw new ApiError(403, 'forbidden', 'You are not assigned to review this project.');
      }
      const body = await parseJsonBody(ctx.req, ReviewSubmissionSchema);
      const projects = await ctx.runtime.db.listProjects();
      const rubric = projects.find((p) => p.id === sub.projectId)?.rubric ?? [];
      if (!rubric.length || body.rubricScores.length !== rubric.length ||
          !rubric.every((criterion) => body.rubricScores.some((score) => score.criterion === criterion.criterion &&
            score.maxPoints === criterion.maxPoints && score.score <= criterion.maxPoints))) {
        throw new ApiError(400, 'invalid_rubric', 'Score each project criterion using its published point limit.');
      }
      const earned = body.rubricScores.reduce((acc, r) => acc + r.score, 0);
      const max = body.rubricScores.reduce((acc, r) => acc + r.maxPoints, 0);
      const totalScore = max > 0 ? Math.min(100, Math.round((earned / max) * 100)) : 0;

      const reviewed = await ctx.runtime.db.reviewProjectSubmission({
        submissionId: sub.id,
        evaluatorId: staff.id,
        rubricScores: body.rubricScores,
        totalScore,
        feedback: body.feedback,
        approved: body.approved,
      });

      await ctx.runtime.auditLog({
        actorId: staff.id,
        action: body.approved ? 'project_submission_verified' : 'project_submission_changes_requested',
        resourceType: 'project_submission',
        resourceId: sub.id,
        ipHash: ctx.ipHash,
        metadata: { projectId: sub.projectId, totalScore },
      });

      await ctx.runtime.db.pushNotification(
        sub.userId,
        `review-${sub.id}`,
        body.approved
          ? `Your project submission was verified (${totalScore}%).`
          : `Instructor feedback is ready for your project submission (${totalScore}%).`,
        `/labs/${sub.projectId}`,
      );

      return jsonResponse(reviewed, 200, ctx.headers);
    },
  },
  {
    method: 'POST',
    pattern: '/api/instructor/courses',
    async handler(ctx) {
      const staff = await requireRole(ctx, ['instructor', 'admin']);
      const body = await parseJsonBody(ctx.req, CreateCourseSchema);
      const course = await ctx.runtime.db.createCourse({ ...body, instructorId: staff.id });
      await ctx.runtime.auditLog({ actorId: staff.id, action: 'course_created', resourceType: 'course', resourceId: course.id, ipHash: ctx.ipHash });
      return jsonResponse({ course }, 201, ctx.headers);
    },
  },
  {
    method: 'POST',
    pattern: '/api/instructor/rubrics',
    async handler(ctx) {
      const staff = await requireRole(ctx, ['instructor', 'admin']);
      const body = await parseJsonBody(ctx.req, UpsertRubricSchema);
      await ctx.runtime.db.upsertProjectRubric(body.projectId, body.criterion, body.description, body.maxPoints, staff);
      await ctx.runtime.auditLog({ actorId: staff.id, action: 'rubric_updated', resourceType: 'project', resourceId: body.projectId, ipHash: ctx.ipHash });
      return jsonResponse({ ok: true }, 200, ctx.headers);
    },
  },

  // --- Administrator endpoints ---
  {
    method: 'GET',
    pattern: '/api/admin/overview',
    async handler(ctx) {
      const admin = await requireRole(ctx, ['admin']);
      const [users, courses, languages, aiUsage] = await Promise.all([
        ctx.runtime.db.listAllProfiles(admin),
        ctx.runtime.db.listCourses(),
        ctx.runtime.db.listSpokenLanguages(true),
        ctx.runtime.ai.listUsageSummary(),
      ]);
      return jsonResponse({
        usersCount: users.length,
        roles: {
          student: users.filter((u) => u.role === 'student').length,
          instructor: users.filter((u) => u.role === 'instructor').length,
          admin: users.filter((u) => u.role === 'admin').length,
        },
        coursesCount: courses.length,
        languagesCount: languages.length,
        aiUsage,
      }, 200, ctx.headers);
    },
  },
  {
    method: 'GET',
    pattern: '/api/admin/users',
    async handler(ctx) {
      const admin = await requireRole(ctx, ['admin']);
      const users = await ctx.runtime.db.listAllProfiles(admin);
      return jsonResponse({ users }, 200, ctx.headers);
    },
  },
  {
    method: 'PATCH',
    pattern: '/api/admin/users/:id/role',
    async handler(ctx) {
      const admin = await requireRole(ctx, ['admin']);
      await enforceRateLimit(ctx, 'admin:role', admin.id, 30, 600);
      const body = await parseJsonBody(ctx.req, UpdateRoleSchema);
      if (ctx.params.id === admin.id && body.role !== 'admin') {
        throw new ApiError(400, 'self_demotion_blocked', 'Administrators cannot remove their own admin role.');
      }
      const updated = await ctx.runtime.db.setUserRole(ctx.params.id, body.role, admin);
      await ctx.runtime.auditLog({
        actorId: admin.id,
        action: 'user_role_changed',
        resourceType: 'profile',
        resourceId: updated.id,
        ipHash: ctx.ipHash,
        metadata: { newRole: body.role },
      });
      return jsonResponse({ user: updated }, 200, ctx.headers);
    },
  },
  {
    method: 'POST',
    pattern: '/api/admin/certificates/:id/revoke',
    async handler(ctx) {
      const admin = await requireRole(ctx, ['admin']);
      await enforceRateLimit(ctx, 'admin:revoke', admin.id, 30, 600);
      const body = await parseJsonBody(ctx.req, RevokeCertSchema);
      const revoked = await ctx.runtime.db.revokeCertificate(ctx.params.id, admin.id, body.reason);
      await ctx.runtime.auditLog({
        actorId: admin.id,
        action: 'certificate_revoked',
        resourceType: 'certificate',
        resourceId: revoked.id,
        ipHash: ctx.ipHash,
        metadata: { verificationCode: revoked.verificationCode, reason: body.reason },
      });
      return jsonResponse({ certificate: revoked }, 200, ctx.headers);
    },
  },
  {
    method: 'PATCH',
    pattern: '/api/admin/languages/:code',
    async handler(ctx) {
      const admin = await requireRole(ctx, ['admin']);
      const body = await parseJsonBody(ctx.req, ToggleLanguageSchema);
      const language = await ctx.runtime.db.setSpokenLanguageEnabled(ctx.params.code, body.enabled, admin);
      await ctx.runtime.auditLog({
        actorId: admin.id,
        action: 'spoken_language_updated',
        resourceType: 'spoken_language',
        resourceId: language.code,
        ipHash: ctx.ipHash,
        metadata: { enabled: body.enabled },
      });
      return jsonResponse({ language }, 200, ctx.headers);
    },
  },
  {
    method: 'GET',
    pattern: '/api/admin/ai-usage',
    async handler(ctx) {
      await requireRole(ctx, ['admin']);
      const summary = await ctx.runtime.ai.listUsageSummary();
      return jsonResponse({ summary }, 200, ctx.headers);
    },
  },
  {
    method: 'GET',
    pattern: '/api/admin/audit-logs',
    async handler(ctx) {
      const admin = await requireRole(ctx, ['admin']);
      const logs = await ctx.runtime.db.listAuditLogs(admin, 100);
      return jsonResponse({ logs }, 200, ctx.headers);
    },
  },
];
