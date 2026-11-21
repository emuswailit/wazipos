// utils/clientContext.ts
//
// Tells the API where each request comes from, for Admin -> Access logs
// (backend core/access_log.py):
//   X-Client-Source  WEB | ANDROID | IOS
//   X-Client-Route   the screen the request was sent from, e.g. /retailers/orders
// The backend allows these headers in CORS_ALLOW_HEADERS.

import type { ApisauceInstance } from 'apisauce';
import { usePathname } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';

const SOURCE = Platform.OS === 'web' ? 'WEB' : Platform.OS === 'ios' ? 'IOS' : Platform.OS === 'android' ? 'ANDROID' : 'UNKNOWN';

let currentRoute = '';

/** Keeps the current screen up to date. Call once, high in the app tree. */
export function useTrackClientRoute() {
    const pathname = usePathname();
    useEffect(() => {
        currentRoute = pathname || '';
    }, [pathname]);
}

export function clientHeaders(): Record<string, string> {
    const headers: Record<string, string> = { 'X-Client-Source': SOURCE };
    if (currentRoute) headers['X-Client-Route'] = currentRoute.slice(0, 200);
    return headers;
}

/** Adds the client headers to every request an apisauce client sends. */
export function withClientHeaders<T extends ApisauceInstance>(api: T): T {
    api.addRequestTransform((request) => {
        if (!request.headers) request.headers = {} as any;
        const headers = request.headers as any;
        for (const [k, v] of Object.entries(clientHeaders())) headers[k] = v;
    });
    return api;
}
