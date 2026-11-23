// utils/apiFeedback.ts
//
// One place that turns a server response into words a person can act on.
//
// The backend answers business errors with HTTP 200 + `response_code: 1` and a
// `response_message` (custom_errors_response), field errors under `errors`, and
// unexpected errors as 4xx/5xx JSON. apisauce adds `problem` for transport failures
// (NETWORK_ERROR, TIMEOUT_ERROR, CONNECTION_ERROR). Screens call `errorText` for a
// one-line message, or `describeResponse` when they also want a title, a tone and
// the field errors (ApiErrorModal, toasts).

import { isServerOk } from './serverResponse';

export type FeedbackTone = 'success' | 'info' | 'warning' | 'danger' | 'offline';

export interface FieldError {
    field: string;
    message: string;
}

export interface ResponseFeedback {
    ok: boolean;
    tone: FeedbackTone;
    title: string;
    message: string;
    fields: FieldError[];
    status?: number;
    /** apisauce problem code, e.g. NETWORK_ERROR. */
    problem?: string | null;
    /** True when retrying later (or when back online) is likely to work. */
    retryable: boolean;
}

const OFFLINE = new Set(['NETWORK_ERROR', 'CONNECTION_ERROR', 'CANCEL_ERROR']);

/** Server-provided human text, if any. */
function serverMessage(data: any): string | null {
    if (!data || typeof data !== 'object') return typeof data === 'string' && data.length < 300 && !/<html/i.test(data) ? data : null;
    const m = data.response_message ?? data.message ?? data.detail ?? data.error ?? data.non_field_errors;
    if (Array.isArray(m)) return m.filter(Boolean).join(' ') || null;
    return typeof m === 'string' && m.trim() ? m.trim() : null;
}

/** Field errors from `errors` (list of strings, list of {field,message}, or {field: [msgs]}). */
export function fieldErrors(data: any): FieldError[] {
    const errs = data?.errors;
    if (!errs) return [];
    if (Array.isArray(errs)) {
        return errs
            .map((e: any) => (typeof e === 'string' ? { field: '', message: e } : { field: String(e?.field ?? ''), message: String(e?.message ?? e?.detail ?? '') }))
            .filter((e) => e.message);
    }
    if (typeof errs === 'object') {
        return Object.entries(errs).flatMap(([field, v]) =>
            (Array.isArray(v) ? v : [v]).filter(Boolean).map((m: any) => ({ field: field === 'non_field_errors' ? '' : field, message: typeof m === 'string' ? m : JSON.stringify(m) }))
        );
    }
    return typeof errs === 'string' ? [{ field: '', message: errs }] : [];
}

/** Default wording per HTTP status, used when the server says nothing useful. */
function byStatus(status: number | undefined): { tone: FeedbackTone; title: string; message: string; retryable: boolean } | null {
    if (!status) return null;
    if (status === 400 || status === 422) return { tone: 'warning', title: 'Check the details', message: 'Some of the details need fixing before this can be saved.', retryable: false };
    if (status === 401) return { tone: 'warning', title: 'Session expired', message: 'Please sign in again to continue.', retryable: false };
    if (status === 402) return { tone: 'warning', title: 'Subscription needed', message: 'This feature needs an active subscription.', retryable: false };
    if (status === 403) return { tone: 'danger', title: 'Not allowed', message: "Your account doesn't have permission to do this.", retryable: false };
    if (status === 404) return { tone: 'warning', title: 'Not found', message: 'This record no longer exists or was moved.', retryable: false };
    if (status === 408) return { tone: 'warning', title: 'Timed out', message: 'The server took too long to answer. Try again.', retryable: true };
    if (status === 409) return { tone: 'warning', title: 'Already changed', message: 'Someone else changed this just now. Refresh and try again.', retryable: true };
    if (status === 413) return { tone: 'warning', title: 'Too large', message: 'That file or request is too large. Try a smaller one.', retryable: false };
    if (status === 429) return { tone: 'warning', title: 'Slow down', message: 'Too many requests in a short time. Wait a moment and try again.', retryable: true };
    if (status >= 500) return { tone: 'danger', title: 'Server problem', message: "Something went wrong on our side. It's not your fault — try again shortly.", retryable: true };
    return null;
}

/**
 * Everything a screen needs to tell the user what happened.
 * @param fallback what to say when neither the server nor the status explains it.
 */
export function describeResponse(res: any, fallback = 'Something went wrong. Please try again.'): ResponseFeedback {
    const data = res?.data;
    const status: number | undefined = typeof res?.status === 'number' ? res.status : undefined;
    const problem: string | null = res?.problem ?? null;
    const fields = fieldErrors(data);
    const said = serverMessage(data);

    if (res && isServerOk(res)) {
        return { ok: true, tone: 'success', title: 'Done', message: said || 'Saved.', fields: [], status, problem, retryable: false };
    }

    if (!status && problem && OFFLINE.has(problem)) {
        return { ok: false, tone: 'offline', title: "You're offline", message: "We couldn't reach WaziPOS. Check your internet connection and try again.", fields, status, problem, retryable: true };
    }
    if (!status && problem === 'TIMEOUT_ERROR') {
        return { ok: false, tone: 'warning', title: 'Slow connection', message: 'The server took too long to answer. Check your connection and try again.', fields, status, problem, retryable: true };
    }

    const st = byStatus(status);
    // The backend sends a short headline in response_message ("Not saved", "Not allowed")
    // and the reason in `errors` — so headline → title, reasons → message.
    const reasons = fields.map((f) => (f.field ? `${prettyField(f.field)}: ${f.message}` : f.message)).join('\n');
    const headline = said && said.length <= 60 ? said : null;

    // Business rejection: HTTP 200 with response_code 1 → the server's own words.
    if (!st || (status && status < 300)) {
        const title = headline && reasons ? headline : fields.length ? 'Check the details' : 'Not completed';
        const message = reasons || said || fallback;
        return { ok: false, tone: 'danger', title, message, fields, status, problem, retryable: false };
    }
    // 5xx: the server's text is often a stack trace; keep the friendly wording.
    if (status !== undefined && status >= 500) {
        return { ok: false, tone: st.tone, title: st.title, message: st.message, fields: [], status, problem, retryable: st.retryable };
    }
    return {
        ok: false, tone: st.tone,
        title: headline && reasons ? headline : st.title,
        message: reasons || said || st.message,
        fields, status, problem, retryable: st.retryable,
    };
}

/**
 * One-line message for a failed request: the server's message or field errors,
 * else friendly wording for the status / connection problem, else `fallback`.
 */
export function errorText(res: any, fallback = 'Something went wrong. Please try again.'): string {
    return describeResponse(res, fallback).message;
}

/** Same as errorText (older screens call it apiError). */
export const apiError = errorText;

/** `accepted_lines.0.product_id` → `Accepted lines · 1 · Product id` */
export function prettyField(field: string): string {
    if (!field) return '';
    const s = field
        .replace(/\.(\d+)\./g, (_m, n) => ` · ${Number(n) + 1} · `)
        .replace(/[_.]/g, ' ')
        .trim();
    return s.charAt(0).toUpperCase() + s.slice(1);
}
