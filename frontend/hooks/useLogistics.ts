// hooks/useLogistics.ts

import retailersApi from "@/api/retailersApi";
import { useApi } from "@/hooks/useApi";
import { useEffect, useRef, useState } from "react";

export type Courier = { id: string; entity_title: string; };
export type CollectionPoint = { id: string; name: string; address: string; latitude: number; longitude: number; };

const extractArray = (res: any, expectedKey: string): any[] => {
    if (!res) return [];
    if (Array.isArray(res)) return res;
    if (Array.isArray(res.data)) return res.data;
    if (Array.isArray(res.data?.[expectedKey])) return res.data[expectedKey];
    if (Array.isArray(res.data?.results)) return res.data.results;
    if (Array.isArray(res.data?.data)) return res.data.data;
    if (Array.isArray(res[expectedKey])) return res[expectedKey];
    if (Array.isArray(res.results)) return res.results;
    return [];
};

export function useLogistics(
    deliveryMethod: string,
    selectedCourierId: string | null,
    county?: string,
    isEnabled: boolean = true
) {
    const [couriers, setCouriers] = useState<Courier[]>([]);
    const [deliveryEntities, setDeliveryEntities] = useState<Courier[]>([]);
    const [collectionPoints, setCollectionPoints] = useState<CollectionPoint[]>([]);

    const [couriersLoading, setCouriersLoading] = useState(false);
    const [deliveryEntitiesLoading, setDeliveryEntitiesLoading] = useState(false);
    const [pointsLoading, setPointsLoading] = useState(false);

    const [error, setError] = useState<string | null>(null);

    const fetchApi = useApi<any>(async (payload: any) =>
        await retailersApi.retailerReceiptsAction(payload)
    );

    const fetchApiRef = useRef(fetchApi);
    fetchApiRef.current = fetchApi;

    useEffect(() => {
        if (!isEnabled || deliveryMethod !== "COURIER") return;
        let cancelled = false;

        const fetchData = async () => {
            setCouriersLoading(true);
            setError(null);
            try {
                // 🟢 Added .catch() to prevent app crash on network failure
                const res = await fetchApiRef.current.request({ action: "GetCourierEntities" }).catch((e: any) => {
                    console.warn("Network error fetching couriers:", e.message);
                    return { ok: false, data: { message: "Network error." } };
                });
                if (!cancelled) {
                    const results = extractArray(res, "couriers");
                    setCouriers(results);
                }
            } catch (err: any) {
                if (!cancelled) setError(err?.message || "Failed to load couriers");
            } finally {
                if (!cancelled) setCouriersLoading(false);
            }
        };

        fetchData();
        return () => { cancelled = true; };
    }, [isEnabled, deliveryMethod]);

    useEffect(() => {
        if (!isEnabled || deliveryMethod !== "DELIVERY") return;
        let cancelled = false;

        const fetchData = async () => {
            setDeliveryEntitiesLoading(true);
            setError(null);
            try {
                // 🟢 Added .catch()
                const res = await fetchApiRef.current.request({ action: "GetDeliveryEntities" }).catch((e: any) => {
                    console.warn("Network error fetching transporters:", e.message);
                    return { ok: false, data: { message: "Network error." } };
                });
                if (!cancelled) {
                    const results = extractArray(res, "couriers");
                    setDeliveryEntities(results);
                }
            } catch (err: any) {
                if (!cancelled) setError(err?.message || "Failed to load transporters");
            } finally {
                if (!cancelled) setDeliveryEntitiesLoading(false);
            }
        };

        fetchData();
        return () => { cancelled = true; };
    }, [isEnabled, deliveryMethod]);

    useEffect(() => {
        if (!isEnabled || deliveryMethod !== "DELIVERY" || !selectedCourierId) {
            setCollectionPoints([]);
            return;
        }
        let cancelled = false;

        const fetchData = async () => {
            setPointsLoading(true);
            setError(null);
            try {
                const payload: any = {
                    action: "GetCollectionPoints",
                    courier_id: selectedCourierId,
                };
                if (county) payload.county = county;

                // 🟢 Added .catch()
                const res = await fetchApiRef.current.request(payload).catch((e: any) => {
                    console.warn("Network error fetching collection points:", e.message);
                    return { ok: false, data: { message: "Network error." } };
                });

                if (!cancelled) {
                    const results = extractArray(res, "collection_points");
                    setCollectionPoints(results);
                }
            } catch (err: any) {
                if (!cancelled) setError(err?.message || "Failed to load collection points");
            } finally {
                if (!cancelled) setPointsLoading(false);
            }
        };

        fetchData();
        return () => { cancelled = true; };
    }, [isEnabled, deliveryMethod, selectedCourierId, county]);

    return {
        activeCouriers: deliveryMethod === "COURIER" ? couriers : deliveryEntities,
        activeCouriersLoading: deliveryMethod === "COURIER" ? couriersLoading : deliveryEntitiesLoading,
        collectionPoints,
        pointsLoading,
        error,
        couriers,
        couriersLoading,
        deliveryEntities,
        deliveryEntitiesLoading,
    };
}