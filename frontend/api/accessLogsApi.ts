// api/accessLogsApi.ts
//
// Admins: the API access log — every request to api.wazipos.co.ke. Not signed
// in: IP and endpoint only. Signed in: also the user, the backend app reached,
// the URL, the action, the source (web / Android / iOS / script) and the screen
// it was sent from. Backend: authentication/access_logs.py
// (POST /authentication/access-logs), platform admins only. New rows also
// arrive live over ws/authentication/access-logs/ (hooks/useAccessLogEvents.ts).

import client from './client';

export type AccessScope = 'ALL' | 'SIGNED_IN' | 'ANONYMOUS' | 'ERRORS';
export type AccessSource = 'WEB' | 'ANDROID' | 'IOS' | 'SCRIPT' | 'UNKNOWN';

export interface AccessLog {
    id: number;
    created: string;
    ip: string;
    method: string;
    endpoint: string;
    status_code: number;
    duration_ms: number;
    /** The rest is filled for signed-in requests only. */
    user: string | null;
    user_label: string;
    entity_title: string;
    /** Backend app reached, e.g. "retailers". */
    app: string;
    url: string;
    action: string;
    source: AccessSource | '';
    /** Screen of our app the request was sent from. */
    client_route: string;
    user_agent: string;
}

export interface AccessStats {
    requests: number;
    ips: number;
    users: number;
    errors: number;
}

export interface AccessIp {
    ip: string;
    requests: number;
    errors: number;
    last_seen: string | null;
    first_seen: string | null;
    users: string[];
}

export interface AccessFilters {
    q?: string;
    ip?: string;
    user?: string;
    scope?: AccessScope;
    source?: AccessSource;
    app?: string;
    /** YYYY-MM-DD; both empty = the last 7 days. */
    date_from?: string;
    date_to?: string;
}

const ENDPOINT = '/authentication/access-logs';

export default {
    getLogs: (filters: AccessFilters & { page: number; page_size: number }) =>
        client.post(ENDPOINT, { action: 'GetAccessLogs', ...filters }),
    getIps: (filters: AccessFilters & { limit?: number }) => client.post(ENDPOINT, { action: 'GetAccessIps', ...filters }),
};
