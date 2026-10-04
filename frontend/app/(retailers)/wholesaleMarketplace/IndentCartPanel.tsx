// components/retailers/wholesalersMarketPlace/IndentCartPanel.tsx
//
// Indent cart shown alongside (web) or as a bottom sheet (mobile).
//
// Shows:
//   - Header with cart icon, indent number, item/unit count
//   - Amber sync banner when there are pending ops, with live
//     progress while a drain is running
//   - Red failures block listing the server's response_message and
//     errors[] from the most recent drain, dismissible
//   - Per-item rows with thumbnail, qty × unit price, line total
//   - Footer with subtotal and a close-indent CTA

import { useAuth } from '@/context/AuthContext';
import type {
    LastSyncResult,
    SyncFailure,
} from '@/context/RetailerIndentsSyncContext';
import type {
    RetailerIndent,
    RetailerIndentItem,
} from '@/databases/types';
import {
    AlertTriangle,
    CheckCircle2,
    CloudUpload,
    Package,
    ShoppingCart,
    Trash2,
    X,
} from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Image,
    Platform,
    ScrollView,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';

const isWeb = Platform.OS === 'web';
const webPointer = isWeb ? ({ cursor: 'pointer' } as any) : {};

/* ── Formatters ─────────────────────────────────────────────── */

const formatMoney = (
    v: string | number | null | undefined,
): string => {
    if (v === null || v === undefined) return '—';
    const n = Number(v);
    if (Number.isNaN(n)) return '—';
    return n.toLocaleString(undefined, {
        maximumFractionDigits: 2,
    });
};

const formatSyncTime = (ts: number): string => {
    try {
        return new Date(ts).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
        });
    } catch {
        return '';
    }
};

const failureTitle = (f: SyncFailure): string =>
    f.responseMessage || f.message || 'Server rejected the item.';

const failureBullets = (f: SyncFailure): string[] => {
    if (f.errors.length > 0) return f.errors;
    if (f.message) return [f.message];
    return ['Unknown error.'];
};

const getUnitPrice = (it: RetailerIndentItem): number =>
    Number(
        it.final_unit_price ??
        it.cost_per_unit ??
        it.final_supplier_unit_selling_price ??
        it.supplier_unit_selling_price ??
        0,
    );

const getLineTotal = (it: RetailerIndentItem): number =>
    getUnitPrice(it) * Number(it.required_quantity ?? 0);

/**
 * An item is a draft when it still carries a `draft_id`. Once the
 * server confirms it, the context nulls `draft_id` and sets
 * `remote_id`; a synced item therefore has no draft_id.
 */
const isDraftItem = (it: RetailerIndentItem): boolean =>
    !!it.draft_id;

/**
 * Stable React key for an item.
 *
 *   - `draft_id` first: the item's client handle from creation
 *     through promotion. It's what the context keys merge on, so
 *     React should key on the same value.
 *   - then `remote_id` for items that arrived from the server on
 *     first sight (they never had a draft_id).
 *   - then the numeric local PK.
 *   - index as the last resort so nothing ever collides on
 *     `undefined`.
 */
const itemKey = (
    it: RetailerIndentItem,
    index: number,
): string =>
    it.draft_id ??
    it.remote_id ??
    (typeof it.id === 'number'
        ? `local-${it.id}`
        : `row-${index}`);

const itemTitle = (it: RetailerIndentItem): string =>
    it.wholesale_receipt_title ||
    'Untitled item';

/* ── Image fallback ─────────────────────────────────────────── */

const ImageWithFallback: React.FC<{
    uri: string | null;
    size: number;
}> = ({ uri, size }) => {
    const [errored, setErrored] = useState(false);

    if (!uri || errored) {
        return (
            <View
                style={{
                    width: size,
                    height: size,
                    alignItems: 'center',
                    justifyContent: 'center',
                }}
            >
                <Package
                    size={size * 0.4}
                    color="rgba(148,163,184,0.6)"
                />
            </View>
        );
    }

    return (
        <Image
            source={{ uri }}
            style={{ width: size, height: size }}
            resizeMode="cover"
            onError={() => setErrored(true)}
        />
    );
};

/* ── Sync status pill ───────────────────────────────────────── */

type SyncState = 'synced' | 'draft' | 'failed' | 'busy';

const SyncBadge: React.FC<{
    state: SyncState;
    theme: any;
}> = ({ state, theme }) => {
    if (state === 'synced') {
        return (
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <CheckCircle2 size={12} color="#16a34a" />
                <Text
                    style={{
                        marginLeft: 3,
                        fontFamily: theme.font.medium,
                        fontSize: 10,
                        color: '#16a34a',
                    }}
                >
                    Synced
                </Text>
            </View>
        );
    }

    if (state === 'draft') {
        return (
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <CloudUpload size={12} color="#f59e0b" />
                <Text
                    style={{
                        marginLeft: 3,
                        fontFamily: theme.font.medium,
                        fontSize: 10,
                        color: '#f59e0b',
                    }}
                >
                    Pending
                </Text>
            </View>
        );
    }

    if (state === 'failed') {
        return (
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <AlertTriangle size={12} color="#dc2626" />
                <Text
                    style={{
                        marginLeft: 3,
                        fontFamily: theme.font.medium,
                        fontSize: 10,
                        color: '#dc2626',
                    }}
                >
                    Retry
                </Text>
            </View>
        );
    }

    return <ActivityIndicator size="small" color={theme.textDark} />;
};

/* ── Props ──────────────────────────────────────────────────── */

export interface IndentCartPanelProps {
    indent: RetailerIndent | null;
    isDraftIndent: boolean;
    pendingOpCount: number;

    /* Sync progress */
    syncing: boolean;
    syncTotal: number;
    syncDone: number;

    /* Latest sync outcome */
    lastSyncResult?: LastSyncResult | null;
    onDismissSyncResult?: () => void;

    onRemoveItem: (item: RetailerIndentItem) => void;
    onCloseIndent: () => void;
    onSyncNow: () => void;
    onDismiss?: () => void;

    busy?: boolean;
    errorText?: string | null;
    bottomInset?: number;
}

/* ── Component ──────────────────────────────────────────────── */

export default function IndentCartPanel({
    indent,
    isDraftIndent,
    pendingOpCount,
    syncing,
    syncTotal,
    syncDone,
    lastSyncResult = null,
    onDismissSyncResult,
    onRemoveItem,
    onCloseIndent,
    onSyncNow,
    onDismiss,
    busy = false,
    errorText = null,
    bottomInset = 0,
}: IndentCartPanelProps) {
    const { theme, isDarkMode } = useAuth();

    const borderColor = isDarkMode ? '#334155' : '#e2e8f0';
    const subtleBg = isDarkMode ? '#0f172a' : '#f1f5f9';

    const items = indent?.retailer_indent_items ?? [];

    const { subtotal, totalUnits } = useMemo(() => {
        let sub = 0;
        let units = 0;
        for (const it of items) {
            sub += getLineTotal(it);
            units += Number(it.required_quantity ?? 0);
        }
        return { subtotal: sub, totalUnits: units };
    }, [items]);

    const headerTitle = indent
        ? indent.indent_number ||
        (isDraftIndent ? 'New draft indent' : 'Open indent')
        : 'No open indent';

    const headerSubtitle = (() => {
        if (!indent) return 'Add products to start an indent.';
        if (items.length === 0) return 'No items yet.';
        return `${items.length} item${items.length === 1 ? '' : 's'
            } · ${totalUnits} unit${totalUnits === 1 ? '' : 's'}`;
    })();

    const showSyncBanner = pendingOpCount > 0 || syncing;
    const progressPct =
        syncTotal > 0
            ? Math.min(
                100,
                Math.round((syncDone / syncTotal) * 100),
            )
            : 0;

    const showFailures =
        lastSyncResult && lastSyncResult.failures.length > 0;

    return (
        <View style={{ flex: 1, backgroundColor: theme.panel }}>
            {/* ── Header ──────────────────────────────────── */}
            <View
                style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingHorizontal: 14,
                    paddingVertical: 12,
                    borderBottomWidth: 1,
                    borderBottomColor: borderColor,
                }}
            >
                {/* Cart icon — spinner ring while syncing */}
                <View
                    style={{
                        width: 32,
                        height: 32,
                        marginRight: 10,
                        alignItems: 'center',
                        justifyContent: 'center',
                    }}
                >
                    <View
                        style={{
                            width: 32,
                            height: 32,
                            borderRadius: 16,
                            backgroundColor: syncing
                                ? '#f59e0b'
                                : theme.primary,
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}
                    >
                        <ShoppingCart size={16} color="#fff" />
                    </View>

                    {syncing && (
                        <View
                            pointerEvents="none"
                            style={{
                                position: 'absolute',
                                top: -3,
                                left: -3,
                                right: -3,
                                bottom: -3,
                                alignItems: 'center',
                                justifyContent: 'center',
                            }}
                        >
                            <ActivityIndicator
                                size="small"
                                color="#f59e0b"
                            />
                        </View>
                    )}
                </View>

                <View style={{ flex: 1 }}>
                    <View
                        style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                        }}
                    >
                        <Text
                            numberOfLines={1}
                            style={{
                                fontFamily: theme.font.bold,
                                fontSize: theme.fontSize.sm,
                                color: theme.text,
                                flexShrink: 1,
                            }}
                        >
                            {headerTitle}
                        </Text>
                        {isDraftIndent && !syncing && (
                            <View
                                style={{
                                    marginLeft: 6,
                                    paddingHorizontal: 6,
                                    paddingVertical: 1,
                                    borderRadius: 4,
                                    backgroundColor:
                                        'rgba(245,158,11,0.15)',
                                }}
                            >
                                <Text
                                    style={{
                                        fontFamily: theme.font.bold,
                                        fontSize: 9,
                                        letterSpacing: 0.4,
                                        color: '#f59e0b',
                                        textTransform: 'uppercase',
                                    }}
                                >
                                    Draft
                                </Text>
                            </View>
                        )}
                        {syncing && (
                            <View
                                style={{
                                    marginLeft: 6,
                                    paddingHorizontal: 6,
                                    paddingVertical: 1,
                                    borderRadius: 4,
                                    backgroundColor:
                                        'rgba(245,158,11,0.15)',
                                }}
                            >
                                <Text
                                    style={{
                                        fontFamily: theme.font.bold,
                                        fontSize: 9,
                                        letterSpacing: 0.4,
                                        color: '#f59e0b',
                                        textTransform: 'uppercase',
                                    }}
                                >
                                    Syncing
                                </Text>
                            </View>
                        )}
                    </View>
                    <Text
                        numberOfLines={1}
                        style={{
                            fontFamily: theme.font.regular,
                            fontSize: 11,
                            color: theme.textDark,
                            marginTop: 1,
                        }}
                    >
                        {headerSubtitle}
                    </Text>
                </View>

                {onDismiss && (
                    <TouchableOpacity
                        onPress={onDismiss}
                        activeOpacity={0.8}
                        accessibilityRole="button"
                        accessibilityLabel="Close cart"
                        style={{
                            width: 28,
                            height: 28,
                            borderRadius: 14,
                            alignItems: 'center',
                            justifyContent: 'center',
                            backgroundColor: subtleBg,
                            ...webPointer,
                        }}
                    >
                        <X size={14} color={theme.text} />
                    </TouchableOpacity>
                )}
            </View>

            {/* ── Sync banner ─────────────────────────────── */}
            {showSyncBanner && (
                <View
                    style={{
                        borderBottomWidth: 1,
                        borderBottomColor: borderColor,
                        backgroundColor: 'rgba(245,158,11,0.12)',
                    }}
                >
                    <TouchableOpacity
                        onPress={syncing ? undefined : onSyncNow}
                        disabled={syncing}
                        activeOpacity={0.8}
                        style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            paddingHorizontal: 14,
                            paddingVertical: 8,
                            ...(syncing ? {} : webPointer),
                        }}
                    >
                        <ActivityIndicator
                            size="small"
                            color="#f59e0b"
                            animating={syncing}
                            style={{
                                opacity: syncing ? 1 : 0,
                                width: 13,
                                height: 13,
                            }}
                        />
                        <Text
                            style={{
                                marginLeft: 8,
                                flex: 1,
                                fontFamily: theme.font.medium,
                                fontSize: 11,
                                color: '#f59e0b',
                            }}
                        >
                            {syncing
                                ? syncTotal > 0
                                    ? `Syncing ${syncDone} of ${syncTotal}…`
                                    : 'Syncing…'
                                : `${pendingOpCount} pending change${pendingOpCount === 1
                                    ? ''
                                    : 's'
                                } — tap to sync now`}
                        </Text>
                        {!syncing && (
                            <Text
                                style={{
                                    fontFamily: theme.font.bold,
                                    fontSize: 11,
                                    color: '#f59e0b',
                                }}
                            >
                                Sync →
                            </Text>
                        )}
                    </TouchableOpacity>

                    {syncing && syncTotal > 0 && (
                        <View
                            style={{
                                height: 3,
                                backgroundColor:
                                    'rgba(245,158,11,0.15)',
                            }}
                        >
                            <View
                                style={{
                                    height: '100%',
                                    width: `${progressPct}%`,
                                    backgroundColor: '#f59e0b',
                                }}
                            />
                        </View>
                    )}
                </View>
            )}

            {/* ── Last sync result — server errors ────────── */}
            {showFailures && (
                <View
                    style={{
                        borderBottomWidth: 1,
                        borderBottomColor: borderColor,
                        backgroundColor: 'rgba(220,38,38,0.08)',
                        paddingHorizontal: 14,
                        paddingVertical: 10,
                    }}
                >
                    <View
                        style={{
                            flexDirection: 'row',
                            alignItems: 'flex-start',
                            marginBottom: 4,
                        }}
                    >
                        <AlertTriangle
                            size={13}
                            color="#dc2626"
                            style={{ marginTop: 1 }}
                        />
                        <Text
                            style={{
                                marginLeft: 6,
                                flex: 1,
                                fontFamily: theme.font.bold,
                                fontSize: 11,
                                color: '#b91c1c',
                            }}
                        >
                            {lastSyncResult!.failures.length}{' '}
                            change
                            {lastSyncResult!.failures.length ===
                                1
                                ? ''
                                : 's'}{' '}
                            could not be synced
                        </Text>
                        {onDismissSyncResult && (
                            <TouchableOpacity
                                onPress={onDismissSyncResult}
                                hitSlop={8}
                                style={webPointer}
                            >
                                <X size={13} color="#b91c1c" />
                            </TouchableOpacity>
                        )}
                    </View>

                    {lastSyncResult!.failures
                        .slice(0, 3)
                        .map((f, idx) => (
                            <View
                                key={`${f.client_op_id}-${idx}`}
                                style={{ marginTop: 4 }}
                            >
                                <Text
                                    style={{
                                        fontFamily:
                                            theme.font.medium,
                                        fontSize: 11,
                                        color: '#b91c1c',
                                    }}
                                >
                                    • {failureTitle(f)}
                                </Text>
                                {failureBullets(f)
                                    .slice(0, 2)
                                    .map((err, j) => (
                                        <Text
                                            key={j}
                                            style={{
                                                marginLeft: 12,
                                                fontFamily:
                                                    theme.font
                                                        .regular,
                                                fontSize: 10,
                                                color:
                                                    'rgba(185,28,28,0.85)',
                                            }}
                                        >
                                            {err}
                                        </Text>
                                    ))}
                            </View>
                        ))}

                    {lastSyncResult!.failures.length > 3 && (
                        <Text
                            style={{
                                marginTop: 4,
                                fontFamily: theme.font.regular,
                                fontSize: 10,
                                color: 'rgba(185,28,28,0.75)',
                            }}
                        >
                            +{lastSyncResult!.failures.length - 3}{' '}
                            more…
                        </Text>
                    )}

                    <Text
                        style={{
                            marginTop: 6,
                            fontFamily: theme.font.regular,
                            fontSize: 10,
                            color: 'rgba(185,28,28,0.7)',
                        }}
                    >
                        Last attempt at{' '}
                        {formatSyncTime(
                            lastSyncResult!.finishedAt,
                        )}
                    </Text>
                </View>
            )}

            {/* ── Items ───────────────────────────────────── */}
            {items.length === 0 ? (
                <View
                    style={{
                        flex: 1,
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: 24,
                    }}
                >
                    <Package size={28} color={theme.textDark} />
                    <Text
                        style={{
                            marginTop: 10,
                            fontFamily: theme.font.regular,
                            fontSize: theme.fontSize.sm,
                            color: theme.textDark,
                            textAlign: 'center',
                        }}
                    >
                        Tap the cart on a product to start
                        building your indent.
                    </Text>
                </View>
            ) : (
                <ScrollView
                    style={{ flex: 1 }}
                    contentContainerStyle={{ paddingVertical: 6 }}
                    showsVerticalScrollIndicator
                >
                    {items.map((it, idx) => {
                        const unitPrice = getUnitPrice(it);
                        const lineTotal = getLineTotal(it);
                        const img =
                            it.images?.[0]?.thumbnail ||
                            it.images?.[0]?.image ||
                            null;

                        const syncState: SyncState = busy
                            ? 'busy'
                            : isDraftItem(it)
                                ? 'draft'
                                : 'synced';

                        return (
                            <View
                                key={itemKey(it, idx)}
                                style={{
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    paddingHorizontal: 14,
                                    paddingVertical: 10,
                                    borderBottomWidth: 1,
                                    borderBottomColor: isDarkMode
                                        ? '#1e293b'
                                        : '#f1f5f9',
                                }}
                            >
                                <View
                                    style={{
                                        width: 44,
                                        height: 44,
                                        borderRadius: 8,
                                        backgroundColor: subtleBg,
                                        overflow: 'hidden',
                                        marginRight: 10,
                                    }}
                                >
                                    <ImageWithFallback
                                        uri={img}
                                        size={44}
                                    />
                                </View>

                                <View
                                    style={{
                                        flex: 1,
                                        marginRight: 8,
                                    }}
                                >
                                    <Text
                                        numberOfLines={2}
                                        style={{
                                            fontFamily:
                                                theme.font.medium,
                                            fontSize: 12,
                                            color: theme.text,
                                            lineHeight: 16,
                                        }}
                                    >
                                        {itemTitle(it)}
                                    </Text>
                                    <View
                                        style={{
                                            flexDirection: 'row',
                                            alignItems: 'center',
                                            marginTop: 4,
                                        }}
                                    >
                                        <Text
                                            style={{
                                                fontFamily:
                                                    theme.font.regular,
                                                fontSize: 11,
                                                color: theme.textDark,
                                            }}
                                        >
                                            {it.required_quantity} ×
                                            KES{' '}
                                            {formatMoney(unitPrice)}
                                        </Text>
                                        <View style={{ marginLeft: 8 }}>
                                            <SyncBadge
                                                state={syncState}
                                                theme={theme}
                                            />
                                        </View>
                                    </View>
                                </View>

                                <View
                                    style={{
                                        alignItems: 'flex-end',
                                        marginRight: 8,
                                    }}
                                >
                                    <Text
                                        style={{
                                            fontFamily:
                                                theme.font.bold,
                                            fontSize: 12,
                                            color: theme.text,
                                        }}
                                    >
                                        KES {formatMoney(lineTotal)}
                                    </Text>
                                </View>

                                <TouchableOpacity
                                    onPress={() => onRemoveItem(it)}
                                    disabled={busy || syncing}
                                    activeOpacity={0.7}
                                    accessibilityRole="button"
                                    accessibilityLabel={`Remove ${itemTitle(it)}`}
                                    style={{
                                        width: 28,
                                        height: 28,
                                        borderRadius: 6,
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        backgroundColor:
                                            'rgba(220,38,38,0.1)',
                                        opacity:
                                            busy || syncing ? 0.5 : 1,
                                        ...webPointer,
                                    }}
                                >
                                    <Trash2 size={13} color="#dc2626" />
                                </TouchableOpacity>
                            </View>
                        );
                    })}
                </ScrollView>
            )}

            {/* ── Footer ──────────────────────────────────── */}
            <View
                style={{
                    borderTopWidth: 1,
                    borderTopColor: borderColor,
                    paddingHorizontal: 14,
                    paddingTop: 12,
                    paddingBottom: 12 + bottomInset,
                }}
            >
                {errorText ? (
                    <View
                        style={{
                            backgroundColor:
                                'rgba(220,38,38,0.1)',
                            borderColor: 'rgba(220,38,38,0.35)',
                            borderWidth: 1,
                            borderRadius: 8,
                            paddingHorizontal: 10,
                            paddingVertical: 6,
                            marginBottom: 10,
                        }}
                    >
                        <Text
                            style={{
                                fontFamily: theme.font.medium,
                                fontSize: 11,
                                color: '#dc2626',
                            }}
                        >
                            {errorText}
                        </Text>
                    </View>
                ) : null}

                <View
                    style={{
                        flexDirection: 'row',
                        alignItems: 'baseline',
                        justifyContent: 'space-between',
                    }}
                >
                    <Text
                        style={{
                            fontFamily: theme.font.bold,
                            fontSize: 11,
                            letterSpacing: 0.6,
                            textTransform: 'uppercase',
                            color: theme.textDark,
                        }}
                    >
                        Subtotal
                    </Text>
                    <Text
                        style={{
                            fontFamily: theme.font.bold,
                            fontSize: 18,
                            color: theme.text,
                        }}
                    >
                        KES {formatMoney(subtotal)}
                    </Text>
                </View>

                {items.length > 0 && (
                    <TouchableOpacity
                        onPress={onCloseIndent}
                        disabled={busy || syncing}
                        activeOpacity={0.85}
                        accessibilityRole="button"
                        style={{
                            marginTop: 12,
                            height: 44,
                            borderRadius: 10,
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'center',
                            backgroundColor: theme.primary,
                            opacity:
                                busy || syncing ? 0.6 : 1,
                            ...webPointer,
                        }}
                    >
                        {busy || syncing ? (
                            <>
                                <ActivityIndicator
                                    size="small"
                                    color="#fff"
                                />
                                <Text
                                    style={{
                                        marginLeft: 8,
                                        fontFamily:
                                            theme.font.bold,
                                        fontSize:
                                            theme.fontSize.sm,
                                        color: '#fff',
                                    }}
                                >
                                    {syncing
                                        ? 'Syncing…'
                                        : 'Working…'}
                                </Text>
                            </>
                        ) : (
                            <Text
                                style={{
                                    fontFamily: theme.font.bold,
                                    fontSize: theme.fontSize.sm,
                                    color: '#fff',
                                }}
                            >
                                Close indent
                            </Text>
                        )}
                    </TouchableOpacity>
                )}
            </View>
        </View>
    );
}