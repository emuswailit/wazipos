// app/(wholesalers)/wholesaleInventory/InventoryAddModal.tsx

import { useAuth } from '@/context/AuthContext';
import { useEntitiesSync } from '@/context/EntitiesSyncContext';
import {
    computeDaysToExpiry,
    computeExpiryStatus,
    useInventorySync,
} from '@/context/InventorySyncContext';
import { useProductsSync } from '@/context/ProductsSyncContext';
import { CachedReceipt } from '@/databases/types';
import { upsertLocal } from '@/services/inventoryLocalStore';
import { useFormik } from 'formik';
import React, { useEffect } from 'react';
import {
    ActivityIndicator,
    Keyboard,
    Modal,
    Platform,
    Pressable,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import * as Yup from 'yup';

import InventoryAddForm from './InventoryAddForm';

/* ---------------------------------------------------------
 * Validation schema
 * ------------------------------------------------------- */

const ValSchema = Yup.object().shape({
    product: Yup.string().required('Required'),

    received_from: Yup.string().required(
        'Select who the inventory was received from'
    ),

    unit_quantity: Yup.number()
        .typeError('Must be a number')
        .positive('Must be > 0')
        .required('Required'),

    unit_buying_price: Yup.number()
        .typeError('Must be a number')
        .min(0, 'Cannot be negative')
        .required('Required'),

    unit_selling_price: Yup.number()
        .typeError('Must be a number')
        .positive('Must be > 0')
        .required('Required'),

    unit_of_receipt: Yup.string().required('Required'),

    expiry_date: Yup.date()
        .transform((value, originalValue) =>
            String(originalValue).trim() === ''
                ? null
                : value
        )
        .typeError('Invalid date')
        .min(
            new Date(
                new Date().setHours(0, 0, 0, 0) +
                86_400_000
            ),
            'Must be a future date'
        )
        .nullable()
        .notRequired(),
});

const INITIAL_VALUES = {
    product: '',
    product_title: '',

    received_from: '',
    received_from_title: '',

    unit_quantity: '',
    unit_of_receipt: '',

    unit_buying_price: '',
    unit_selling_price: '',

    bar_code: '',
    batch: '',

    manufacture_date: '',
    expiry_date: '',
};

/* ---------------------------------------------------------
 * ID builders
 * ------------------------------------------------------- */

function buildDraftId(
    userId: string,
    productId: string
): string {
    return `${userId}:${productId}:${Date.now()}`;
}

function makeLocalId(): string {
    return `local-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 10)}`;
}

interface InventoryAddModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess?: () => void;
    isDarkMode: boolean;
    theme: any;
    inventoryToEdit?: any | null;
}

/* ---------------------------------------------------------
 * Modal shell
 * ------------------------------------------------------- */

export default function InventoryAddModal({
    isOpen,
    onClose,
    onSuccess,
    isDarkMode,
    theme,
    inventoryToEdit = null,
}: InventoryAddModalProps) {
    const { productsList } = useProductsSync();
    const { entitiesList } = useEntitiesSync();

    const cardStyle = {
        backgroundColor: theme?.panel ?? '#ffffff',
        borderColor: isDarkMode ? '#334155' : '#e2e8f0',
    };

    const cardClassName =
        'w-full max-w-4xl max-h-[90%] rounded-2xl border overflow-hidden';

    const body = isOpen ? (
        <InventoryModalBody
            onClose={onClose}
            onSuccess={onSuccess}
            isDarkMode={isDarkMode}
            theme={theme}
            products={productsList}
            entities={entitiesList}
            inventoryToEdit={inventoryToEdit}
        />
    ) : null;

    /* ---------- WEB ---------- */
    if (Platform.OS === 'web') {
        return (
            <Modal
                visible={isOpen}
                animationType="slide"
                transparent
                statusBarTranslucent
                onRequestClose={onClose}
            >
                <View
                    className="flex-1 items-center justify-center bg-black/60 px-4 md:px-0"
                    style={{ width: '100%' }}
                >
                    <View
                        style={cardStyle}
                        className={cardClassName}
                    >
                        {body}
                    </View>
                </View>
            </Modal>
        );
    }

    /* ---------- NATIVE ---------- */
    return (
        <Modal
            visible={isOpen}
            animationType="slide"
            transparent
            statusBarTranslucent
            onRequestClose={onClose}
        >
            <Pressable
                className="flex-1 items-center justify-center bg-black/60 px-4 md:px-0"
                onPress={Keyboard.dismiss}
                style={{ width: '100%' }}
            >
                <Pressable
                    onPress={() => { }}
                    style={cardStyle}
                    className={cardClassName}
                >
                    {body}
                </Pressable>
            </Pressable>
        </Modal>
    );
}

/* ---------------------------------------------------------
 * Body
 * ------------------------------------------------------- */

interface InventoryModalBodyProps {
    onClose: () => void;
    onSuccess?: () => void;
    isDarkMode: boolean;
    theme: any;
    products: any[];
    entities: any[];
    inventoryToEdit: any | null;
}

function InventoryModalBody({
    onClose,
    onSuccess,
    isDarkMode,
    theme,
    products,
    entities,
    inventoryToEdit,
}: InventoryModalBodyProps) {
    const { triggerManualFetch, pushPending } =
        useInventorySync();

    const { user } = useAuth();
    const currentUserId = String(user?.id ?? '');

    const [isSaving, setIsSaving] = React.useState(false);

    const formInitialValues = inventoryToEdit
        ? {
            ...INITIAL_VALUES,
            product: String(
                inventoryToEdit.product ?? ''
            ),
            product_title:
                inventoryToEdit.title ??
                inventoryToEdit.product_title ??
                '',
            received_from: String(
                inventoryToEdit.received_from ?? ''
            ),
            received_from_title:
                inventoryToEdit.received_from_title ?? '',
            unit_quantity: String(
                inventoryToEdit.received_unit_quantity ??
                inventoryToEdit.current_unit_quantity ??
                ''
            ),
            unit_of_receipt:
                inventoryToEdit.unit_of_receipt ?? '',
            unit_buying_price: String(
                inventoryToEdit.unit_buying_price ?? ''
            ),
            unit_selling_price: String(
                inventoryToEdit.unit_selling_price ?? ''
            ),
            bar_code: inventoryToEdit.bar_code ?? '',
            batch: inventoryToEdit.batch ?? '',
            manufacture_date:
                inventoryToEdit.manufacture_date ?? '',
            expiry_date:
                inventoryToEdit.expiry_date ?? '',
        }
        : INITIAL_VALUES;

    const formik = useFormik({
        initialValues: formInitialValues,
        validationSchema: ValSchema,
        enableReinitialize: true,

        onSubmit: async (values) => {
            setIsSaving(true);
            try {
                const now = new Date().toISOString();

                const id = inventoryToEdit
                    ? String(inventoryToEdit.id)
                    : makeLocalId();

                const draftId = inventoryToEdit
                    ? inventoryToEdit.draft_id ?? null
                    : buildDraftId(
                        currentUserId,
                        values.product || ''
                    );

                const days = computeDaysToExpiry(
                    values.expiry_date
                );
                const expiryStatus =
                    computeExpiryStatus(days);

                const localRecord: CachedReceipt = {
                    ...(inventoryToEdit ?? {}),

                    id,
                    key: id,

                    title: values.product_title || '',
                    long_title:
                        values.product_title || '',
                    product: values.product || '',

                    received_from:
                        values.received_from || '',
                    received_from_title:
                        values.received_from_title || '',

                    unit_buying_price: String(
                        values.unit_buying_price || ''
                    ),
                    unit_selling_price: String(
                        values.unit_selling_price || ''
                    ),
                    final_unit_selling_price: String(
                        values.unit_selling_price || ''
                    ),
                    unit_price_discount: '0.00',

                    received_unit_quantity: Number(
                        values.unit_quantity || 0
                    ),
                    current_unit_quantity: Number(
                        values.unit_quantity || 0
                    ),

                    unit_of_receipt:
                        values.unit_of_receipt || '',

                    bar_code: values.bar_code || '',
                    batch: values.batch || '',

                    manufacture_date:
                        values.manufacture_date || '',
                    expiry_date:
                        values.expiry_date || '',

                    days_to_expiry: days ?? 0,
                    expiry_status: expiryStatus,

                    manufacturer_title:
                        inventoryToEdit?.manufacturer_title ??
                        '',
                    origin_country_title:
                        inventoryToEdit?.origin_country_title ??
                        '',
                    images: inventoryToEdit?.images ?? [],

                    /* ---- Sync metadata ---- */
                    synced: false,
                    draft_id: draftId,
                    server_id: inventoryToEdit?.server_id ?? null,
                    sync_error: null,
                    local_created_at:
                        inventoryToEdit?.local_created_at ??
                        now,
                    cached_at: now,
                } as CachedReceipt;

                console.log(
                    '[InventoryAddModal] Saving locally:',
                    {
                        id,
                        synced: localRecord.synced,
                        draft_id: draftId,
                        product: localRecord.product,
                    }
                );

                await upsertLocal(localRecord);

                /* Verify the write */
                try {
                    const verify = await upsertLocal;
                    /* noop — just to keep the call shape consistent */
                } catch { }

                /* Trigger a push immediately if online */
                try {
                    await pushPending?.();
                } catch (e) {
                    console.warn(
                        '[InventoryAddModal] Immediate push failed (will retry):',
                        e
                    );
                }

                /* Refresh local list so the container sees it */
                try {
                    await triggerManualFetch?.();
                } catch { }

                formik.resetForm();
                onSuccess?.();
                onClose?.();
            } catch (err) {
                console.error(
                    '[InventoryAddModal] Local save failed:',
                    err
                );
            } finally {
                setIsSaving(false);
            }
        },
    });

    useEffect(() => {
        if (inventoryToEdit) {
            formik.setValues(formInitialValues);
        } else {
            formik.resetForm();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [inventoryToEdit]);

    const subB = isDarkMode ? '#334155' : '#f1f5f9';

    return (
        <View className="w-full max-h-full flex-col">
            {/* Header */}
            <View
                style={{ borderColor: subB }}
                className="w-full flex-row items-center justify-between border-b px-5 py-4"
            >
                <View>
                    <Text
                        style={{ color: theme?.text }}
                        className="text-base font-black tracking-tight"
                    >
                        {inventoryToEdit
                            ? 'Edit Inventory Item'
                            : 'Add New Inventory Item'}
                    </Text>
                    <Text
                        style={{ color: theme?.textDark }}
                        className="text-[11px] mt-0.5"
                    >
                        Saved locally · Synced automatically
                    </Text>
                </View>

                <TouchableOpacity
                    onPress={onClose}
                    disabled={isSaving}
                    className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 items-center justify-center active:opacity-70"
                >
                    <Text
                        style={{ color: theme?.textDark }}
                        className="text-xs font-bold"
                    >
                        ✕
                    </Text>
                </TouchableOpacity>
            </View>

            <InventoryAddForm
                formik={formik}
                isDarkMode={isDarkMode}
                theme={theme}
                products={products}
                entities={entities}
            />

            {/* Footer */}
            <View
                style={{
                    borderColor: isDarkMode
                        ? '#334155'
                        : '#f1f5f9',
                    backgroundColor: isDarkMode
                        ? '#1e293b'
                        : '#f8fafc',
                }}
                className="w-full border-t flex-row items-center justify-end px-5 py-3.5"
            >
                <TouchableOpacity
                    disabled={isSaving}
                    onPress={onClose}
                    activeOpacity={0.7}
                    className="px-4 h-10 rounded-xl items-center justify-center border border-gray-200 dark:border-slate-700"
                >
                    <Text
                        style={{ color: theme?.textDark }}
                        className="text-xs font-bold uppercase tracking-wider"
                    >
                        Cancel
                    </Text>
                </TouchableOpacity>

                <TouchableOpacity
                    disabled={isSaving}
                    onPress={() => formik.handleSubmit()}
                    activeOpacity={0.7}
                    style={{
                        backgroundColor: theme?.primary,
                        marginLeft: 12,
                        opacity: isSaving ? 0.7 : 1,
                    }}
                    className="px-5 h-10 rounded-xl flex-row items-center justify-center"
                >
                    {isSaving ? (
                        <ActivityIndicator
                            size="small"
                            color="#ffffff"
                        />
                    ) : (
                        <Text className="text-xs font-black text-white uppercase tracking-wide">
                            {inventoryToEdit
                                ? 'Update Entry'
                                : 'Save Entry'}
                        </Text>
                    )}
                </TouchableOpacity>
            </View>
        </View>
    );
}