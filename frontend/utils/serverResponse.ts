// utils/serverResponse.ts
//
// One rule for "did the server accept this request?".
//
// The backend reports business errors as HTTP 200 with `response_code: 1`
// (custom_errors_response), and unexpected errors as 4xx/5xx JSON with
// `response_code: 1` (utils/exceptionhandler.py). So neither `res.ok` nor the
// HTTP status alone is enough — checking only those treats rejected requests
// as successes (and, for offline queues, drops them as "synced").

/**
 * True when the request succeeded: an OK (2xx) status and no non-zero
 * `response_code`. Responses without a `response_code` (e.g. `{ status: 'accepted' }`
 * with 202) count as success when the status is OK.
 *
 * @param res  apisauce response (or anything with `ok` / `status` / `data`)
 * @param data the parsed body; defaults to `res.data ?? res`
 */
export function isServerOk(res: any, data: any = res?.data ?? res): boolean {
    if (!res) return false;
    if (res.ok === false) return false;
    if (typeof res.status === 'number' && (res.status < 200 || res.status >= 300)) return false;
    const code = data?.response_code;
    return code === undefined || code === null || String(code) === '0';
}
