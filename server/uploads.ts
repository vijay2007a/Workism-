import { ApiError } from './security.ts';

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

export const ALLOWED_UPLOAD_TYPES: Record<string, { exts: string[]; magic?: number[][] }> = {
  'application/pdf': { exts: ['.pdf'], magic: [[0x25, 0x50, 0x44, 0x46]] }, // %PDF
  'application/zip': { exts: ['.zip'], magic: [[0x50, 0x4b, 0x03, 0x04], [0x50, 0x4b, 0x05, 0x06]] }, // PK..
  'image/png': { exts: ['.png'], magic: [[0x89, 0x50, 0x4e, 0x47]] },
  'image/jpeg': { exts: ['.jpg', '.jpeg'], magic: [[0xff, 0xd8, 0xff]] },
  'text/plain': { exts: ['.txt', '.csv', '.json'] },
  'text/markdown': { exts: ['.md'] },
};

const BLOCKED_EXT = /\.(?:exe|dll|bat|cmd|ps1|sh|msi|scr|com|vbs|jar|php|phtml|html|htm|svg)$/i;

/** Strips directory separators and unsafe characters to prevent path traversal. */
export function sanitizeFilename(raw: string): string {
  const base = raw.split(/[\\/]/).pop() ?? '';
  const cleaned = base.replace(/[^A-Za-z0-9._-]/g, '_').replace(/^\.+/, '').slice(0, 120);
  if (!cleaned || cleaned === '.' || cleaned === '..' || cleaned.includes('..')) {
    throw new ApiError(400, 'invalid_filename', 'Filename is not valid.');
  }
  if (BLOCKED_EXT.test(cleaned)) {
    throw new ApiError(400, 'blocked_file_type', 'Executable or active web files are not allowed.');
  }
  return cleaned;
}

export function validateUploadMetadata(fileName: string, mimeType: string, sizeBytes: number): { safeName: string; mime: string } {
  const safeName = sanitizeFilename(fileName);
  if (mimeType === 'application/zip') throw new ApiError(415, 'archive_scanner_unavailable', 'Archive uploads require a configured malware scanner. Submit a repository link instead.');
  const spec = ALLOWED_UPLOAD_TYPES[mimeType];
  if (!spec) {
    throw new ApiError(400, 'unsupported_mime', 'File type is not supported. Allowed: PDF, PNG, JPEG, TXT, MD.');
  }
  const lower = safeName.toLowerCase();
  if (!spec.exts.some((ext) => lower.endsWith(ext))) {
    throw new ApiError(400, 'extension_mismatch', 'File extension does not match its content type.');
  }
  if (!Number.isInteger(sizeBytes) || sizeBytes <= 0 || sizeBytes > MAX_UPLOAD_BYTES) {
    throw new ApiError(400, 'invalid_file_size', 'File size must be between 1 byte and 10 MB.');
  }
  return { safeName, mime: mimeType };
}

/** Verifies file signature bytes (never trusts filename extension alone) and screens ZIP entries. */
export function validateUploadBytes(bytes: Uint8Array, mimeType: string): void {
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_UPLOAD_BYTES) {
    throw new ApiError(400, 'invalid_file_size', 'File size must be between 1 byte and 10 MB.');
  }
  const spec = ALLOWED_UPLOAD_TYPES[mimeType];
  if (!spec) throw new ApiError(400, 'unsupported_mime', 'File type is not supported.');
  if (spec.magic) {
    const matched = spec.magic.some((sig) => sig.every((b, idx) => bytes[idx] === b));
    if (!matched) {
      throw new ApiError(400, 'magic_bytes_mismatch', 'File contents do not match the declared file type.');
    }
  } else {
    // Plain text / markdown: reject NUL bytes (binary disguise) and embedded HTML script tags.
    if (bytes.includes(0)) throw new ApiError(400, 'binary_disguise', 'Binary content is not allowed in text files.');
  }

  if (mimeType === 'application/zip') {
    inspectZipSafety(bytes);
  }
}

/** Scans ZIP central/local headers for path traversal (Zip Slip) and dangerous executables. */
function inspectZipSafety(bytes: Uint8Array): void {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 0;
  let entryCount = 0;
  let totalUncompressed = 0;
  while (offset + 30 <= bytes.byteLength) {
    const sig = view.getUint32(offset, true);
    if (sig !== 0x04034b50) break; // Local file header signature
    const compressedSize = view.getUint32(offset + 18, true);
    const uncompressedSize = view.getUint32(offset + 22, true);
    const nameLen = view.getUint16(offset + 26, true);
    const extraLen = view.getUint16(offset + 28, true);
    if (offset + 30 + nameLen > bytes.byteLength) break;
    const entryName = new TextDecoder().decode(bytes.subarray(offset + 30, offset + 30 + nameLen));
    if (entryName.startsWith('/') || entryName.startsWith('\\') || entryName.includes('..')) {
      throw new ApiError(400, 'unsafe_archive', 'Archive contains unsafe path traversal entries.');
    }
    if (BLOCKED_EXT.test(entryName)) {
      throw new ApiError(400, 'unsafe_archive', 'Archive contains blocked executable or HTML files.');
    }
    entryCount += 1;
    totalUncompressed += uncompressedSize;
    if (entryCount > 200 || totalUncompressed > 50 * 1024 * 1024) {
      throw new ApiError(400, 'archive_limit_exceeded', 'Archive exceeds safe file count or uncompressed size limits.');
    }
    const next = offset + 30 + nameLen + extraLen + compressedSize;
    if (next <= offset) break;
    offset = next;
  }
}

export function buildSubmissionStoragePath(userId: string, projectId: string, safeName: string): string {
  const cleanProject = projectId.replace(/[^a-z0-9-]/gi, '');
  const stamp = crypto.randomUUID();
  return `${userId}/${cleanProject}/${stamp}-${safeName}`;
}
