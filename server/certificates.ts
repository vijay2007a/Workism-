import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { CertificateTemplateRecord, CourseRecord, IssuedCertificateRecord, ProjectSubmissionRecord, UserSkillView } from './types.ts';

export interface SignaturePayload {
  verificationCode: string;
  templateId: string;
  userId: string;
  holderName: string;
  title: string;
  issuedAt: string;
}

export function generateVerificationCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // avoids 0/O/1/I confusion
  const bytes = randomBytes(12);
  let out = '';
  for (let i = 0; i < 12; i++) {
    out += alphabet[bytes[i] % alphabet.length];
    if (i === 3 || i === 7) out += '-';
  }
  return `WRK-${out}`;
}

export function canonicalPayloadString(payload: SignaturePayload): string {
  return JSON.stringify({
    holderName: payload.holderName,
    issuedAt: payload.issuedAt,
    templateId: payload.templateId,
    title: payload.title,
    userId: payload.userId,
    verificationCode: payload.verificationCode,
  });
}

export function signCertificatePayload(payload: SignaturePayload, secret: string): string {
  if (secret.length < 32) {
    throw new Error('CERTIFICATE_SIGNING_SECRET must be at least 32 characters.');
  }
  return createHmac('sha256', secret).update(canonicalPayloadString(payload)).digest('hex');
}

export function verifyCertificateSignature(cert: IssuedCertificateRecord, secret: string): boolean {
  if (secret.length < 32 || cert.signatureAlg !== 'HMAC-SHA256') return false;
  const raw = cert.signaturePayload as Partial<SignaturePayload>;
  if (!raw.verificationCode || !raw.templateId || !raw.userId || !raw.holderName || !raw.title || !raw.issuedAt) {
    return false;
  }
  const expected = signCertificatePayload(raw as SignaturePayload, secret);
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(cert.signatureHex, 'hex');
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}

export interface EligibilityCheck {
  eligible: boolean;
  courseComplete: boolean;
  assessmentPassed: boolean;
  projectVerified: boolean;
  reasons: string[];
}

export function checkCertificateEligibility(
  template: CertificateTemplateRecord,
  course: CourseRecord | undefined,
  lessonsDone: readonly string[],
  skills: readonly UserSkillView[],
  submissions: readonly ProjectSubmissionRecord[],
): EligibilityCheck {
  const courseLessons = course ? course.modules.flatMap((m) => m.lessons.map((l) => l.id)) : [];
  const courseComplete = courseLessons.length > 0 && courseLessons.every((id) => lessonsDone.includes(id));

  const skill = skills.find((s) => s.id === template.skillId);
  const assessmentPassed = Boolean(skill && skill.source === 'api' && skill.score >= template.passMark);

  const projectVerified = submissions.some((s) => s.projectId === template.projectId && s.status === 'verified');

  const reasons: string[] = [];
  if (!courseComplete) reasons.push(`Complete all lessons in ${course?.title ?? template.courseId}.`);
  if (!assessmentPassed) reasons.push(`Pass the official ${skill?.name ?? template.skillId} skill assessment (>= ${template.passMark}%).`);
  if (!projectVerified) reasons.push(`Receive verified approval on project ${template.projectId}.`);

  return {
    eligible: courseComplete && assessmentPassed && projectVerified,
    courseComplete,
    assessmentPassed,
    projectVerified,
    reasons,
  };
}

function pdfEscape(text: string): string {
  // Strip non-ASCII cleanly for Type1 Helvetica fallback and escape PDF string delimiters.
  return text.replace(/[^\x20-\x7e]/g, '?').replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

/** Generates a standards-compliant single-page PDF 1.4 certificate with zero external binaries. */
export function renderCertificatePdf(cert: IssuedCertificateRecord, verifyUrl: string): Uint8Array {
  const issuedDate = new Date(cert.issuedAt).toISOString().slice(0, 10);
  const streamLines = [
    '0.95 0.94 0.99 rg 0 0 792 612 re f',
    '0.42 0.28 0.92 RG 3 w 36 36 720 540 re S',
    '0.75 0.68 0.96 RG 1 w 48 48 696 516 re S',
    '0.11 0.10 0.23 rg',
    'BT /F1 18 Tf 72 510 Td (WORKISM 3.0  |  VERIFIED DIGITAL CREDENTIAL) Tj ET',
    'BT /F2 34 Tf 72 440 Td (' + pdfEscape(cert.title) + ') Tj ET',
    'BT /F1 14 Tf 72 395 Td (Awarded to) Tj ET',
    'BT /F2 26 Tf 72 360 Td (' + pdfEscape(cert.holderName) + ') Tj ET',
    'BT /F1 14 Tf 72 315 Td (Skill verified: ' + pdfEscape(cert.skillName) + ') Tj ET',
    'BT /F1 13 Tf 72 275 Td (Issued: ' + pdfEscape(issuedDate) + '   |   Status: ' + pdfEscape(cert.status.toUpperCase()) + ') Tj ET',
    'BT /F1 12 Tf 72 225 Td (Certificate ID: ' + pdfEscape(cert.verificationCode) + ') Tj ET',
    'BT /F1 11 Tf 72 200 Td (Verify online: ' + pdfEscape(verifyUrl) + ') Tj ET',
    'BT /F1 9 Tf 72 95 Td (Cryptographic Signature (' + pdfEscape(cert.signatureAlg) + '): ' + pdfEscape(cert.signatureHex.slice(0, 48)) + '...) Tj ET',
  ].join('\n');

  const objects: string[] = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 792 612] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>\nendobj\n',
    '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
    '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n',
    `6 0 obj\n<< /Length ${Buffer.byteLength(streamLines, 'utf8')} >>\nstream\n${streamLines}\nendstream\nendobj\n`,
  ];

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(pdf, 'utf8'));
    pdf += obj;
  }
  const xrefOffset = Buffer.byteLength(pdf, 'utf8');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return new TextEncoder().encode(pdf);
}
