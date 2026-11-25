// utils/menuPrefs.ts
//
// Menu sections a person chose to hide (e.g. "church" for someone who isn't a
// churchgoer). Saved on their account (backend Users.hidden_menus, POST
// /authentication/users GetMenuPrefs / SetHiddenMenus), so it follows them to every
// device; also in the login token and on this device, so the menu is right at once.

import client from '@/api/client';
import { toast } from '@/components/common/Toast';
import { useAuth } from '@/context/AuthContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useSyncExternalStore } from 'react';

const KEY = 'wazipos_hidden_menus_v1';

let current: string[] | null = null;
let loadedFor: string | null = null;
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((l) => l());
const set = (next: string[]) => {
    current = Array.from(new Set(next)).sort();
    emit();
};

const subscribe = (l: () => void) => {
    listeners.add(l);
    return () => listeners.delete(l);
};
const snapshot = () => current;

const isOk = (res: any) => !!res?.ok && String(res?.data?.response_code ?? '0') === '0';

/** Hidden menu sections for the signed-in person, and a way to change them. */
export function useHiddenMenus() {
    const { user } = useAuth() as any;
    const userKey = String(user?.user_id || user?.id || user?.email || '');
    const hidden = useSyncExternalStore(subscribe, snapshot, snapshot);

    useEffect(() => {
        if (!userKey || loadedFor === userKey) return;
        loadedFor = userKey;
        // 1. Token copy (instant), 2. device copy, 3. the account (truth).
        const fromToken: string[] = Array.isArray(user?.hidden_menus) ? user.hidden_menus : [];
        set(fromToken);
        AsyncStorage.getItem(`${KEY}:${userKey}`)
            .then((raw) => {
                if (raw && loadedFor === userKey) set(JSON.parse(raw));
            })
            .catch(() => undefined);
        client
            .post('/authentication/users', { action: 'GetMenuPrefs' })
            .then((res: any) => {
                if (loadedFor !== userKey || !isOk(res)) return;
                const list: string[] = res.data?.prefs?.hidden_menus ?? [];
                set(list);
                AsyncStorage.setItem(`${KEY}:${userKey}`, JSON.stringify(list)).catch(() => undefined);
            })
            .catch(() => undefined);
    }, [userKey, user?.hidden_menus]);

    const setHidden = useCallback(
        async (section: string, hide: boolean) => {
            const before = current ?? [];
            const next = hide ? [...before, section] : before.filter((k) => k !== section);
            set(next);
            AsyncStorage.setItem(`${KEY}:${userKey}`, JSON.stringify(current)).catch(() => undefined);
            const res: any = await client.post('/authentication/users', { action: 'SetHiddenMenus', hidden_menus: current }).catch(() => null);
            if (!isOk(res)) {
                toast.warning('Saved on this device only', 'We could not save it to your account. It will apply on this device.');
            }
        },
        [userKey],
    );

    const list = hidden ?? [];
    return { hidden: list, isHidden: (section?: string) => !!section && list.includes(section), setHidden };
}
