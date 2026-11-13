// utils/flags.ts
//
// The backend sends many flags as strings, e.g. order.is_paid is "true" / "false"
// (sometimes "True" / "False"). A plain truthiness check is wrong for these because
// the string "false" is truthy. Use these helpers instead.
//
// Note: payment_summary.is_paid is a real boolean (computed in the serializer) and
// doesn't need them.

/** true for true, "true", "True", "TRUE", 1, "1", "yes"; false for everything else. */
export function isTrueFlag(v: unknown): boolean {
    if (v === true || v === 1) return true;
    if (typeof v === 'string') {
        const s = v.trim().toLowerCase();
        return s === 'true' || s === '1' || s === 'yes';
    }
    return false;
}

/** Normalise any flag value to the backend's "true" / "false" strings. */
export function toFlagString(v: unknown): 'true' | 'false' {
    return isTrueFlag(v) ? 'true' : 'false';
}
