// components/retailers/wholesalersMarketPlace/QuantityInputModal.tsx
//
// Quantity input modal for adding or editing an item on the current
// open retailer indent. Reached from the cart icon on any product
// card in the wholesaler marketplace.
//
// Consumes `useIndentBridge` directly so it can:
//   - detect whether the product already exists on the open indent
//   - pre-fill the quantity from that existing row
//   - call `addToIndent` / `removeFromIndent` without any parent wiring
//
// The parent's only job is to render the modal and pass the product.
// No `onSubmit` or `onRemove` props anymore — the modal owns its
// mutation flow.

import { useAuth } from '@/context/AuthContext';
import { useIndentBridge } from '@/hooks/useIndentBridge';
import { Minus, Package, Plus, Trash2, X } from 'lucide-react-native';
import React, { useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Image,
    Modal,
    Platform,
    Pressable,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
// eslint-disable-next-line import/no-cycle
import type { MarketplaceProduct } from './index';

const isWeb = Platform.OS === 'web';
const webNoOutline = isWeb ? ({ outlineStyle: 'none' } as any) : {};
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
                    size={size * 0.45}
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

/* ── Props ──────────────────────────────────────────────────── */

export interface QuantityInputModalProps {
    visible: boolean;
    product: MarketplaceProduct | null;
    onClose: () => void;
    /**
     * Called after a successful add / update / remove, so the parent
     * can show a toast if it wants. Optional.
     */
    onFeedback?: (result: {
        ok: boolean;
        mode: 'remote' | 'draft' | 'failed';
        action: 'add' | 'remove';
        message?: string;
    }) => void;
}

/* ── Component ──────────────────────────────────────────────── */

export default function QuantityInputModal({
    visible,
    product,
    onClose,
    onFeedback,
}: QuantityInputModalProps) {
    const { theme, isDarkMode } = useAuth();
    const {
        currentOpenIndent,
        hasOpenIndent,
        isDraftIndent,
        findItemByReceipts,
        addToIndent,
        removeFromIndent,
    } = useIndentBridge();

    const [qtyText, setQtyText] = useState('1');
    const [busy, setBusy] = useState(false);
    const [errorText, setErrorText] = useState<string | null>(null);

    /* ── Existing item on the open indent ─────────────────── */

    const existingItem = useMemo(
        () =>
            product
                ? findItemByReceipts(product.receipt_ids)
                : null,
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [product, findItemByReceipts],
    );

    const isEditing = !!existingItem;

    /* ── Re-seed on open / product change / external edits ── */

    useEffect(() => {
        if (!visible) return;
        setQtyText(String(existingItem?.required_quantity ?? 1));
        setErrorText(null);
    }, [
        visible,
        product?.product_id,
        existingItem?.id,
        existingItem?.required_quantity,
    ]);

    /* ── Web: Escape closes ────────────────────────────────── */

    useEffect(() => {
        if (!isWeb || !visible) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && !busy) onClose();
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [visible, busy, onClose]);

    /* ── Derived ───────────────────────────────────────────── */

    const qty = Math.max(0, Math.floor(Number(qtyText) || 0));
    const canSubmit = qty > 0 && !busy && !!product;

    const borderColor = isDarkMode ? '#334155' : '#e2e8f0';
    const subtleBg = isDarkMode ? '#0f172a' : '#f1f5f9';

    /* ── Handlers ──────────────────────────────────────────── */

    const handleSubmit = async () => {
        if (!product || !canSubmit) return;
        setBusy(true);
        setErrorText(null);

        try {
            const receiptId = product.receipt_ids[0];
            if (!receiptId) {
                setErrorText(
                    'No wholesaler receipt attached to this product.',
                );
                setBusy(false);
                return;
            }

            const res = await addToIndent({
                wholesaleReceipt: receiptId,
                quantity: qty,
                meta: {
                    wholesaleReceiptTitle: product.name,
                    wholesaler: null,
                    wholesalerTitle: '',
                    unitOfReceipt: product.unit,
                    unitSellingPrice: String(
                        product.original_price ?? product.price,
                    ),
                    finalUnitSellingPrice: String(product.price),
                    images: product.image
                        ? [product.image]
                        : [],
                },
            });

            if (!res.ok) {
                setErrorText(
                    res.message ??
                    'Could not save to indent. Please try again.',
                );
                onFeedback?.({
                    ok: false,
                    mode: res.mode,
                    action: 'add',
                    message: res.message,
                });
                return;
            }

            onFeedback?.({
                ok: true,
                mode: res.mode,
                action: 'add',
                message: res.message,
            });
            onClose();
        } catch (e: any) {
            setErrorText(e?.message ?? 'Something went wrong.');
        } finally {
            setBusy(false);
        }
    };

    const handleRemove = async () => {
        if (!existingItem) return;
        setBusy(true);
        setErrorText(null);

        try {
            const res = await removeFromIndent(existingItem.id);

            if (!res.ok) {
                setErrorText(
                    res.message ?? 'Could not remove from indent.',
                );
                onFeedback?.({
                    ok: false,
                    mode: res.mode,
                    action: 'remove',
                    message: res.message,
                });
                return;
            }

            onFeedback?.({
                ok: true,
                mode: res.mode,
                action: 'remove',
                message: res.message,
            });
            onClose();
        } catch (e: any) {
            setErrorText(e?.message ?? 'Something went wrong.');
        } finally {
            setBusy(false);
        }
    };

    const handleClose = () => {
        if (busy) return;
        onClose();
    };

    /* ── Render ────────────────────────────────────────────── */

    return (
        <Modal
            visible={visible}
            animationType="fade"
            transparent
            onRequestClose={handleClose}
            statusBarTranslucent
        >
            <Pressable
                onPress={handleClose}
                style={{
                    flex: 1,
                    backgroundColor: 'rgba(0,0,0,0.5)',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 16,
                }}
            >
                <Pressable
                    onPress={(e) => e.stopPropagation?.()}
                    style={{
                        width: '100%',
                        maxWidth: 420,
                        backgroundColor: theme.panel,
                        borderRadius: 18,
                        borderWidth: 1,
                        borderColor,
                        overflow: 'hidden',
                    }}
                >
                    {/* ── Header ─────────────────────────── */}
                    <View
                        style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: 16,
                            borderBottomWidth: 1,
                            borderBottomColor: borderColor,
                        }}
                    >
                        <View
                            style={{
                                flex: 1,
                                marginRight: 8,
                            }}
                        >
                            <Text
                                style={{
                                    fontFamily: theme.font.bold,
                                    fontSize: 10,
                                    letterSpacing: 1,
                                    textTransform: 'uppercase',
                                    color: isEditing
                                        ? '#16a34a'
                                        : theme.primary,
                                    marginBottom: 2,
                                }}
                            >
                                {isEditing
                                    ? 'Already on indent'
                                    : 'Add to indent'}
                            </Text>
                            <Text
                                style={{
                                    fontFamily: theme.font.bold,
                                    fontSize: theme.fontSize.base,
                                    color: theme.text,
                                }}
                            >
                                {isEditing
                                    ? 'Update quantity'
                                    : 'Set quantity'}
                            </Text>
                        </View>

                        <TouchableOpacity
                            onPress={handleClose}
                            disabled={busy}
                            activeOpacity={0.8}
                            accessibilityRole="button"
                            accessibilityLabel="Close"
                            style={{
                                width: 30,
                                height: 30,
                                borderRadius: 15,
                                alignItems: 'center',
                                justifyContent: 'center',
                                backgroundColor: subtleBg,
                                opacity: busy ? 0.5 : 1,
                                ...webPointer,
                            }}
                        >
                            <X size={14} color={theme.text} />
                        </TouchableOpacity>
                    </View>

                    {/* ── Product preview ────────────────── */}
                    {product && (
                        <View
                            style={{
                                flexDirection: 'row',
                                padding: 16,
                            }}
                        >
                            <View
                                style={{
                                    width: 64,
                                    height: 64,
                                    borderRadius: 10,
                                    backgroundColor: subtleBg,
                                    overflow: 'hidden',
                                    marginRight: 12,
                                }}
                            >
                                <ImageWithFallback
                                    uri={product.image ?? null}
                                    size={64}
                                />
                            </View>
                            <View
                                style={{
                                    flex: 1,
                                    justifyContent: 'center',
                                }}
                            >
                                <Text
                                    numberOfLines={2}
                                    style={{
                                        fontFamily: theme.font.bold,
                                        fontSize:
                                            theme.fontSize.base,
                                        color: theme.text,
                                    }}
                                >
                                    {product.name}
                                </Text>
                                <Text
                                    numberOfLines={1}
                                    style={{
                                        fontFamily:
                                            theme.font.regular,
                                        fontSize:
                                            theme.fontSize.xs,
                                        color: theme.textDark,
                                        marginTop: 2,
                                    }}
                                >
                                    {product.category_title}
                                </Text>
                                <Text
                                    style={{
                                        fontFamily: theme.font.bold,
                                        fontSize:
                                            theme.fontSize.sm,
                                        color: theme.primary,
                                        marginTop: 4,
                                    }}
                                >
                                    KES {formatMoney(product.price)} /{' '}
                                    {product.unit}
                                </Text>
                            </View>
                        </View>
                    )}

                    {/* ── Quantity stepper ───────────────── */}
                    <View
                        style={{
                            paddingHorizontal: 16,
                            paddingBottom: 16,
                        }}
                    >
                        <View
                            style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                marginBottom: 8,
                            }}
                        >
                            <Text
                                style={{
                                    fontFamily: theme.font.bold,
                                    fontSize: 10,
                                    letterSpacing: 0.6,
                                    textTransform: 'uppercase',
                                    color: theme.textDark,
                                }}
                            >
                                Quantity
                            </Text>
                            {!hasOpenIndent && (
                                <Text
                                    style={{
                                        fontFamily:
                                            theme.font.medium,
                                        fontSize: 10,
                                        color: '#f59e0b',
                                    }}
                                >
                                    A new indent will be created
                                </Text>
                            )}
                            {hasOpenIndent && isDraftIndent && (
                                <Text
                                    style={{
                                        fontFamily:
                                            theme.font.medium,
                                        fontSize: 10,
                                        color: '#f59e0b',
                                    }}
                                >
                                    Draft indent
                                </Text>
                            )}
                        </View>

                        <View
                            style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                borderRadius: 10,
                                borderWidth: 1,
                                borderColor,
                                backgroundColor: subtleBg,
                                paddingHorizontal: 6,
                                height: 44,
                            }}
                        >
                            <TouchableOpacity
                                onPress={() =>
                                    setQtyText(
                                        String(Math.max(1, qty - 1)),
                                    )
                                }
                                disabled={qty <= 1 || busy}
                                activeOpacity={0.7}
                                accessibilityRole="button"
                                accessibilityLabel="Decrease quantity"
                                style={{
                                    width: 34,
                                    height: 34,
                                    borderRadius: 8,
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    opacity: qty <= 1 ? 0.4 : 1,
                                    ...webPointer,
                                }}
                            >
                                <Minus size={16} color={theme.text} />
                            </TouchableOpacity>

                            <TextInput
                                value={qtyText}
                                onChangeText={(t) =>
                                    setQtyText(
                                        t.replace(/[^0-9]/g, ''),
                                    )
                                }
                                keyboardType="number-pad"
                                inputMode="numeric"
                                placeholder="0"
                                placeholderTextColor={theme.textDark}
                                editable={!busy}
                                selectTextOnFocus
                                style={{
                                    flex: 1,
                                    textAlign: 'center',
                                    fontFamily: theme.font.bold,
                                    fontSize: theme.fontSize.lg,
                                    color: theme.text,
                                    ...webNoOutline,
                                }}
                            />

                            <TouchableOpacity
                                onPress={() =>
                                    setQtyText(String(qty + 1))
                                }
                                disabled={busy}
                                activeOpacity={0.7}
                                accessibilityRole="button"
                                accessibilityLabel="Increase quantity"
                                style={{
                                    width: 34,
                                    height: 34,
                                    borderRadius: 8,
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    ...webPointer,
                                }}
                            >
                                <Plus size={16} color={theme.text} />
                            </TouchableOpacity>
                        </View>

                        {/* Live status */}
                        <Text
                            style={{
                                marginTop: 6,
                                fontFamily: theme.font.regular,
                                fontSize: theme.fontSize.xs,
                                color: theme.textDark,
                            }}
                        >
                            {isEditing
                                ? `Currently ${existingItem!.required_quantity} on this indent · will become ${qty}`
                                : `Will add ${qty} ${qty === 1 ? 'unit' : 'units'
                                }`}
                        </Text>

                        {errorText ? (
                            <Text
                                style={{
                                    marginTop: 8,
                                    fontFamily:
                                        theme.font.regular,
                                    fontSize:
                                        theme.fontSize.xs,
                                    color: '#dc2626',
                                }}
                            >
                                {errorText}
                            </Text>
                        ) : null}
                    </View>

                    {/* ── Actions ────────────────────────── */}
                    <View
                        style={{
                            flexDirection: 'row',
                            paddingHorizontal: 16,
                            paddingBottom: 16,
                        }}
                    >
                        {isEditing && (
                            <TouchableOpacity
                                onPress={handleRemove}
                                disabled={busy}
                                activeOpacity={0.8}
                                accessibilityRole="button"
                                accessibilityLabel="Remove from indent"
                                style={{
                                    width: 42,
                                    height: 42,
                                    borderRadius: 10,
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    backgroundColor:
                                        'rgba(220,38,38,0.1)',
                                    borderWidth: 1,
                                    borderColor:
                                        'rgba(220,38,38,0.35)',
                                    marginRight: 8,
                                    opacity: busy ? 0.5 : 1,
                                    ...webPointer,
                                }}
                            >
                                <Trash2 size={16} color="#dc2626" />
                            </TouchableOpacity>
                        )}

                        <TouchableOpacity
                            onPress={handleClose}
                            disabled={busy}
                            activeOpacity={0.8}
                            accessibilityRole="button"
                            style={{
                                flex: 1,
                                height: 42,
                                borderRadius: 10,
                                alignItems: 'center',
                                justifyContent: 'center',
                                backgroundColor: subtleBg,
                                marginRight: 8,
                                opacity: busy ? 0.5 : 1,
                                ...webPointer,
                            }}
                        >
                            <Text
                                style={{
                                    fontFamily: theme.font.bold,
                                    fontSize: theme.fontSize.sm,
                                    color: theme.text,
                                }}
                            >
                                Cancel
                            </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            onPress={handleSubmit}
                            disabled={!canSubmit}
                            activeOpacity={0.85}
                            accessibilityRole="button"
                            style={{
                                flex: 1,
                                height: 42,
                                borderRadius: 10,
                                alignItems: 'center',
                                justifyContent: 'center',
                                backgroundColor: theme.primary,
                                opacity: canSubmit ? 1 : 0.5,
                                ...webPointer,
                            }}
                        >
                            {busy ? (
                                <ActivityIndicator
                                    size="small"
                                    color="#fff"
                                />
                            ) : (
                                <Text
                                    style={{
                                        fontFamily: theme.font.bold,
                                        fontSize: theme.fontSize.sm,
                                        color: '#fff',
                                    }}
                                >
                                    {isEditing
                                        ? 'Update'
                                        : 'Add to indent'}
                                </Text>
                            )}
                        </TouchableOpacity>
                    </View>
                </Pressable>
            </Pressable>
        </Modal>
    );
}