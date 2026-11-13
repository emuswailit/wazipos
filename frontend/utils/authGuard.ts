// utils/authGuard.ts
//
// Helpers for "fail safe" data loading: recognise responses that only mean
// "you're not logged in (yet)" so callers can skip them quietly instead of
// logging errors or wiping data.

/** True when an apisauce response was rejected for missing / bad / expired login. */
export function isAuthFailure(res: any): boolean {
    if (!res || res.ok) return false;
    const status = Number(res.status);
    if (status === 401 || status === 403) return true;

    const data = res.data ?? {};
    const detail = String(data?.detail ?? '').toLowerCase();
    if (detail.includes('authentication credentials') || detail.includes('not authenticated') || detail.includes('token')) return true;

    const errors = Array.isArray(data?.errors) ? data.errors.map(String).join(' ').toLowerCase() : String(data?.errors ?? '').toLowerCase();
    return errors.includes('please log in') || errors.includes('not logged in');
}

/** Short, single-line description of a failed response for logs. */
export function describeFailure(res: any): string {
    if (!res) return 'no response';
    const detail = res.data?.detail || res.data?.response_message || (Array.isArray(res.data?.errors) ? res.data.errors.join('; ') : '');
    return [res.status, res.problem, detail].filter(Boolean).join(' · ') || 'unknown error';
}
