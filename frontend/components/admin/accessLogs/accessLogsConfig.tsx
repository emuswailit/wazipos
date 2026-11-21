// components/admin/accessLogs/accessLogsConfig.tsx
//
// How an API request shows in Admin -> Access logs (cards on phones, table on
// web, and the details sheet). Requests made without signing in only carry the
// IP and the endpoint; everything else is for signed-in requests.

import type { AccessLog, AccessSource } from '@/api/accessLogsApi';
import { AdminBadgePill, textOr, type AdminBadge, type AdminListConfig } from '@/components/admin/kit';
import React from 'react';

export const formatWhen = (iso: string) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString([], { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' });
};

export const statusBadge = (l: AccessLog): AdminBadge =>
    l.status_code >= 500
        ? { label: String(l.status_code), tone: 'danger', icon: 'alert-circle' }
        : l.status_code >= 400
            ? { label: String(l.status_code), tone: 'warning', icon: 'warning-outline' }
            : { label: String(l.status_code || '—'), tone: 'success', icon: 'checkmark-circle' };

export const SOURCE_LABELS: Record<AccessSource, string> = {
    WEB: 'Web',
    ANDROID: 'Android app',
    IOS: 'iOS app',
    SCRIPT: 'Script',
    UNKNOWN: 'Unknown',
};

const SOURCE_BADGES: Record<AccessSource, AdminBadge> = {
    WEB: { label: 'Web', tone: 'info', icon: 'globe-outline' },
    ANDROID: { label: 'Android', tone: 'success', icon: 'logo-android' },
    IOS: { label: 'iOS', tone: 'neutral', icon: 'logo-apple' },
    SCRIPT: { label: 'Script', tone: 'violet', icon: 'code-slash-outline' },
    UNKNOWN: { label: 'Unknown', tone: 'neutral', icon: 'help-circle-outline' },
};

export const sourceBadge = (l: AccessLog): AdminBadge | null => (l.source ? SOURCE_BADGES[l.source] ?? null : null);

/** "Chrome on Android" style summary of a user agent. */
export function deviceOf(ua: string): string {
    if (!ua) return '—';
    const app = /okhttp|Dalvik/i.test(ua) ? 'Android app' : /CFNetwork|Darwin/i.test(ua) ? 'iOS app' : null;
    if (app) return app;
    const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : null;
    const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : null;
    if (browser && os) return `${browser} on ${os}`;
    return browser || os || ua.slice(0, 40);
}

export const whatOf = (l: AccessLog) => l.action || `${l.method} ${l.endpoint}`;

export const accessLogsConfig: AdminListConfig<AccessLog> = {
    title: 'Access logs',
    noun: ['request', 'requests'],
    icon: 'pulse-outline',
    searchPlaceholder: 'Search IP, user, business, app, action, endpoint or screen…',
    emptyTitle: 'No requests',
    emptyMessage: 'Nothing matches these filters. Requests to the API show here as they happen.',
    keyOf: (l) => String(l.id),
    titleOf: (l) => whatOf(l),
    subtitleOf: (l) => [l.ip, l.user_label || 'Not signed in', l.app].filter(Boolean).join(' · '),
    avatarOf: (l) => ({ label: l.user_label || l.ip }),
    badgesOf: (l) => {
        const source = sourceBadge(l);
        return [statusBadge(l), ...(source ? [source] : []), ...(l.user ? [{ label: 'Signed in', tone: 'info', icon: 'person-outline' } as AdminBadge] : [])];
    },
    metaOf: (l) => formatWhen(l.created),
    metaIcon: 'time-outline',
    metricOf: (l) => ({ value: `${l.duration_ms} ms`, label: l.method }),
    primaryColumn: { label: 'Action / endpoint', flex: 2.2 },
    columns: [
        { key: 'when', label: 'When', flex: 1.3, render: (l) => formatWhen(l.created) },
        { key: 'ip', label: 'IP address', flex: 1.2, render: (l) => l.ip },
        { key: 'user', label: 'User', flex: 2, render: (l) => textOr(l.user_label, 'Not signed in') },
        { key: 'entity', label: 'Business', flex: 1.4, render: (l) => textOr(l.entity_title) },
        { key: 'app', label: 'App', flex: 1, render: (l) => textOr(l.app) },
        { key: 'endpoint', label: 'Endpoint', flex: 1.8, render: (l) => `${l.method} ${l.endpoint}` },
        { key: 'source', label: 'Source', flex: 0.9, render: (l) => (l.source ? SOURCE_LABELS[l.source] ?? l.source : '—') },
        { key: 'screen', label: 'Screen', flex: 1.4, render: (l) => textOr(l.client_route) },
        { key: 'status', label: 'Status', flex: 0.8, render: (l) => <AdminBadgePill badge={statusBadge(l)} /> },
        { key: 'time', label: 'Time', flex: 0.7, align: 'right', render: (l) => `${l.duration_ms} ms` },
    ],
};

/** The details sheet shows everything, including the full URL and device. */
export const accessLogDetailsConfig: AdminListConfig<AccessLog> = {
    ...accessLogsConfig,
    metaOf: undefined, // "When" is already a field
    columns: [
        ...accessLogsConfig.columns,
        { key: 'action', label: 'Action', flex: 1, render: (l) => textOr(l.action) },
        { key: 'url', label: 'URL', flex: 1, render: (l) => textOr(l.url) },
        { key: 'device', label: 'Device', flex: 1, render: (l) => (l.user_agent ? deviceOf(l.user_agent) : '—') },
        { key: 'ua', label: 'User agent', flex: 1, render: (l) => textOr(l.user_agent) },
    ],
};
