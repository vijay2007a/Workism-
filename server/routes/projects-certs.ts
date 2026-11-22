import { z } from 'zod';
import { multilingualInstruction } from '../ai.ts';
import {
  checkCertificateEligibility,
  generateVerificationCode,
  renderCertificatePdf,
  signCertificatePayload,
  verifyCertificateSignature,
} from '../certificates.ts';
import { assertOwnWorkspaceBodyIds, assertOwnWorkspaceQuery, enforceRateLimit, requireAuth, type RouteDef } from '../router-utils.ts';
import { ApiError, isSafeGithubRepoUrl, jsonResponse, parseJsonBody, SECURITY_HEADERS } from '../security.ts';
import { buildSubmissionStoragePath, validateUploadBytes, validateUploadMetadata } from '../uploads.ts';

const UploadUrlSchema = z.object({
  fileName: z.string().min(1).max(200),
  mimeType: z.string().min(3).max(100),
  sizeBytes: z.number().int().positive(),
});

const ProjectSubmitSchema = z.object({
  repo: z.string().trim().max(300).optional(),
  storagePath: z.string().trim().max(400).optional(),
  fileName: z.string().trim().max(200).optional(),
  fileSizeBytes: z.number().int().positive().optional(),
  fileMime: z.string().trim().max(100).optional(),
  fileBase64: z.string().max(4_194_304).optional(), // Optional inline upload validation
  note: z.string().trim().max(1000).default(''),
  languageCode: z.string().trim().min(2).max(8).optional(),
}).refine((v) => Boolean(v.repo || v.storagePath || v.fileBase64), {
  message: 'Provide a GitHub repository URL or an uploaded project file.',
});

const PortfolioPatchSchema = z.object({
  portfolioSlug: z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9-]{2,38}[a-z0-9]$/).nullable().optional(),
  portfolioPublic: z.boolean().optional(),
  showScoresPublic: z.boolean().optional(),
  githubUsername: z.string().trim().regex(/^$|^[A-Za-z0-9-]{1,39}$/).optional(),
  workspaceId: z.string().trim().min(1).max(128).optional(),
  userId: z.string().trim().min(1).max(128).optional(),
  id: z.string().trim().min(1).max(128).optional(),
}).strict();

async function handlePublicVerify(ctx: Parameters<RouteDef['handler']>[0]) {
  await enforceRateLimit(ctx, 'cert:verify', ctx.ipHash, 60, 600);
  if (ctx.env.certificateSigningSecret.length < 32) {
    throw new ApiError(503, 'signing_not_configured', 'Certificate verification is not configured on this server.');
  }
  const code = decodeURIComponent(ctx.params.code || ctx.params.id || '').trim();
  if (!code || code.length > 64) {
    throw new ApiError(400, 'invalid_code', 'Invalid certificate verification code.');
  }
  const cert = await ctx.runtime.db.getIssuedCertificateByCode(code);
  if (!cert) {
    await ctx.runtime.db.logCertificateVerification({
      certificateId: null,
      verificationCode: code,
      outcome: 'not_found',
      clientHash: ctx.ipHash,
    });
    throw new ApiError(404, 'certificate_not_found', 'No issued certificate matches this code.');
  }

  const signatureValid = verifyCertificateSignature(cert, ctx.env.certificateSigningSecret);
  if (!signatureValid) {
    await ctx.runtime.db.logCertificateVerification({
      certificateId: cert.id,
      verificationCode: code,
      outcome: 'tampered',
      clientHash: ctx.ipHash,
    });
    throw new ApiError(409, 'signature_invalid', 'Certificate cryptographic integrity check failed.');
  }

  const outcome = cert.status === 'revoked' ? 'revoked' : 'verified';
  await ctx.runtime.db.logCertificateVerification({
    certificateId: cert.id,
    verificationCode: code,
    outcome,
    clientHash: ctx.ipHash,
  });

  // Expose ONLY approved public credential fields — NEVER user_id, email, or scores.
  return jsonResponse({
    id: cert.verificationCode,
    verificationCode: cert.verificationCode,
    title: cert.title,
    skill: cert.skillName,
    holderName: cert.holderName,
    course: cert.templateId,
    project: cert.templateId,
    status: cert.status,
    issuedAt: new Date(cert.issuedAt).getTime(),
    revokedAt: cert.revokedAt ? new Date(cert.revokedAt).getTime() : null,
    signatureVerified: true,
    signatureAlg: cert.signatureAlg,
    source: 'api',
  }, 200, ctx.headers);
}

export const projectsCertsRoutes: RouteDef[] = [
  {
    method: 'GET',
    pattern: '/api/projects',
    async handler(ctx) {
      const user = await requireAuth(ctx);
      assertOwnWorkspaceQuery(ctx.url, user.id);
      const [projects, submissions] = await Promise.all([
        ctx.runtime.db.listProjects(),
        ctx.runtime.db.listUserProjectSubmissions(user.id, user),
      ]);
      return jsonResponse({ projects, submissions }, 200, ctx.headers);
    },
  },
  {
    method: 'POST',
    pattern: '/api/projects/:id/upload-url',
    async handler(ctx) {
      const user = await requireAuth(ctx);
      await enforceRateLimit(ctx, 'project:upload', user.id, 15, 600);
      const projects = await ctx.runtime.db.listProjects();
      if (!projects.some((p) => p.id === ctx.params.id)) {
        throw new ApiError(404, 'project_not_found', 'Project not found.');
      }
      const body = await parseJsonBody(ctx.req, UploadUrlSchema);
      const { safeName, mime } = validateUploadMetadata(body.fileName, body.mimeType, body.sizeBytes);
      const objectPath = buildSubmissionStoragePath(user.id, ctx.params.id, safeName);
      const signed = await ctx.runtime.storage.createSignedUploadUrl(user.id, objectPath, mime);
      return jsonResponse({ ...signed, safeName, mimeType: mime }, 201, ctx.headers);
    },
  },
  {
    method: 'POST',
    pattern: '/api/projects/:id/submissions',
    async handler(ctx) {
      const user = await requireAuth(ctx);
      await enforceRateLimit(ctx, 'project:submit', user.id, 10, 600);
      const projects = await ctx.runtime.db.listProjects();
      const project = projects.find((p) => p.id === ctx.params.id);
      if (!project) throw new ApiError(404, 'project_not_found', 'Project not found.');

      const body = await parseJsonBody(ctx.req, ProjectSubmitSchema, 4_200_000);
      const repoUrl = body.repo?.trim() || null;
      if (repoUrl && !isSafeGithubRepoUrl(repoUrl)) {
        throw new ApiError(400, 'invalid_repo_url', 'Only plain https://github.com/owner/repo URLs are accepted.');
      }

      let storagePath: string | null = body.storagePath?.trim() || null;
      let fileName: string | null = body.fileName ?? null;
      let fileSizeBytes: number | null = body.fileSizeBytes ?? null;
      let fileMime: string | null = body.fileMime ?? null;

      if (storagePath && (!storagePath.startsWith(`${user.id}/${project.id}/`) || storagePath.includes('..') || storagePath.includes('\\'))) {
        throw new ApiError(403, 'forbidden_storage_path', 'Storage path must belong to your own account.');
      }
      let excerpt: string | null = null;
      if (body.fileBase64) {
        if (!fileName || !fileMime) {
          throw new ApiError(400, 'validation_error', 'fileName and fileMime are required when uploading a file.');
        }
        const bytes = Buffer.from(body.fileBase64, 'base64');
        const meta = validateUploadMetadata(fileName, fileMime, bytes.byteLength);
        validateUploadBytes(bytes, meta.mime);
        if (meta.mime.startsWith('text/')) excerpt = bytes.subarray(0, 3500).toString('utf8');
        fileName = meta.safeName;
        fileSizeBytes = bytes.byteLength;
        fileMime = meta.mime;
        const targetPath = buildSubmissionStoragePath(user.id, project.id, meta.safeName);
        const stored = await ctx.runtime.storage.uploadBytes(targetPath, new Uint8Array(bytes), meta.mime);
        storagePath = stored.path;
      } else if (storagePath) {
        if (!fileName || !fileMime || !fileSizeBytes) throw new ApiError(400, 'missing_metadata', 'Uploaded file details are required.');
        const meta = validateUploadMetadata(fileName, fileMime, fileSizeBytes);
        const file = await ctx.runtime.storage.readUpload(storagePath);
        const storedMime = file.type.split(';')[0].trim().toLowerCase();
        if (file.size !== fileSizeBytes || storedMime !== meta.mime || !storagePath.endsWith('-' + meta.safeName)) {
          throw new ApiError(400, 'upload_mismatch', 'Stored file details differ from the submission.');
        }
        const bytes = Buffer.from(await file.arrayBuffer());
        validateUploadBytes(bytes, meta.mime);
        if (meta.mime.startsWith('text/')) excerpt = bytes.subarray(0, 3500).toString('utf8');
        fileName = meta.safeName;
      }

      // Generate analytical AI review checklist against rubric (NEVER claims unexecuted tests passed or sets verified).
      const profile = await ctx.runtime.db.getProfile(user.id, user);
      const lang = body.languageCode ?? profile?.preferredLanguage ?? 'en';
      let aiFeedback: string | null = null;
      try {
        const aiRes = await ctx.runtime.ai.complete({
          userId: user.id,
          endpoint: 'project_feedback',
          languageCode: lang,
          systemPrompt: [
            'You are a constructive project reviewer.',
            multilingualInstruction(lang),
            'Evaluate only the submitted text and notes provided. A filename or URL alone supplies no evidence about contents. Return JSON with observations and nextSteps arrays of short strings.',
            'CRITICAL: Do NOT claim automated tests passed and do NOT approve or verify the project.',
          ].join(' '),
          userPrompt: JSON.stringify({
            project: project.title,
            requirements: project.requirements,
            rubric: project.rubric.map((r) => r.criterion),
            repoUrl,
            fileName,
            studentNote: body.note,
            submittedText: excerpt,
          }),
          maxOutputTokens: 500,
        });
        const cleanedAi = aiRes.text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
        const feedback = z.object({
          observations: z.array(z.string().trim().min(1).max(400)).min(1).max(5),
          nextSteps: z.array(z.string().trim().min(1).max(400)).min(1).max(5),
        }).parse(JSON.parse(cleanedAi));
        aiFeedback = [...feedback.observations, ...feedback.nextSteps].join('\n');
      } catch {
        aiFeedback = null;
      }

      const submission = await ctx.runtime.db.createProjectSubmission({
        projectId: project.id,
        userId: user.id,
        repoUrl,
        storagePath,
        fileName,
        fileSizeBytes,
        fileMime,
        note: body.note,
        aiFeedback,
      });

      await ctx.runtime.db.pushNotification(
        user.id,
        `project-${project.id}`,
        `Submitted "${project.title}" (v${submission.version}) for rubric evaluation.`,
        `/labs/${project.id}`,
      );

      return jsonResponse({ submission }, 201, ctx.headers);
    },
  },
  {
    method: 'GET',
    pattern: '/api/certificates',
    async handler(ctx) {
      const user = await requireAuth(ctx);
      assertOwnWorkspaceQuery(ctx.url, user.id);
      const [templates, issued, courses, lessonsDone, skills, submissions] = await Promise.all([
        ctx.runtime.db.listCertificateTemplates(),
        ctx.runtime.db.listUserCertificates(user.id, user),
        ctx.runtime.db.listCourses(),
        ctx.runtime.db.listLessonsDone(user.id, user),
        ctx.runtime.db.getUserSkills(user.id, user),
        ctx.runtime.db.listUserProjectSubmissions(user.id, user),
      ]);
      const issuedMap = new Map(issued.map((c) => [c.templateId, c]));
      const items = templates.map((tpl) => {
        const course = courses.find((c) => c.id === tpl.courseId);
        const eligibility = checkCertificateEligibility(tpl, course, lessonsDone, skills, submissions);
        const cert = issuedMap.get(tpl.id);
        return {
          template: tpl,
          eligibility,
          issued: cert
            ? {
                id: cert.id,
                verificationCode: cert.verificationCode,
                status: cert.status,
                issuedAt: cert.issuedAt,
                revokedAt: cert.revokedAt,
              }
            : null,
        };
      });
      return jsonResponse({ certificates: items }, 200, ctx.headers);
    },
  },
  {
    method: 'POST',
    pattern: '/api/certificates/:templateId/issue',
    async handler(ctx) {
      const user = await requireAuth(ctx);
      await enforceRateLimit(ctx, 'cert:issue', user.id, 10, 600);
      if (ctx.env.certificateSigningSecret.length < 32) {
        throw new ApiError(503, 'signing_not_configured', 'Certificate signing secret is not configured on this server.');
      }

      const [templates, courses, lessonsDone, skills, submissions, profile] = await Promise.all([
        ctx.runtime.db.listCertificateTemplates(),
        ctx.runtime.db.listCourses(),
        ctx.runtime.db.listLessonsDone(user.id, user),
        ctx.runtime.db.getUserSkills(user.id, user),
        ctx.runtime.db.listUserProjectSubmissions(user.id, user),
        ctx.runtime.db.getProfile(user.id, user),
      ]);

      const template = templates.find((t) => t.id === ctx.params.templateId);
      if (!template) throw new ApiError(404, 'template_not_found', 'Certificate template not found.');

      const course = courses.find((c) => c.id === template.courseId);
      const eligibility = checkCertificateEligibility(template, course, lessonsDone, skills, submissions);
      if (!eligibility.eligible) {
        throw new ApiError(403, 'not_eligible', 'Certificate eligibility requirements are not yet met.', {
          reasons: eligibility.reasons,
          eligibility,
        });
      }

      const holderName = (profile?.displayName || user.displayName || '').trim();
      if (!holderName) throw new ApiError(400, 'display_name_required', 'Choose a public certificate name in your profile first.');
      const skillName = skills.find((s) => s.id === template.skillId)?.name ?? template.skillId;
      const verificationCode = generateVerificationCode();
      const issuedAt = new Date().toISOString();
      const signaturePayload = {
        verificationCode,
        templateId: template.id,
        userId: user.id,
        holderName,
        title: template.title,
        skillName,
        issuedAt,
      };
      const signatureHex = signCertificatePayload(signaturePayload, ctx.env.certificateSigningSecret);

      const issued = await ctx.runtime.db.saveIssuedCertificate({
        verificationCode,
        templateId: template.id,
        userId: user.id,
        holderName,
        title: template.title,
        skillName,
        status: 'verified',
        issuedAt,
        issuedBy: user.id,
        signatureAlg: 'HMAC-SHA256',
        signaturePayload: signaturePayload as unknown as Record<string, unknown>,
        signatureHex,
      });

      await ctx.runtime.auditLog({
        actorId: user.id,
        action: 'certificate_issued',
        resourceType: 'certificate',
        resourceId: issued.id,
        ipHash: ctx.ipHash,
        metadata: { templateId: template.id, verificationCode },
      });

      await ctx.runtime.db.pushNotification(
        user.id,
        `cert-${template.id}`,
        `Your "${template.title}" certificate (${verificationCode}) has been issued.`,
        `/certificates/${verificationCode}`,
      );

      return jsonResponse({ certificate: issued }, 201, ctx.headers);
    },
  },
  {
    method: 'GET',
    pattern: '/api/certificates/:code/pdf',
    async handler(ctx) {
      await enforceRateLimit(ctx, 'cert:pdf', ctx.ipHash, 30, 600);
      if (ctx.env.certificateSigningSecret.length < 32) {
        throw new ApiError(503, 'signing_not_configured', 'Certificate signing secret is not configured on this server.');
      }
      const code = decodeURIComponent(ctx.params.code).trim();
      const cert = await ctx.runtime.db.getIssuedCertificateByCode(code);
      if (!cert) throw new ApiError(404, 'certificate_not_found', 'Certificate not found.');
      if (cert.status !== 'verified' || !verifyCertificateSignature(cert, ctx.env.certificateSigningSecret)) {
        throw new ApiError(409, 'certificate_invalid', 'Certificate is revoked or failed integrity verification.');
      }
      const verifyUrl = `${ctx.url.origin}/verify/${cert.verificationCode}`;
      const pdfBytes = renderCertificatePdf(cert, verifyUrl);
      return new Response(new Uint8Array(pdfBytes), {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="WORKISM-${cert.verificationCode}.pdf"`,
          ...SECURITY_HEADERS,
          ...ctx.headers,
        },
      });
    },
  },
  { method: 'GET', pattern: '/api/verify/:code', handler: handlePublicVerify },
  { method: 'GET', pattern: '/api/certificates/:id', handler: handlePublicVerify },
  {
    method: 'GET',
    pattern: '/api/portfolio',
    async handler(ctx) {
      const user = await requireAuth(ctx);
      assertOwnWorkspaceQuery(ctx.url, user.id);
      const [profile, skills, projects, submissions, certs] = await Promise.all([
        ctx.runtime.db.getProfile(user.id, user),
        ctx.runtime.db.getUserSkills(user.id, user),
        ctx.runtime.db.listProjects(),
        ctx.runtime.db.listUserProjectSubmissions(user.id, user),
        ctx.runtime.db.listUserCertificates(user.id, user),
      ]);
      const verifiedProjects = submissions
        .filter((s) => s.status === 'verified')
        .map((s) => {
          const p = projects.find((x) => x.id === s.projectId);
          return { id: s.projectId, title: p?.title ?? s.projectId, brief: p?.brief ?? '', repoUrl: s.repoUrl };
        });
      return jsonResponse({
        profile,
        skills,
        verifiedProjects,
        verifiedCertificates: certs.filter((c) => c.status === 'verified'),
      }, 200, ctx.headers);
    },
  },
  {
    method: 'PATCH',
    pattern: '/api/portfolio',
    async handler(ctx) {
      const user = await requireAuth(ctx);
      assertOwnWorkspaceQuery(ctx.url, user.id);
      const { workspaceId, userId, id, ...body } = await parseJsonBody(ctx.req, PortfolioPatchSchema);
      assertOwnWorkspaceBodyIds({ workspaceId, userId, id }, user.id);
      const profile = await ctx.runtime.db.updateProfile(user.id, body, user);
      return jsonResponse({ profile }, 200, ctx.headers);
    },
  },
  {
    method: 'GET',
    pattern: '/api/portfolio/:slug',
    async handler(ctx) {
      await enforceRateLimit(ctx, 'portfolio:public', ctx.ipHash, 60, 600);
      const slug = ctx.params.slug.trim().toLowerCase();
      const data = await ctx.runtime.db.getPublicPortfolio(slug);
      if (!data) throw new ApiError(404, 'portfolio_not_found', 'Public portfolio not found or private.');
      return jsonResponse({ portfolio: data }, 200, ctx.headers);
    },
  },
];
