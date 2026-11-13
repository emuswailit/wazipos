// components/admin/kit/useLookupOptions.ts
//
// Loads picker options for an admin form when it opens: calls `apiFn({ action })`
// and maps the rows (plain or Django `{ pk, fields }`) to `{ id, title }`.

import useApi from '@/hooks/useApi';
import { useEffect, useMemo } from 'react';

interface LookupOption {
    id: string;
    title: string;
    meta?: Record<string, any>;
}

export function useLookupOptions(
    apiFn: (payload: any) => Promise<any>,
    action: string,
    enabled: boolean,
    opts: { titleOf?: (row: any) => string; metaOf?: (row: any) => Record<string, any> } = {}
): { options: LookupOption[]; loading: boolean } {
    const api = useApi<any>(async (payload: any) => apiFn(payload));

    useEffect(() => {
        if (enabled) api.request({ action });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [enabled, action]);

    const options = useMemo(() => {
        if (!Array.isArray(api.data)) return [];
        return api.data
            .map((item: any) => {
                const f = item?.fields ?? item;
                return {
                    id: String(item?.pk ?? item?.id ?? f?.id ?? ''),
                    title: opts.titleOf ? opts.titleOf(f) : f?.title || 'Untitled',
                    ...(opts.metaOf ? { meta: opts.metaOf(f) } : {}),
                };
            })
            .filter((o: LookupOption) => o.id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [api.data]);

    return { options, loading: api.loading };
}
