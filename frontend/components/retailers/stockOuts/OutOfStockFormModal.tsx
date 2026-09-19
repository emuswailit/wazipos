// components/retailers/stockOuts/OutOfStockFormModal.tsx

import ProductAutocomplete from '@/components/retailers/retailerInventory/ProductAutocomplete';
import { useAuth } from '@/context/AuthContext';
import { useProductsSync } from '@/context/ProductsSyncContext';
import {
    rememberProductTitle,
    useRetailerOutOfStocksSync,
} from '@/context/RetailerOutOfStocksSyncContext';
import { RetailerOutOfStockNormalized } from '@/databases/types';
import React, {
    useCallback,
    useEffect,
    useMemo,
    useState,
} from 'react';
import {
    ActivityIndicator,
    KeyboardAvoidingView,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    View,
} from 'react-native';

/* ------------------------------------------------------------------ */
/* Option types                                                        */
/* ------------------------------------------------------------------ */
export interface UnitOption {
    value: string;
    label: string;
}

const DEFAULT_UNITS: UnitOption[] = [
    { value: 'Piece', label: 'Piece' },
    { value: 'Pack', label: 'Pack' },
    { value: 'Box', label: 'Box' },
    { value: 'Carton', label: 'Carton' },
    { value: 'Dozen', label: 'Dozen' },
    { value: 'Kilogram', label: 'Kilogram' },
    { value: 'Gram', label: 'Gram' },
    { value: 'Litre', label: 'Litre' },
];

/* ------------------------------------------------------------------ */
/* Props                                                               */
/* ------------------------------------------------------------------ */
export type OutOfStockFormMode = 'create' | 'edit';

export interface OutOfStockFormModalProps {
    visible: boolean;
    mode: OutOfStockFormMode;
    item?: RetailerOutOfStockNormalized | null;
    onClose: () => void;
    onSaved?: (id: string) => void;
    units?: UnitOption[];
}

/* ------------------------------------------------------------------ */
/* Form state                                                          */
/* ------------------------------------------------------------------ */
interface FormState {
    productId: string | null;
    productTitle: string;
    unitOfReceipt: string;
    requiredQuantity: string;
    customerName: string;
    customerPhone: string;
    isSpecialOrder: boolean;
}

const EMPTY_FORM: FormState = {
    productId: null,
    productTitle: '',
    unitOfReceipt: DEFAULT_UNITS[0].value,
    requiredQuantity: '',
    customerName: '',
    customerPhone: '',
    isSpecialOrder: false,
};

function formFromItem(
    item: RetailerOutOfStockNormalized
): FormState {
    return {
        productId: item.product ?? null,
        productTitle: item.product_title ?? '',
        unitOfReceipt:
            item.unit_of_receipt || DEFAULT_UNITS[0].value,
        requiredQuantity: String(
            item.required_quantity ?? 0
        ),
        customerName: item.customer_name ?? '',
        customerPhone: item.customer_phone ?? '',
        isSpecialOrder: !!item.is_special_order,
    };
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */
export function OutOfStockFormModal({
    visible,
    mode,
    item,
    onClose,
    onSaved,
    units = DEFAULT_UNITS,
}: OutOfStockFormModalProps) {
    const { theme, isDarkMode } = useAuth();

    /* Products come from the shared products sync context. */
    const { productsList, isProductsSyncing } =
        useProductsSync();

    const {
        createOutOfStock,
        queueOutOfStockEdit,
    } = useRetailerOutOfStocksSync();

    const isEdit = mode === 'edit';

    const [form, setForm] = useState<FormState>(EMPTY_FORM);
    const [saving, setSaving] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(
        null
    );

    useEffect(() => {
        if (!visible) return;
        if (isEdit && item) {
            setForm(formFromItem(item));
        } else {
            setForm(EMPTY_FORM);
        }
        setErrorMsg(null);
        setSaving(false);
    }, [visible, isEdit, item]);

    const qtyNumber = useMemo(() => {
        const n = Number(form.requiredQuantity);
        return Number.isFinite(n) && n > 0
            ? Math.floor(n)
            : 0;
    }, [form.requiredQuantity]);

    const canSubmit = useMemo(() => {
        if (saving) return false;
        if (qtyNumber <= 0) return false;
        if (!isEdit && !form.productId) return false;
        return true;
    }, [saving, qtyNumber, isEdit, form.productId]);

    const setField = useCallback(
        <K extends keyof FormState>(
            key: K,
            value: FormState[K]
        ) => {
            setForm((prev) => ({ ...prev, [key]: value }));
        },
        []
    );

    const handleSelectProduct = useCallback(
        (remoteId: string, title: string) => {
            setForm((prev) => ({
                ...prev,
                productId: remoteId,
                productTitle: title,
            }));
            rememberProductTitle(remoteId, title);
        },
        []
    );

    const handleSubmit = useCallback(async () => {
        if (!canSubmit) return;
        setSaving(true);
        setErrorMsg(null);

        try {
            if (isEdit && item) {
                await queueOutOfStockEdit(item.remote_id, {
                    product: item.product,
                    required_quantity: qtyNumber,
                    is_special_order: form.isSpecialOrder,
                    customer_name:
                        form.customerName || null,
                    customer_phone:
                        form.customerPhone || null,
                });
                onSaved?.(item.remote_id);
            } else {
                const draftId = await createOutOfStock({
                    product: form.productId!,
                    required_quantity: qtyNumber,
                    is_special_order:
                        form.isSpecialOrder,
                    customer_name:
                        form.customerName || null,
                    customer_phone:
                        form.customerPhone || null,
                    unit_of_receipt: form.unitOfReceipt,
                });
                onSaved?.(draftId);
            }
            setSaving(false);
            onClose();
        } catch (e: any) {
            setErrorMsg(
                e?.message ||
                (isEdit
                    ? 'Could not queue the edit.'
                    : 'Could not queue the out-of-stock item.')
            );
            setSaving(false);
        }
    }, [
        canSubmit,
        isEdit,
        item,
        queueOutOfStockEdit,
        onSaved,
        createOutOfStock,
        form,
        qtyNumber,
        onClose,
    ]);

    if (!visible) return null;

    const borderColor = isDarkMode ? '#334155' : '#e2e8f0';
    const dividerColor = isDarkMode ? '#334155' : '#f1f5f9';
    const inputBg = isDarkMode ? '#0f172a' : '#f8fafc';

    const inputStyle = {
        borderColor,
        backgroundColor: inputBg,
        color: theme.text,
        fontFamily: theme.font.medium,
        fontSize: theme.fontSize.sm,
    };

    const title = isEdit
        ? 'Edit Out-of-Stock'
        : 'New Out of Stock';
    const subtitle = isEdit
        ? item?.product_title ?? ''
        : 'Record a product that is out of stock';
    const submitLabel = isEdit ? 'Save' : 'Create';

    return (
        <Modal
            visible={visible}
            animationType="fade"
            transparent
            onRequestClose={saving ? () => { } : onClose}
        >
            <KeyboardAvoidingView
                style={styles.backdrop}
                behavior={
                    Platform.OS === 'ios'
                        ? 'padding'
                        : undefined
                }
            >
                <View
                    className="w-full max-w-[560px] rounded-2xl border overflow-hidden"
                    style={{
                        backgroundColor: theme.panel,
                        borderColor,
                    }}
                >
                    {/* Header */}
                    <View
                        className="flex-row items-center justify-between p-4 border-b"
                        style={{ borderBottomColor: dividerColor }}
                    >
                        <View className="flex-1">
                            <Text
                                style={{
                                    color: theme.text,
                                    fontFamily: theme.font.bold,
                                    fontSize: theme.fontSize.lg,
                                }}
                            >
                                {title}
                            </Text>
                            <Text
                                className="mt-0.5"
                                numberOfLines={1}
                                style={{
                                    color: theme.textDark,
                                    fontFamily:
                                        theme.font.medium,
                                    fontSize: theme.fontSize.xs,
                                }}
                            >
                                {subtitle}
                            </Text>
                        </View>
                        <Pressable
                            onPress={onClose}
                            disabled={saving}
                            hitSlop={10}
                            className="p-1.5"
                            style={{ opacity: saving ? 0.4 : 1 }}
                        >
                            <Text
                                style={{
                                    color: theme.textDark,
                                    fontFamily: theme.font.bold,
                                    fontSize: theme.fontSize.base,
                                }}
                            >
                                ✕
                            </Text>
                        </Pressable>
                    </View>

                    {/* Body */}
                    <ScrollView
                        contentContainerStyle={{ padding: 16 }}
                        keyboardShouldPersistTaps="handled"
                    >
                        {errorMsg ? (
                            <View
                                className="rounded-xl px-3 py-2 mb-3"
                                style={{
                                    backgroundColor:
                                        'rgba(244,63,94,0.12)',
                                }}
                            >
                                <Text
                                    style={{
                                        color: '#f43f5e',
                                        fontFamily:
                                            theme.font.bold,
                                        fontSize: 12,
                                    }}
                                >
                                    {errorMsg}
                                </Text>
                            </View>
                        ) : null}

                        {/* Product — create only, using shared picker */}
                        {!isEdit ? (
                            <View style={{ zIndex: 1000 }}>
                                <ProductAutocomplete
                                    theme={theme}
                                    isDarkMode={isDarkMode}
                                    products={productsList}
                                    selectedValue={
                                        form.productId ?? ''
                                    }
                                    initialTitle={
                                        form.productTitle
                                    }
                                    onSelect={
                                        handleSelectProduct
                                    }
                                    zIndexValue={1000}
                                />

                                {isProductsSyncing &&
                                    productsList.length === 0 ? (
                                    <Text
                                        className="mt-2"
                                        style={{
                                            color: theme.textDark,
                                            fontFamily:
                                                theme.font.medium,
                                            fontSize:
                                                theme.fontSize.xs,
                                            opacity: 0.7,
                                        }}
                                    >
                                        Loading catalog…
                                    </Text>
                                ) : null}
                            </View>
                        ) : null}

                        {/* Unit — create only */}
                        {!isEdit ? (
                            <View className="mt-4">
                                <FieldLabel
                                    label="Unit of Receipt"
                                    theme={theme}
                                />
                                <UnitPicker
                                    units={units}
                                    value={form.unitOfReceipt}
                                    onChange={(v) =>
                                        setField(
                                            'unitOfReceipt',
                                            v
                                        )
                                    }
                                    theme={theme}
                                    inputStyle={inputStyle}
                                    borderColor={borderColor}
                                    inputBg={inputBg}
                                    disabled={saving}
                                />
                            </View>
                        ) : null}

                        {/* Quantity — both */}
                        <View className="mt-4">
                            <FieldLabel
                                label="Required Quantity"
                                theme={theme}
                            />
                            <TextInput
                                keyboardType="number-pad"
                                value={form.requiredQuantity}
                                onChangeText={(t) =>
                                    setField(
                                        'requiredQuantity',
                                        t.replace(
                                            /[^0-9]/g,
                                            ''
                                        )
                                    )
                                }
                                editable={!saving}
                                placeholder="0"
                                placeholderTextColor="#94a3b8"
                                className="h-11 rounded-xl border px-3.5"
                                style={{
                                    ...inputStyle,
                                    opacity: saving ? 0.6 : 1,
                                }}
                            />
                        </View>

                        {/* Customer fields — both */}
                        <View className="flex-row gap-3 mt-4">
                            <View className="flex-1">
                                <FieldLabel
                                    label="Customer Name (optional)"
                                    theme={theme}
                                />
                                <TextInput
                                    value={form.customerName}
                                    onChangeText={(v) =>
                                        setField(
                                            'customerName',
                                            v
                                        )
                                    }
                                    editable={!saving}
                                    placeholder="—"
                                    placeholderTextColor="#94a3b8"
                                    autoCapitalize="words"
                                    className="h-11 rounded-xl border px-3.5"
                                    style={{
                                        ...inputStyle,
                                        opacity: saving
                                            ? 0.6
                                            : 1,
                                    }}
                                />
                            </View>
                            <View className="flex-1">
                                <FieldLabel
                                    label="Customer Phone (optional)"
                                    theme={theme}
                                />
                                <TextInput
                                    keyboardType="phone-pad"
                                    value={form.customerPhone}
                                    onChangeText={(v) =>
                                        setField(
                                            'customerPhone',
                                            v
                                        )
                                    }
                                    editable={!saving}
                                    placeholder="—"
                                    placeholderTextColor="#94a3b8"
                                    className="h-11 rounded-xl border px-3.5"
                                    style={{
                                        ...inputStyle,
                                        opacity: saving
                                            ? 0.6
                                            : 1,
                                    }}
                                />
                            </View>
                        </View>

                        {/* Special order — both */}
                        <View
                            className="flex-row items-center justify-between rounded-xl border px-3.5 py-3 mt-4"
                            style={{
                                borderColor,
                                backgroundColor: inputBg,
                            }}
                        >
                            <View className="flex-1 pr-3">
                                <Text
                                    className="uppercase tracking-widest"
                                    style={{
                                        color: theme.textDark,
                                        fontFamily:
                                            theme.font.bold,
                                        fontSize: 10,
                                    }}
                                >
                                    Special Order
                                </Text>
                                <Text
                                    className="mt-1"
                                    style={{
                                        color: theme.textDark,
                                        fontFamily:
                                            theme.font.medium,
                                        fontSize:
                                            theme.fontSize.xs,
                                        opacity: 0.85,
                                    }}
                                >
                                    Mark this item as a
                                    special order for the
                                    customer.
                                </Text>
                            </View>
                            <Switch
                                value={form.isSpecialOrder}
                                onValueChange={(v) =>
                                    setField(
                                        'isSpecialOrder',
                                        v
                                    )
                                }
                                disabled={saving}
                                trackColor={{
                                    false: isDarkMode
                                        ? '#334155'
                                        : '#cbd5e1',
                                    true: theme.primary,
                                }}
                            />
                        </View>
                    </ScrollView>

                    {/* Footer */}
                    <View
                        className="flex-row justify-end gap-2 p-4 border-t"
                        style={{ borderTopColor: dividerColor }}
                    >
                        <Pressable
                            onPress={onClose}
                            disabled={saving}
                            className="px-4 py-2.5 rounded-xl border"
                            style={{
                                borderColor,
                                opacity: saving ? 0.4 : 1,
                            }}
                        >
                            <Text
                                className="uppercase tracking-wide"
                                style={{
                                    color: theme.textDark,
                                    fontFamily: theme.font.bold,
                                    fontSize: 12,
                                }}
                            >
                                Cancel
                            </Text>
                        </Pressable>
                        <Pressable
                            onPress={handleSubmit}
                            disabled={!canSubmit}
                            className="px-4 py-2.5 rounded-xl flex-row items-center gap-2"
                            style={{
                                backgroundColor: theme.primary,
                                opacity: !canSubmit ? 0.5 : 1,
                            }}
                        >
                            {saving ? (
                                <ActivityIndicator
                                    size="small"
                                    color="#ffffff"
                                />
                            ) : null}
                            <Text
                                className="uppercase tracking-wide text-white"
                                style={{
                                    fontFamily: theme.font.bold,
                                    fontSize: 12,
                                }}
                            >
                                {saving
                                    ? 'Saving…'
                                    : submitLabel}
                            </Text>
                        </Pressable>
                    </View>
                </View>
            </KeyboardAvoidingView>
        </Modal>
    );
}

/* ------------------------------------------------------------------ */
/* FieldLabel                                                          */
/* ------------------------------------------------------------------ */
function FieldLabel({
    label,
    theme,
}: {
    label: string;
    theme: ReturnType<typeof useAuth>['theme'];
}) {
    return (
        <Text
            className="uppercase tracking-widest mb-1.5"
            style={{
                color: theme.textDark,
                fontFamily: theme.font.bold,
                fontSize: 10,
            }}
        >
            {label}
        </Text>
    );
}

/* ------------------------------------------------------------------ */
/* UnitPicker                                                          */
/* ------------------------------------------------------------------ */
function UnitPicker({
    units,
    value,
    onChange,
    theme,
    inputStyle,
    borderColor,
    inputBg,
    disabled,
}: {
    units: UnitOption[];
    value: string;
    onChange: (v: string) => void;
    theme: ReturnType<typeof useAuth>['theme'];
    inputStyle: any;
    borderColor: string;
    inputBg: string;
    disabled?: boolean;
}) {
    const [open, setOpen] = useState(false);
    const selected = units.find((u) => u.value === value);

    return (
        <View>
            <Pressable
                onPress={() => setOpen((v) => !v)}
                disabled={disabled}
                className="h-11 rounded-xl border px-3.5 flex-row items-center justify-between"
                style={{
                    ...inputStyle,
                    opacity: disabled ? 0.6 : 1,
                }}
            >
                <Text
                    numberOfLines={1}
                    style={{
                        color: theme.text,
                        fontFamily: theme.font.medium,
                        fontSize: theme.fontSize.sm,
                        flex: 1,
                    }}
                >
                    {selected?.label ?? 'Select unit…'}
                </Text>
                <Text
                    style={{
                        color: theme.textDark,
                        marginLeft: 8,
                    }}
                >
                    {open ? '▲' : '▼'}
                </Text>
            </Pressable>

            {open ? (
                <View
                    className="mt-2 rounded-xl border overflow-hidden"
                    style={{
                        borderColor,
                        backgroundColor: inputBg,
                        maxHeight: 220,
                    }}
                >
                    <ScrollView keyboardShouldPersistTaps="handled">
                        {units.map((u) => {
                            const isSel = u.value === value;
                            return (
                                <Pressable
                                    key={u.value}
                                    onPress={() => {
                                        onChange(u.value);
                                        setOpen(false);
                                    }}
                                    className="px-3 py-2.5"
                                    style={{
                                        backgroundColor: isSel
                                            ? `${theme.primary}15`
                                            : 'transparent',
                                    }}
                                >
                                    <Text
                                        style={{
                                            color: theme.text,
                                            fontFamily: isSel
                                                ? theme.font.bold
                                                : theme.font.medium,
                                            fontSize:
                                                theme.fontSize.sm,
                                        }}
                                    >
                                        {u.label}
                                    </Text>
                                </Pressable>
                            );
                        })}
                    </ScrollView>
                </View>
            ) : null}
        </View>
    );
}

const styles = StyleSheet.create({
    backdrop: {
        flex: 1,
        backgroundColor: 'rgba(15,23,42,0.55)',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
    },
});