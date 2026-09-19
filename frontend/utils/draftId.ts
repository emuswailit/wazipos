// utils/draftId.ts

/**
 * Deterministic draft identifier.
 *
 * Format: `${userId}:${productId}:${createdMs}`
 *
 * The first product added to the basket seeds the id. Subsequent
 * items on the same draft do not change it.
 */
export function buildDraftId(
    userId: string,
    productId: string,
    createdMs: number | null
): string {
    const ts = createdMs ?? Date.now();
    return `${userId}:${productId}:${ts}`;
}