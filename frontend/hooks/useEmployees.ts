// hooks/useEmployees.ts
import employeesApi from '@/api/employeesApi';
import { useApi } from '@/hooks/useApi';
import { useCallback, useEffect, useState } from 'react';

export function useEmployees(isEnabled: boolean = true) {
    const [employees, setEmployees] = useState<any[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [refreshKey, setRefreshKey] = useState(0);

    const fetchStaffApi = useApi(employeesApi.getDeliveryStaffAction);

    const refresh = useCallback(() => {
        setRefreshKey(prev => prev + 1);
    }, []);

    useEffect(() => {
        if (!isEnabled) {
            setEmployees([]);
            return;
        }

        let cancelled = false;

        const fetchEmployees = async () => {
            setError(null);

            try {
                // 🟢 NO ENTITY ID IS PASSED HERE
                const payload = {
                    action: "GetEntityDeliveryPersons",
                    page: 1,
                    page_size: 100,
                };

                console.log("[useEmployees] 🟢 FETCHING STAFF WITH PAYLOAD:", payload);

                const res = await fetchStaffApi.request(payload).catch((e: any) => {
                    console.warn("[useEmployees] ❌ Network request failed:", e?.message);
                    return { ok: false, data: { message: "Network error occurred." } };
                });

                console.log("[useEmployees] ✅ RAW API RESPONSE:");
                console.dir(res, { depth: null });

                if (!cancelled) {
                    if (res?.ok) {
                        const rawList = res.data?.results || res.data?.data || res.data || [];
                        console.log("[useEmployees] 📦 EXTRACTED LIST:", rawList);
                        setEmployees(Array.isArray(rawList) ? rawList : []);
                    } else {
                        console.warn("[useEmployees] ❌ API returned not OK:", res?.data);
                        setError(res?.data?.message || "Failed to load delivery staff.");
                    }
                }
            } catch (err: any) {
                if (!cancelled) {
                    console.error("[useEmployees] ❌ Caught error:", err);
                    setError(err?.message || "Network error.");
                }
            }
        };

        fetchEmployees();
        return () => { cancelled = true; };
    }, [isEnabled, refreshKey]);

    return {
        employees,
        isLoading: fetchStaffApi.loading,
        error,
        refresh
    };
}