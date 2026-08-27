// URL extraction (spec §4.2) — pure, no side effects, safe on untrusted input.
// Accepts a free-text paste (URL, share text with emoji/口令). Returns ordered,
// de-duplicated, protocol-whitelisted URL candidates.

const URL_REGEX = /https?:\/\/[^\s<>"]+/gi;
const TRAILING_PUNCT = /[\s。，,；;！!？?、）)】\]}"'…—-]+$/;

export interface UrlExtractResult {
  candidates: string[];
  hasUrl: boolean;
}

export function extractUrls(raw: string): UrlExtractResult {
  if (!raw) return { candidates: [], hasUrl: false };
  const matches = raw.match(URL_REGEX) ?? [];
  const seen = new Set<string>();
  const candidates: string[] = [];
  for (const m of matches) {
    // Strip trailing CJK/ASCII punctuation that isn't part of the URL.
    const url = m.replace(TRAILING_PUNCT, '');
    if (!url) continue;
    // Reject anything that resolved to a disallowed protocol after trim.
    if (!/^https?:\/\//i.test(url)) continue;
    if (seen.has(url)) continue;
    seen.add(url);
    candidates.push(url);
  }
  return { candidates, hasUrl: candidates.length > 0 };
}

export function isAllowedProtocol(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}
