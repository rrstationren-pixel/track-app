// Client-side upload guardrails. Server-side enforcement is configured at the
// Storage bucket level (allowed MIME types + size cap) for true security.
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB
export const ALLOWED_UPLOAD_MIME_PREFIXES = ["image/"] as const;
export const ALLOWED_UPLOAD_MIME_EXACT = ["application/pdf"] as const;

export function isAllowedUploadType(type: string): boolean {
  if (!type) return false;
  if (ALLOWED_UPLOAD_MIME_EXACT.includes(type as typeof ALLOWED_UPLOAD_MIME_EXACT[number])) return true;
  return ALLOWED_UPLOAD_MIME_PREFIXES.some((p) => type.startsWith(p));
}

/** Returns an error message if the file is invalid, otherwise null. */
export function validateUploadFile(file: File): string | null {
  if (!isAllowedUploadType(file.type)) {
    return "仅支持图片或 PDF 文件";
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return `文件过大，最大 ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB`;
  }
  return null;
}
