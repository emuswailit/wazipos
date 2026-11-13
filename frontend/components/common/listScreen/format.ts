// components/admin/kit/format.ts
//
// Formatting helpers shared by the admin list, details and form screens.

/** "12 Mar 2026"; "—" for empty, the raw string when it isn't a date. */
export function formatDate(raw?: string | null): string {
    if (!raw) return '—';
    const d = new Date(String(raw).replace(' ', 'T'));
    if (isNaN(d.getTime())) return String(raw);
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' });
}

/** "12 Mar 2026, 14:05". */
export function formatDateTime(raw?: string | null): string {
    if (!raw) return '—';
    const d = new Date(String(raw).replace(' ', 'T'));
    if (isNaN(d.getTime())) return String(raw);
    return d.toLocaleString(undefined, { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

/** Up to two initials from a name or title ("Oral route" → "OR"). */
export function initialsOf(text?: string | null): string {
    const words = String(text ?? '')
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .trim()
        .split(/\s+/)
        .filter(Boolean);
    if (words.length === 0) return '?';
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    return (words[0][0] + words[1][0]).toUpperCase();
}

/** Trimmed text, or the fallback when empty / placeholder-ish. */
export function textOr(value: unknown, fallback = '—'): string {
    const s = value === null || value === undefined ? '' : String(value).trim();
    return s && s !== 'UNSPECIFIED' && s !== '—' ? s : fallback;
}

/** "1 route" / "3 routes". */
export function plural(n: number, noun: [string, string]): string {
    return `${n.toLocaleString()} ${n === 1 ? noun[0] : noun[1]}`;
}

/** Stable accent colour per string, for avatars without an image. */
const ACCENTS = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#14b8a6', '#ec4899'];
export function accentFor(seed?: string | null): string {
    const s = String(seed ?? '');
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return ACCENTS[Math.abs(h) % ACCENTS.length];
}
