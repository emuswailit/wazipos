// components/shopping/userPrescriptions/prescriptionImage.ts

/** Full URL for a prescription image (string path or { thumbnail | image | url }). */
export function resolveImage(raw: any): string | null {
    if (!raw) return null;
    const p = typeof raw === 'string' ? raw : raw.thumbnail || raw.image || raw.url || null;
    if (!p) return null;
    if (p.startsWith('http')) return p;
    return `https://api.wazipos.co.ke/${p.replace(/^\/+/, '')}`;
}
