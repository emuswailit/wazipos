// lib/images.ts
//
// Shared image URL resolution for server-returned image paths.
//
// Handles the various shapes the backend sends:
//   "media/product.jpeg"
//   "/media/product.jpeg"
//   "https://cdn.example.com/x.jpeg"
//   { image, thumbnail, url }
//   [ { image, thumbnail } ]
//
// Relative paths are prefixed with API_BASE_URL. Path segments are
// URL-encoded so filenames with spaces survive the round trip.

export const API_BASE_URL = 'https://api.wazipos.co.ke';

export function resolveImageUrl(raw: any): string | null {
    if (!raw) return null;

    let path: string | null = null;

    /* -------- Array (first item wins) -------- */
    if (Array.isArray(raw) && raw.length > 0) {
        const first = raw[0];
        if (typeof first === 'string') {
            path = first;
        } else if (first && typeof first === 'object') {
            path =
                first.thumbnail ||
                first.image ||
                first.url ||
                null;
        }
    }
    /* -------- Object -------- */
    else if (typeof raw === 'object') {
        path =
            raw.thumbnail ||
            raw.image ||
            raw.url ||
            null;
    }
    /* -------- Raw string -------- */
    else if (typeof raw === 'string') {
        path = raw;
    }

    if (!path || !String(path).trim()) return null;

    const trimmed = String(path).trim();

    /* -------- Already absolute -------- */
    if (
        trimmed.startsWith('http://') ||
        trimmed.startsWith('https://')
    ) {
        return trimmed;
    }

    /* -------- Relative → absolute -------- */
    const cleanPath = trimmed.startsWith('/')
        ? trimmed.substring(1)
        : trimmed;

    const encoded = cleanPath
        .split('/')
        .map((seg) => encodeURIComponent(seg))
        .join('/');

    return `${API_BASE_URL}/${encoded}`;
}