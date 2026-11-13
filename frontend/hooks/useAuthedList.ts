// hooks/useAuthedList.ts
//
// Loads a server list only while someone is logged in (fail safe):
//   - no request without a token; fetches as soon as a token appears,
//   - clears the list on logout so the next account never sees it,
//   - "not logged in" responses are skipped silently; other failures log one line
//     and keep the current list,
//   - a response for an old token (logout / account switch mid-request) is dropped.

import { useAuth } from '@/context/AuthContext';
import { describeFailure, isAuthFailure } from '@/utils/authGuard';
import { useCallback, useEffect, useRef, useState } from 'react';

interface AuthedList<T> {
    list: T[];
    isFetching: boolean;
    lastSyncedTime?: string;
    refresh: () => Promise<void>;
}

export function useAuthedList<T>(label: string, fetcher: () => Promise<any>, pick: (data: any) => T[] = (d) => d?.results ?? []): AuthedList<T> {
    const { token } = useAuth();
    const [list, setList] = useState<T[]>([]);
    const [isFetching, setIsFetching] = useState(false);
    const [lastSyncedTime, setLastSyncedTime] = useState<string>();

    const tokenRef = useRef(token);
    tokenRef.current = token;
    const fetcherRef = useRef(fetcher);
    fetcherRef.current = fetcher;
    const pickRef = useRef(pick);
    pickRef.current = pick;

    const refresh = useCallback(async () => {
        const requestToken = tokenRef.current;
        if (!requestToken) return;
        setIsFetching(true);
        try {
            const res = await fetcherRef.current();
            if (tokenRef.current !== requestToken) return; // logged out / switched meanwhile
            if (res?.ok && res.data) {
                const custom = res.data.response_code === 1 || res.data.response_code === '1';
                if (custom) {
                    if (__DEV__) console.warn(`[${label}] ${describeFailure({ ...res, ok: false })}`);
                    return;
                }
                const next = pickRef.current(res.data);
                setList(Array.isArray(next) ? next : []);
                setLastSyncedTime(new Date().toISOString());
            } else if (!isAuthFailure(res) && __DEV__) {
                console.warn(`[${label}] ${describeFailure(res)}`);
            }
        } catch (error) {
            if (__DEV__) console.warn(`[${label}] request threw:`, (error as any)?.message ?? error);
        } finally {
            if (tokenRef.current === requestToken) setIsFetching(false);
        }
    }, [label]);

    useEffect(() => {
        if (!token) {
            setList([]);
            setLastSyncedTime(undefined);
            setIsFetching(false);
            return;
        }
        void refresh();
    }, [token, refresh]);

    return { list, isFetching, lastSyncedTime, refresh };
}
