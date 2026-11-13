import client from "@/api/client";
import { useEffect, useState } from "react";

interface Category {
    id: string;
    title: string;
    icon?: string | null;
    iconCategory?: string | null;
}

function normalizeCategory(c: any): Category | null {
    const id = String(c?.id ?? c?.uuid ?? "");
    const title = String(c?.title ?? c?.name ?? "");
    if (!id || !title) return null;
    return {
        id,
        title,
        icon: c?.icon ?? null,
        iconCategory: c?.icon_category ?? null,
    };
}

function extractRows(res: any): any[] {
    if (!res) return [];
    if (Array.isArray(res)) return res;
    if (Array.isArray(res.results)) return res.results;
    if (Array.isArray(res.data)) return res.data;
    if (Array.isArray(res.data?.results)) return res.data.results;
    return [];
}

export function useCategories() {
    const [categories, setCategories] = useState<Category[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;

        (async () => {
            try {
                const res: any = await client.post(
                    "/authentication/categories",
                    { action: "GetAllCategories" },
                );

                if (cancelled) return;

                const raw = res?.data ?? res;
                const rows = extractRows(raw);

                console.log("[GetAllCategories] received", rows.length, "categories");

                setCategories(
                    rows.map(normalizeCategory).filter(Boolean) as Category[],
                );
                setError(null);
            } catch (e: any) {
                if (cancelled) return;
                console.error("[GetAllCategories] failed:", e);
                setError(
                    e?.response?.data?.detail ??
                    e?.message ??
                    "Failed to load categories.",
                );
                setCategories([]);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, []);

    return { categories, loading, error };
}