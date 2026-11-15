// lib/dates.ts
//
// Manual date formatting for cross-platform stability.
//
// Why not `toLocaleDateString(locale, options)`:
//   React Native's Hermes on Android ships a partial Intl shim.
//   Requests for specific locale tags ('en-GB') combined with
//   option objects ({ month: 'short' }) crash with:
//     "can't access property 'length', returns is undefined"
//   which points at the options object but originates in missing
//   ICU locale data.
//
// Manual formatting avoids Intl entirely and produces byte-identical
// output on web, iOS, and Android — which also keeps exported PDF /
// Excel reports consistent across platforms.

const MONTHS_SHORT = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
] as const;

const MONTHS_LONG = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
] as const;

/** Internal — normalize any input to a Date (or null). */
function toDate(value: unknown): Date | null {
    if (value == null || value === '') return null;

    const raw = String(value).trim();
    if (!raw) return null;

    // "YYYY-MM-DD HH:mm:ss" → "YYYY-MM-DDTHH:mm:ss"
    const normalized = raw.includes(' ')
        ? raw.replace(' ', 'T')
        : raw;

    const d = new Date(normalized);
    return Number.isNaN(d.getTime()) ? null : d;
}

/** "2026-09-09" or "2026-09-09 14:30:00" → "09 Sep 2026" */
export function formatShortDate(value: unknown): string {
    const d = toDate(value);
    if (!d) return '—';

    const day = String(d.getDate()).padStart(2, '0');
    const month = MONTHS_SHORT[d.getMonth()] ?? '???';
    const year = d.getFullYear();

    return `${day} ${month} ${year}`;
}

/** "2026-09-09" → "9 September 2026" */
export function formatLongDate(value: unknown): string {
    const d = toDate(value);
    if (!d) return '—';

    const day = d.getDate();
    const month = MONTHS_LONG[d.getMonth()] ?? '???';
    const year = d.getFullYear();

    return `${day} ${month} ${year}`;
}

/** "2026-09-09T14:30:00Z" → "09 Sep, 14:30" */
export function formatShortDateTime(value: unknown): string {
    const d = toDate(value);
    if (!d) return '—';

    const day = String(d.getDate()).padStart(2, '0');
    const month = MONTHS_SHORT[d.getMonth()] ?? '???';
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');

    return `${day} ${month}, ${hh}:${mm}`;
}

/** "2026-09-09T14:30:00Z" → "09 Sep 2026 · 14:30" */
export function formatFullDateTime(value: unknown): string {
    const d = toDate(value);
    if (!d) return '—';

    const day = String(d.getDate()).padStart(2, '0');
    const month = MONTHS_SHORT[d.getMonth()] ?? '???';
    const year = d.getFullYear();
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');

    return `${day} ${month} ${year} · ${hh}:${mm}`;
}

/** "2026-09-09" → "2026-09-09" (passthrough / fallback safety) */
export function formatISODate(value: unknown): string {
    const d = toDate(value);
    if (!d) return '—';

    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');

    return `${y}-${m}-${day}`;
}