// hooks/useRetailerInventory.ts
//
// Reads the retailer's inventory from `GetRetailerReceiptsForEntity`.
//
// Retailer receipts are ephemeral — fetched per request, never
// persisted to Dexie. The wire payload therefore carries its own
// UUID under `id` (a string), and `remote_id` is empty on these
// rows. `getReceiptKey` below accepts either field so downstream
// code (cart, badges, quantity input) has one stable identifier
// regardless of where the UUID lives.

import retailersApi from "@/api/retailersApi";
import type { RetailerReceipt } from "@/databases/types";
import useApi from "@/hooks/useApi";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/* ════════════════════════════════════════════════════════════
 *  Types
 * ════════════════════════════════════════════════════════════ */

export type InventorySortKey =
    | "relevance"
    | "price-asc"
    | "price-desc"
    | "name-asc"
    | "stock";

type InventoryStatus = "idle" | "loading" | "loaded" | "error";

/* ════════════════════════════════════════════════════════════
 *  Derivation helpers
 * ════════════════════════════════════════════════════════════ */

const num = (v: any, fallback = 0): number => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
};

/**
 * Stable identifier for a receipt.
 *
 * Retailer receipts are ephemeral — fetched per request, never
 * persisted to Dexie. So the wire `id` (a UUID string) is the
 * canonical key here. `remote_id` is preferred when it exists,
 * but on rows fetched live from the server it's the wire `id`
 * that carries the UUID.
 */
export function getReceiptKey(r: RetailerReceipt): string {
    const remote = r.remote_id;
    if (typeof remote === "string" && remote.length > 0) return remote;

    const wireId = (r as any).id;
    if (typeof wireId === "string" && wireId.length > 0) return wireId;
    if (typeof wireId === "number") return String(wireId);

    return "";
}

function getReceiptProductId(r: RetailerReceipt): string {
    return String(r.product);
}

export function getReceiptName(r: RetailerReceipt): string {
    return (
        r.product_title?.trim() ||
        r.long_title?.trim() ||
        r.title?.trim() ||
        "Unnamed product"
    );
}

export function getReceiptCategory(r: RetailerReceipt): string {
    const cat = r.category_title?.trim();
    if (cat) return cat;
    return r.manufacturer_title?.trim() || "Uncategorized";
}

export function getReceiptPrice(r: RetailerReceipt): number {
    const final = num(r.final_unit_selling_price);
    if (final > 0) return final;
    return num(r.unit_selling_price);
}

export function getReceiptOriginalPrice(r: RetailerReceipt): number {
    return num(r.unit_selling_price);
}

export function getReceiptDiscountPercent(r: RetailerReceipt): number {
    const original = num(r.unit_selling_price);
    const disc = num(r.unit_price_discount);
    if (original <= 0 || disc <= 0) return 0;
    return Math.round((disc / original) * 100);
}

export function getReceiptStock(r: RetailerReceipt): number {
    return num(r.current_unit_quantity);
}

export function getReceiptImage(r: RetailerReceipt): string | undefined {
    if (r.image_url) return r.image_url;
    if (r.thumbnail_url) return r.thumbnail_url;

    const images = r.images as any;
    if (!Array.isArray(images) || images.length === 0) return undefined;

    for (const img of images) {
        if (!img) continue;
        if (typeof img === "string" && img.length > 0) return img;
        if (typeof img === "object") {
            if (typeof img.thumbnail === "string" && img.thumbnail.length > 0)
                return img.thumbnail;
            if (typeof img.image === "string" && img.image.length > 0)
                return img.image;
            if (typeof img.url === "string" && img.url.length > 0) return img.url;
        }
    }
    return undefined;
}

/* ════════════════════════════════════════════════════════════
 *  Response parsing
 * ════════════════════════════════════════════════════════════ */

function extractRows(res: any): any[] {
    if (!res) return [];
    if (Array.isArray(res)) return res;

    if (Array.isArray(res.results)) return res.results;
    if (Array.isArray(res.receipts)) return res.receipts;
    if (Array.isArray(res.data)) return res.data;
    if (Array.isArray(res.data?.results)) return res.data.results;
    if (Array.isArray(res.data?.receipts)) return res.data.receipts;

    return [];
}

function aggregateByProduct(rows: RetailerReceipt[]): RetailerReceipt[] {
    const map = new Map<string, RetailerReceipt>();

    for (const r of rows) {
        const key = getReceiptProductId(r);
        const existing = map.get(key);

        if (!existing) {
            map.set(key, { ...r });
            continue;
        }

        const existingPrice = getReceiptPrice(existing);
        const nextPrice = getReceiptPrice(r);
        const useExisting =
            existingPrice > 0 &&
            (nextPrice <= 0 || existingPrice <= nextPrice);

        map.set(key, {
            ...existing,
            current_unit_quantity:
                getReceiptStock(existing) + getReceiptStock(r),
            received_unit_quantity:
                num(existing.received_unit_quantity) +
                num(r.received_unit_quantity),
            unit_selling_price: useExisting
                ? existing.unit_selling_price
                : r.unit_selling_price,
            unit_price_discount: useExisting
                ? existing.unit_price_discount
                : r.unit_price_discount,
            final_unit_selling_price: useExisting
                ? existing.final_unit_selling_price
                : r.final_unit_selling_price,
        });
    }

    return Array.from(map.values()).sort((a, b) =>
        getReceiptName(a).localeCompare(getReceiptName(b)),
    );
}

/* ════════════════════════════════════════════════════════════
 *  Hook
 * ════════════════════════════════════════════════════════════ */

export function useRetailerInventory(retailerId: string | null) {
    const [receipts, setReceipts] = useState<RetailerReceipt[]>([]);
    const [status, setStatus] = useState<InventoryStatus>("idle");
    const [error, setError] = useState<string | null>(null);

    const [searchQuery, setSearchQuery] = useState("");
    const [category, setCategory] = useState<string>("All");
    const [sort, setSort] = useState<InventorySortKey>("relevance");
    const [inStockOnly, setInStockOnly] = useState(false);

    const inventoryApi = useApi<any>(retailersApi.retailerReceiptsAction);

    const inventoryApiRef = useRef(inventoryApi);
    inventoryApiRef.current = inventoryApi;

    useEffect(() => {
        if (!retailerId) {
            setReceipts([]);
            setStatus("idle");
            setError(null);
            return;
        }

        let cancelled = false;
        setReceipts([]);
        setStatus("loading");
        setError(null);

        (async () => {
            try {
                const payload = {
                    action: "GetRetailerReceiptsForEntity",
                    entity: retailerId,
                };

                console.log(
                    "[GetRetailerReceiptsForEntity] request:",
                    payload,
                );

                const res = await inventoryApiRef.current.request(payload);

                if (cancelled) return;

                const raw =
                    (res as any)?.data ??
                    inventoryApiRef.current.data ??
                    res;
                const rawRows = extractRows(raw);

                const aggregated = aggregateByProduct(rawRows);

                console.log(
                    "[GetRetailerReceiptsForEntity] received",
                    rawRows.length,
                    "receipt(s) →",
                    aggregated.length,
                    "product(s) · sample key:",
                    aggregated[0] ? getReceiptKey(aggregated[0]) : "(none)",
                );

                setReceipts(aggregated);
                setStatus("loaded");
            } catch (e: any) {
                if (cancelled) return;
                console.error(
                    "[GetRetailerReceiptsForEntity] failed for entity",
                    retailerId,
                    ":",
                    e,
                );
                setError(
                    e?.response?.data?.detail ??
                    e?.message ??
                    "Failed to load inventory.",
                );
                setReceipts([]);
                setStatus("error");
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [retailerId]);

    const categories = useMemo(() => {
        const counts = new Map<string, number>();
        receipts.forEach((r) => {
            const name = getReceiptCategory(r);
            counts.set(name, (counts.get(name) ?? 0) + 1);
        });
        const sorted = Array.from(counts.entries())
            .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
            .map(([name, count]) => ({ name, count }));
        return [{ name: "All", count: receipts.length }, ...sorted];
    }, [receipts]);

    const filtered = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();

        const rows = receipts.filter((r) => {
            const name = getReceiptName(r);
            const categoryName = getReceiptCategory(r);
            const barCode = r.bar_code ?? "";

            const matchQ =
                !q ||
                `${name} ${categoryName} ${barCode}`
                    .toLowerCase()
                    .includes(q);

            const matchC = category === "All" || categoryName === category;
            const matchStock = !inStockOnly || getReceiptStock(r) > 0;

            return matchQ && matchC && matchStock;
        });

        switch (sort) {
            case "price-asc":
                return [...rows].sort(
                    (a, b) => getReceiptPrice(a) - getReceiptPrice(b),
                );
            case "price-desc":
                return [...rows].sort(
                    (a, b) => getReceiptPrice(b) - getReceiptPrice(a),
                );
            case "name-asc":
                return [...rows].sort((a, b) =>
                    getReceiptName(a).localeCompare(getReceiptName(b)),
                );
            case "stock":
                return [...rows].sort(
                    (a, b) => getReceiptStock(b) - getReceiptStock(a),
                );
            default:
                return rows;
        }
    }, [receipts, searchQuery, category, sort, inStockOnly]);

    const clearFilters = useCallback(() => {
        setSearchQuery("");
        setCategory("All");
        setSort("relevance");
        setInStockOnly(false);
    }, []);

    return {
        products: receipts,
        filtered,
        categories,
        searchQuery,
        setSearchQuery,
        category,
        setCategory,
        sort,
        setSort,
        inStockOnly,
        setInStockOnly,
        clearFilters,
        status,
        error,
        isLoading: status === "loading",
    };
}