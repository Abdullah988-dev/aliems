import DOMPurify from "dompurify";

/**
 * Strip HTML tags, null bytes, and ASCII control characters from plain text inputs
 * so persisted inventory names, party names, and notes cannot inject markup or XSS.
 */
export function sanitizePlainText(value: string): string {
  const withoutNullAndControls = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
  // Strip any HTML/XML tag-like sequences cleanly while preserving normal math/comparison punctuation
  return withoutNullAndControls.replace(/<\/?[a-zA-Z][^>]*>/g, "").trim();
}

/**
 * Sanitize dynamic HTML safely in browser contexts using DOMPurify.
 * On the server, falls back to stripping tags entirely.
 */
export function sanitizeHtml(dirtyHtml: string): string {
  if (typeof window !== "undefined") {
    return DOMPurify.sanitize(dirtyHtml, {
      ALLOWED_TAGS: ["b", "i", "em", "strong", "span", "br"],
      ALLOWED_ATTR: [],
    });
  }
  return sanitizePlainText(dirtyHtml);
}

