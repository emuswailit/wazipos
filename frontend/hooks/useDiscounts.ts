// List + detail hooks for the two discount kinds.
//
// Both reads go through `api.wholesaleReceiptsAction` with a distinct
// `action` string. The server returns a `response_code` envelope; the
// payload key varies (`price_discounts`, `quantity_discounts`, …), so
// `unwrap` accepts a list of candidate keys.

import api from "@/api/wholesalersApi";
import type { PriceDiscount } from "@/components/wholesalers/priceDiscounts/types";
import type { QuantityDiscount } from "@/components/wholesalers/quantityDiscounts/types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/* =========================================================
 * Envelope helper
 * ======================================================= */

interface Envelope<T> {
    response_code: number;
    response_message?: string;
    errors?: Record<string, string | string[]>;
    payload: T | null;
}

function unwrap<T>(data: any, ...keys: string[]): Envelope<T> {
    const env = data ?? {};
    const payload =
        keys
            .map((k) => env[k])
            .find((v) => v !== undefined && v !== null) ?? null;
    return {
        response_code: env.response_code ?? 0,
        response_message: env.response_message,
        errors: env.errors,
        payload: payload as T | null,
    };
}

/* =========================================================
 * Filter shapes
 * ======================================================= */

export interface DiscountListFilters {
    state?: "active" | "scheduled" | "expired" | "inactive";
    search?: string;
    page?: number;
    page_size?: number;
}

/* =========================================================
 * Price discounts
 * ======================================================= */

export function usePriceDiscountList(filters?: DiscountListFilters) {
    const [data, setData] = useState<PriceDiscount[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const mounted = useRef(true);
    const filtersKey = useMemo(
        () => JSON.stringify(filters ?? {}),
        [filters]
    );

    const load = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const res = await api.wholesaleReceiptsAction({
                action: "WholesalerPriceDiscounts",
                ...(filters ?? {}),
            });
            const env = unwrap<PriceDiscount[]>(
                res.data,
                "price_discounts",
                "discounts",
                "results"
            );
            if (!res.ok || env.response_code !== 0) {
                throw new Error(
                    env.response_message ??
                    (res.data as any)?.message ??
                    "Could not load price discounts."
                );
            }
            if (mounted.current) setData(env.payload ?? []);
        } catch (e: any) {
            if (mounted.current) setError(e?.message ?? "Unknown error");
        } finally {
            if (mounted.current) setIsLoading(false);
        }
    }, [filtersKey]);

    useEffect(() => {
        mounted.current = true;
        load();
        return () => {
            mounted.current = false;
        };
    }, [load]);

    return { data, isLoading, error, refresh: load };
}

export function usePriceDiscountDetails(id?: string) {
    const [data, setData] = useState<PriceDiscount | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const mounted = useRef(true);

    const load = useCallback(async () => {
        if (!id) {
            setData(null);
            return;
        }
        setIsLoading(true);
        setError(null);
        try {
            const res = await api.wholesaleReceiptsAction({
                action: "WholesalerPriceDiscounts",
                id,
            });
            const env = unwrap<PriceDiscount[] | PriceDiscount>(
                res.data,
                "price_discounts",
                "discounts",
                "price_discount",
                "discount",
                "results"
            );
            if (!res.ok || env.response_code !== 0) {
                throw new Error(
                    env.response_message ?? "Could not load discount."
                );
            }
            const payload = env.payload;
            const record = Array.isArray(payload)
                ? payload.find((d) => d.id === id) ?? null
                : payload;
            if (mounted.current) setData(record);
        } catch (e: any) {
            if (mounted.current) setError(e?.message ?? "Unknown error");
        } finally {
            if (mounted.current) setIsLoading(false);
        }
    }, [id]);

    useEffect(() => {
        mounted.current = true;
        load();
        return () => {
            mounted.current = false;
        };
    }, [load]);

    return { data, isLoading, error, refresh: load };
}

/* =========================================================
 * Quantity discounts
 * ======================================================= */

export function useQuantityDiscountList(filters?: DiscountListFilters) {
    const [data, setData] = useState<QuantityDiscount[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const mounted = useRef(true);
    const filtersKey = useMemo(
        () => JSON.stringify(filters ?? {}),
        [filters]
    );

    const load = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const res = await api.wholesaleReceiptsAction({
                action: "WholesalerQuantityDiscounts",
                ...(filters ?? {}),
            });
            const env = unwrap<QuantityDiscount[]>(
                res.data,
                "quantity_discounts",
                "discounts",
                "results"
            );
            if (!res.ok || env.response_code !== 0) {
                throw new Error(
                    env.response_message ??
                    (res.data as any)?.message ??
                    "Could not load quantity discounts."
                );
            }
            if (mounted.current) setData(env.payload ?? []);
        } catch (e: any) {
            if (mounted.current) setError(e?.message ?? "Unknown error");
        } finally {
            if (mounted.current) setIsLoading(false);
        }
    }, [filtersKey]);

    useEffect(() => {
        mounted.current = true;
        load();
        return () => {
            mounted.current = false;
        };
    }, [load]);

    return { data, isLoading, error, refresh: load };
}

export function useQuantityDiscountDetails(id?: string) {
    const [data, setData] = useState<QuantityDiscount | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const mounted = useRef(true);

    const load = useCallback(async () => {
        if (!id) {
            setData(null);
            return;
        }
        setIsLoading(true);
        setError(null);
        try {
            const res = await api.wholesaleReceiptsAction({
                action: "WholesalerQuantityDiscounts",
                id,
            });
            const env = unwrap<QuantityDiscount[] | QuantityDiscount>(
                res.data,
                "quantity_discounts",
                "discounts",
                "quantity_discount",
                "discount",
                "results"
            );
            if (!res.ok || env.response_code !== 0) {
                throw new Error(
                    env.response_message ?? "Could not load discount."
                );
            }
            const payload = env.payload;
            const record = Array.isArray(payload)
                ? payload.find((d) => d.id === id) ?? null
                : payload;
            if (mounted.current) setData(record);
        } catch (e: any) {
            if (mounted.current) setError(e?.message ?? "Unknown error");
        } finally {
            if (mounted.current) setIsLoading(false);
        }
    }, [id]);

    useEffect(() => {
        mounted.current = true;
        load();
        return () => {
            mounted.current = false;
        };
    }, [load]);

    return { data, isLoading, error, refresh: load };
}