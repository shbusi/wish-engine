/**
 * Lightweight content guard. This is not a full moderation system —
 * it catches the obvious and leaves the rest to human review.
 */
const BLOCKLIST = [
  // Contact / spam
  /https?:\/\//i,
  /\bwww\./i,
  /\b\d{3}[-.\s]?\d{3,4}[-.\s]?\d{4}\b/, // phone numbers
  /@[a-z0-9_]{3,}/i, // handles
];

export function sanitizeWish(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function violates(text: string): boolean {
  return BLOCKLIST.some((re) => re.test(text));
}

export const WISH_MIN = 2;
export const WISH_MAX = 280;
export const NAME_MAX = 40;
