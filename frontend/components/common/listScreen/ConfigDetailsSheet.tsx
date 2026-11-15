// components/common/listScreen/ConfigDetailsSheet.tsx
//
// Record details made from a list's own AdminListConfig: the same title,
// avatar, badges and metric as the card, then every table column as a field.
// For screens that had no details view, so every list behaves the same: tap
// a row -> details (docked beside the list on wide screens, a sheet on
// phones) -> Edit.

import React from 'react';

import { AdminDetailsSheet } from './AdminDetailsSheet';
import type { AdminListConfig } from './AdminListView';

export function ConfigDetailsSheet<T>({
    config,
    item,
    onClose,
    onEdit,
    heading,
    actions,
}: {
    config: AdminListConfig<T>;
    item: T | null;
    onClose: () => void;
    onEdit?: (item: T) => void;
    /** Sheet header; defaults to "<Noun> details". */
    heading?: string;
    actions?: React.ReactNode;
}) {
    if (!item) return null;
    const noun = config.noun[0];
    const metric = config.metricOf?.(item);
    const meta = config.metaOf?.(item);
    const fields = config.columns.map((c) => {
        const v = c.render(item);
        return { label: c.label, value: v === null || v === undefined || v === '' ? '—' : v };
    });
    return (
        <AdminDetailsSheet
            visible
            onClose={onClose}
            heading={heading ?? `${noun.charAt(0).toUpperCase()}${noun.slice(1)} details`}
            icon={config.icon}
            title={config.titleOf(item)}
            subtitle={config.subtitleOf?.(item) ?? null}
            avatar={config.avatarOf?.(item)}
            badges={config.badgesOf?.(item) ?? []}
            stats={metric ? [{ label: metric.label, value: metric.value, color: metric.color }] : []}
            sections={[
                {
                    title: 'Details',
                    icon: 'information-circle-outline',
                    fields: [...fields, ...(meta ? [{ label: 'Updated', value: meta }] : [])],
                },
            ]}
            onEdit={onEdit ? () => onEdit(item) : undefined}
            actions={actions}
        />
    );
}
