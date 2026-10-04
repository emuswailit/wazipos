// app/(retailers)/retailerInventory/RetailerInventoryAddModal.tsx

import retailersApi from '@/api/retailersApi';
import { DateField } from '@/components/common/DateField';
import { EntityAutocomplete } from '@/components/common/EntityAutocomplete';
import { ProductPickerAutocomplete } from '@/components/common/ProductPickerAutocomplete';
import {
    SelectDropdown,
    type SelectOption,
} from '@/components/common/SelectDropdown';
import { useAuth } from '@/context/AuthContext';
import { useEntitiesSync } from '@/context/EntitiesSyncContext';
import { useInventorySync } from '@/context/InventorySyncContext';
import { useProductsSync } from '@/context/ProductsSyncContext';
import { useApi } from '@/hooks/useApi';
import { Camera } from 'expo-camera';
import { FormikProvider, useFormik } from 'formik';
import React, {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import {
    ActivityIndicator,
    Alert,
    Keyboard,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    Text,
    TextInput,
    TouchableOpacity,
    Vibration,
    View,
    type TextInputProps,
} from 'react-native';
import * as Yup from 'yup';

import ScannerViewfinder from './ScannerViewfinder';

/* =========================================================
 * Sanitizers and platform keyboard mapping
 * ======================================================= */

type InputMode = 'text' | 'int' | 'decimal';

function sanitize(raw: string, mode: InputMode): string {
    if (mode === 'int') {
        return raw.replace(/[^0-9]/g, '');
    }
    if (mode === 'decimal') {
        let cleaned = raw.replace(/[^0-9.]/g, '');
        const firstDot = cleaned.indexOf('.');
        if (firstDot !== -1) {
            cleaned =
                cleaned.slice(0, firstDot + 1) +
                cleaned
                    .slice(firstDot + 1)
                    .replace(/\./g, '');
        }
        return cleaned;
    }
    return raw;
}

function keyboardProps(
    mode: InputMode
): Partial<TextInputProps> {
    if (Platform.OS === 'web') {
        // inputMode only — no <input type="number">, so the
        // browser never runs its own numeric parser against
        // React's controlled value.
        if (mode === 'int') return { inputMode: 'numeric' };
        if (mode === 'decimal') return { inputMode: 'decimal' };
        return {};
    }
    if (mode === 'int') return { keyboardType: 'number-pad' };
    if (mode === 'decimal')
        return { keyboardType: 'decimal-pad' };
    return {};
}

/* =========================================================
 * UniversalInput — local mirror, no clear-on-focus
 * ======================================================= */

interface UniversalInputProps {
    name: string;
    formik: any;
    label: string;
    theme: any;
    isDarkMode: boolean;
    required?: boolean;
    placeholder?: string;
    mode?: InputMode;
    editable?: boolean;
    autoCapitalize?: TextInputProps['autoCapitalize'];
    rightAdornment?: React.ReactNode;
}

function UniversalInput({
    name,
    formik,
    label,
    theme,
    isDarkMode,
    required,
    placeholder,
    mode = 'text',
    editable = true,
    autoCapitalize = 'sentences',
    rightAdornment,
}: UniversalInputProps) {
    const formikValue = formik.values?.[name];
    const externalValue =
        formikValue === undefined || formikValue === null
            ? ''
            : String(formikValue);

    /* Local mirror — the input renders from this while focused,
     * so RN Web never reconciles a stale value mid-edit. */
    const [localValue, setLocalValue] = useState<string>(
        externalValue
    );
    const focusedRef = useRef(false);

    useEffect(() => {
        if (!focusedRef.current) {
            setLocalValue(externalValue);
        }
    }, [externalValue]);

    const touched = formik.touched?.[name];
    const submitted = formik.submitCount > 0;
    const errMsg =
        (touched || submitted) && formik.errors?.[name]
            ? String(formik.errors[name])
            : null;

    const handleChangeText = (raw: string) => {
        const next = sanitize(raw, mode);
        setLocalValue(next);
        formik.setFieldValue(name, next);
    };

    const handleFocus = () => {
        focusedRef.current = true;
    };

    const handleBlur = () => {
        focusedRef.current = false;
        formik.setFieldTouched(name, true, false);
        const current = formik.values?.[name];
        setLocalValue(
            current === undefined || current === null
                ? ''
                : String(current)
        );
    };

    const borderColor = errMsg
        ? '#ef4444'
        : isDarkMode
            ? '#334155'
            : '#e2e8f0';

    return (
        <View className="w-full">
            {label ? (
                <View className="flex-row items-center mb-1">
                    <Text
                        className="uppercase tracking-wide"
                        style={{
                            color: theme.textDark,
                            fontFamily: theme.font.bold,
                            fontSize: 10,
                        }}
                    >
                        {label}
                    </Text>
                    {required ? (
                        <Text
                            style={{
                                color: '#ef4444',
                                fontFamily: theme.font.bold,
                                fontSize: 10,
                                marginLeft: 4,
                            }}
                        >
                            *
                        </Text>
                    ) : null}
                </View>
            ) : null}

            <View
                className="flex-row items-center rounded-xl border"
                style={{
                    borderColor,
                    backgroundColor: isDarkMode
                        ? '#0f172a'
                        : '#f1f5f9',
                    opacity: editable ? 1 : 0.55,
                }}
            >
                <TextInput
                    value={localValue}
                    onChangeText={handleChangeText}
                    onFocus={handleFocus}
                    onBlur={handleBlur}
                    placeholder={placeholder}
                    placeholderTextColor="#94a3b8"
                    autoCorrect={false}
                    autoCapitalize={autoCapitalize}
                    editable={editable}
                    className={`flex-1 py-2.5 pl-3 ${rightAdornment ? 'pr-2' : 'pr-3'
                        }`}
                    style={{
                        color: theme.text,
                        fontFamily: theme.font.medium,
                        fontSize: theme.fontSize.sm,
                        minHeight: 42,
                        ...(Platform.OS === 'web'
                            ? ({ outlineStyle: 'none' } as any)
                            : null),
                    }}
                    {...keyboardProps(mode)}
                />

                {rightAdornment ? (
                    <View className="pr-1.5">
                        {rightAdornment}
                    </View>
                ) : null}
            </View>

            {errMsg ? (
                <Text
                    className="mt-1"
                    style={{
                        color: '#ef4444',
                        fontFamily: theme.font.medium,
                        fontSize: 11,
                    }}
                >
                    {errMsg}
                </Text>
            ) : null}
        </View>
    );
}

/* =========================================================
 * Locked — module scope only
 *
 * Defining this inside ModalBody creates a new component
 * reference on every render, causing React to unmount and
 * remount the wrapped subtree. That destroys focus and
 * resets TextInput state on every keystroke.
 * ======================================================= */

function Locked({
    isEdit,
    allow,
    children,
}: {
    isEdit: boolean;
    allow?: boolean;
    children: React.ReactNode;
}) {
    if (!isEdit || allow) return <>{children}</>;
    return (
        <View pointerEvents="none" style={{ opacity: 0.6 }}>
            {children}
        </View>
    );
}

/* =========================================================
 * Roles, alert, theme
 * ======================================================= */

const PRICING_ROLES = new Set<string>([
    'GeneralRetailerSuperAdmin',
    'PharmaceuticalRetailerSuperAdmin',
]);

function hasPricingRole(user: any): boolean {
    const roles = user?.roles;
    if (!Array.isArray(roles)) return false;
    return roles.some(
        (r: any) =>
            r &&
            (PRICING_ROLES.has(String(r.value ?? '')) ||
                PRICING_ROLES.has(String(r.title ?? '')))
    );
}

function notify(title: string, message: string) {
    if (Platform.OS === 'web') {
        if (typeof window !== 'undefined') {
            window.alert(`${title}\n\n${message}`);
        } else {
            console.log(`[NOTIFY] ${title} — ${message}`);
        }
        return;
    }
    Alert.alert(title, message, [{ text: 'OK' }], {
        cancelable: true,
    });
}

const FALLBACK_THEME = {
    primary: '#0056b3',
    text: '#0f172a',
    textDark: '#334155',
    panel: '#ffffff',
    border: '#e2e8f0',
    font: {
        light: 'Inter-Light',
        regular: 'Inter-Regular',
        medium: 'Inter-Medium',
        semibold: 'Inter-SemiBold',
        bold: 'Inter-Bold',
        italic: 'Inter-Italic',
        mono: 'JetBrainsMono',
    },
    fontSize: {
        xs: 11,
        sm: 13,
        base: 15,
        lg: 17,
        xl: 21,
        xxl: 26,
    },
};

/* =========================================================
 * Validation, initial values, options
 * ======================================================= */

function buildValidationSchema(isEdit: boolean) {
    const dateField = Yup.date()
        .transform((value, originalValue) =>
            String(originalValue ?? '').trim() === ''
                ? null
                : value
        )
        .typeError('Invalid date')
        .nullable()
        .notRequired();

    if (isEdit) {
        return Yup.object().shape({
            manufacture_date: dateField,
            expiry_date: dateField,
        });
    }

    return Yup.object().shape({
        product: Yup.string().required('Required'),
        received_from: Yup.string().nullable().notRequired(),
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
        unit_price_discount: Yup.number()
            .typeError('Must be a number')
            .min(0, 'Cannot be negative')
            .nullable()
            .notRequired(),
        unit_of_receipt: Yup.string().required('Required'),
        manufacture_date: dateField,
        expiry_date: dateField,
    });
}

const INITIAL_VALUES = {
    product: '',
    product_title: '',
    received_from: '',
    received_from_title: '',
    unit_quantity: '',
    unit_of_receipt: '',
    unit_buying_price: '',
    unit_selling_price: '',
    unit_price_discount: '0.00',
    bar_code: '',
    batch: '',
    manufacture_date: '',
    expiry_date: '',
};

const UNIT_OF_RECEIPT_OPTIONS: SelectOption[] = [
    { value: 'Piece', label: 'Piece' },
    { value: 'Gram', label: 'Gram' },
    { value: 'Kilogram', label: 'Kilogram' },
    { value: 'Milligram', label: 'Milligram' },
    { value: 'Millilitre', label: 'Millilitre' },
    { value: 'Litre', label: 'Litre' },
];

function buildDraftId(
    userId: string,
    productId: string
): string {
    return `${userId}:${productId}:${Date.now()}`;
}

/* =========================================================
 * Modal shell
 * ======================================================= */

interface RetailerInventoryAddModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess?: () => void;
    isDarkMode?: boolean;
    theme?: any;
    inventoryToEdit?: any | null;
}

export default function RetailerInventoryAddModal({
    isOpen,
    onClose,
    onSuccess,
    isDarkMode,
    theme,
    inventoryToEdit = null,
}: RetailerInventoryAddModalProps) {
    const { productsList } = useProductsSync();
    const { entitiesList } = useEntitiesSync();

    const cardStyle = {
        backgroundColor: theme?.panel ?? '#ffffff',
        borderColor: isDarkMode ? '#334155' : '#e2e8f0',
    };

    const cardClassName =
        'w-full max-w-4xl max-h-[90%] rounded-2xl border overflow-hidden';

    const body = isOpen ? (
        <ModalBody
            onClose={onClose}
            onSuccess={onSuccess}
            products={productsList}
            entities={entitiesList}
            inventoryToEdit={inventoryToEdit}
        />
    ) : null;

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

/* =========================================================
 * Body
 * ======================================================= */

interface ModalBodyProps {
    onClose: () => void;
    onSuccess?: () => void;
    products: any[];
    entities: any[];
    inventoryToEdit: any | null;
}

function ModalBody({
    onClose,
    onSuccess,
    products,
    entities,
    inventoryToEdit,
}: ModalBodyProps) {
    const auth = useAuth();
    const theme = auth?.theme ?? FALLBACK_THEME;
    const isDarkMode = auth?.isDarkMode ?? false;
    const user = auth?.user;

    const { isOnline, applyServerReceipt } = useInventorySync();

    const writeApi = useApi(
        retailersApi.retailerReceiptsAdminAction
    );

    const currentUserId = String(user?.id ?? '');
    const isEdit = !!inventoryToEdit;
    const isSuperAdmin = hasPricingRole(user);
    const canEditPricing = !isEdit || isSuperAdmin;

    const [isSaving, setIsSaving] = useState(false);
    const [isScanning, setIsScanning] = useState(false);
    const [hasPermission, setHasPermission] = useState<
        boolean | null
    >(null);
    const [scanned, setScanned] = useState(false);

    const formInitialValues = useMemo(
        () =>
            inventoryToEdit
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
                        inventoryToEdit.received_from_title ??
                        '',
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
                    unit_price_discount: String(
                        inventoryToEdit.unit_price_discount ??
                        '0.00'
                    ),
                    bar_code:
                        inventoryToEdit.bar_code ?? '',
                    batch: inventoryToEdit.batch ?? '',
                    manufacture_date:
                        inventoryToEdit.manufacture_date ??
                        '',
                    expiry_date:
                        inventoryToEdit.expiry_date ?? '',
                }
                : INITIAL_VALUES,
        [inventoryToEdit]
    );

    const validationSchema = useMemo(
        () => buildValidationSchema(isEdit),
        [isEdit]
    );

    const handleSubmit = useCallback(
        async (values: typeof INITIAL_VALUES) => {
            setIsSaving(true);
            try {
                if (!isOnline) {
                    notify(
                        'Cannot Save',
                        'You must be online to save inventory. Please check your connection and try again.'
                    );
                    return;
                }

                if (isEdit && !inventoryToEdit?.remote_id) {
                    notify(
                        'Cannot Save',
                        'This record has not been synced with the server yet. Please refresh and try again.'
                    );
                    return;
                }

                const draftId = isEdit
                    ? inventoryToEdit?.draft_id ??
                    buildDraftId(
                        currentUserId,
                        inventoryToEdit?.product ?? ''
                    )
                    : buildDraftId(
                        currentUserId,
                        values.product || ''
                    );

                const lockedFields = isEdit
                    ? {
                        product:
                            inventoryToEdit.product || '',
                        received_from:
                            inventoryToEdit.received_from || '',
                        unit_of_receipt: String(
                            inventoryToEdit.unit_of_receipt ??
                            ''
                        ),
                        received_unit_quantity: Number(
                            inventoryToEdit.received_unit_quantity ??
                            0
                        ),
                        current_unit_quantity: Number(
                            inventoryToEdit.current_unit_quantity ??
                            0
                        ),
                    }
                    : {
                        product: values.product || '',
                        received_from:
                            values.received_from || '',
                        unit_of_receipt: String(
                            values.unit_of_receipt || ''
                        ),
                        received_unit_quantity: Number(
                            values.unit_quantity || 0
                        ),
                        current_unit_quantity: Number(
                            values.unit_quantity || 0
                        ),
                    };

                const pricingFields = canEditPricing
                    ? {
                        unit_buying_price: String(
                            values.unit_buying_price || ''
                        ),
                        unit_selling_price: String(
                            values.unit_selling_price || ''
                        ),
                        unit_price_discount: String(
                            values.unit_price_discount ||
                            '0.00'
                        ),
                    }
                    : {
                        unit_buying_price: String(
                            inventoryToEdit?.unit_buying_price ??
                            ''
                        ),
                        unit_selling_price: String(
                            inventoryToEdit?.unit_selling_price ??
                            ''
                        ),
                        unit_price_discount: String(
                            inventoryToEdit?.unit_price_discount ??
                            '0.00'
                        ),
                    };

                const details = {
                    bar_code: values.bar_code || '',
                    batch: values.batch || '',
                    bulk_buying_price: '',
                    expiry_date: values.expiry_date || '',
                    manufacture_date:
                        values.manufacture_date || '',
                    quantity_discount: '',
                    supplier_invoice: '',
                    draft_id: draftId,
                    ...lockedFields,
                    ...pricingFields,
                };

                const body: any = {
                    action: isEdit
                        ? 'UpdateRetailerReceipt'
                        : 'CreateRetailerReceipt',
                    user_id: currentUserId,
                    retailer_receipt_details: details,
                };

                if (isEdit) {
                    body.retailer_receipt = String(
                        inventoryToEdit.remote_id
                    );
                }

                const res = await writeApi.request(body);

                const responseMessage =
                    res?.data?.response_message ??
                    res?.data?.message ??
                    null;
                const responseErrors = res?.data?.errors ?? null;

                if (!res?.ok) {
                    let errorText = '';
                    if (responseErrors) {
                        if (Array.isArray(responseErrors)) {
                            errorText = responseErrors
                                .map((e: any) =>
                                    typeof e === 'string'
                                        ? e
                                        : e?.message ??
                                        e?.detail ??
                                        JSON.stringify(e)
                                )
                                .join('\n');
                        } else if (
                            typeof responseErrors === 'object'
                        ) {
                            errorText = Object.entries(
                                responseErrors
                            )
                                .map(
                                    ([k, v]) =>
                                        `${k}: ${String(v)}`
                                )
                                .join('\n');
                        } else {
                            errorText = String(responseErrors);
                        }
                    }
                    if (!errorText) {
                        errorText =
                            responseMessage ||
                            res?.problem ||
                            'Server rejected the request.';
                    }
                    notify('Save Failed', errorText);
                    return;
                }

                if (responseMessage) {
                    notify('Saved', String(responseMessage));
                }

                const serverRecord =
                    res?.data?.retailer_receipt ??
                    res?.data?.retailerReceipt ??
                    res?.data?.receipt ??
                    null;

                if (serverRecord) {
                    try {
                        await applyServerReceipt(
                            serverRecord,
                            draftId
                        );
                    } catch (e) {
                        console.warn(
                            '[RetailerInventoryAddModal] applyServerReceipt failed:',
                            e
                        );
                    }
                }

                onSuccess?.();
                onClose?.();
            } catch (err: any) {
                console.error(
                    '[RetailerInventoryAddModal] Save threw:',
                    err?.message ?? err
                );
                notify(
                    'Save Failed',
                    err?.message ||
                    'Unexpected error. Please try again.'
                );
            } finally {
                setIsSaving(false);
            }
        },
        [
            isOnline,
            isEdit,
            inventoryToEdit,
            currentUserId,
            canEditPricing,
            writeApi,
            applyServerReceipt,
            onSuccess,
            onClose,
        ]
    );

    const formik = useFormik({
        initialValues: formInitialValues,
        validationSchema,
        enableReinitialize: true,
        onSubmit: handleSubmit,
    });

    useEffect(() => {
        if (inventoryToEdit) {
            formik.setValues(formInitialValues);
        } else {
            formik.resetForm();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [inventoryToEdit]);

    const openScanner = async () => {
        if (Platform.OS !== 'web') {
            try {
                const { status } =
                    await Camera.requestCameraPermissionsAsync();
                setHasPermission(status === 'granted');
                if (status !== 'granted') return;
            } catch (err) {
                console.warn(
                    'Camera permission request failed:',
                    err
                );
                return;
            }
        } else {
            setHasPermission(true);
        }
        setScanned(false);
        setIsScanning(true);
    };

    const closeScanner = () => {
        setIsScanning(false);
        setScanned(false);
    };

    const handleBarcodeScanned = ({
        data,
    }: {
        type: string;
        data: string;
    }) => {
        if (Platform.OS === 'web') {
            const nav: any =
                typeof navigator !== 'undefined'
                    ? navigator
                    : null;
            if (nav && typeof nav.vibrate === 'function') {
                try {
                    nav.vibrate(60);
                } catch { }
            }
        } else {
            Vibration.vibrate(60);
        }

        setScanned(true);
        formik.setFieldValue('bar_code', data);
        formik.setFieldTouched('bar_code', true, false);

        setTimeout(() => {
            setIsScanning(false);
            setScanned(false);
        }, 400);
    };

    const subB = isDarkMode ? '#334155' : '#f1f5f9';
    const saveButtonBg =
        theme?.primary ?? FALLBACK_THEME.primary;

    const bannerText = isEdit
        ? isSuperAdmin
            ? 'Quantity, product, supplier and unit are locked. Prices and discount can be adjusted.'
            : 'Quantity, product, supplier, unit and pricing are locked. Only barcode, batch, and dates can be changed.'
        : null;

    const errorEntries = useMemo(() => {
        if (formik.submitCount === 0) return [];
        return Object.entries(formik.errors).filter(
            ([, v]) => !!v
        );
    }, [formik.submitCount, formik.errors]);

    return (
        <FormikProvider value={formik}>
            <View className="w-full max-h-full flex-col">
                {/* Header */}
                <View
                    style={{ borderColor: subB }}
                    className="w-full flex-row items-center justify-between border-b px-5 py-4"
                >
                    <View className="flex-1 min-w-0">
                        <Text
                            style={{ color: theme.text }}
                            className="text-base font-black tracking-tight"
                        >
                            {isEdit
                                ? 'Edit Inventory Item'
                                : 'Add New Inventory Item'}
                        </Text>
                        <Text
                            style={{ color: theme.textDark }}
                            className="text-[11px] mt-0.5"
                        >
                            {isEdit
                                ? bannerText
                                : 'Saved online · Synced automatically'}
                        </Text>
                    </View>

                    <TouchableOpacity
                        onPress={onClose}
                        disabled={isSaving}
                        className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 items-center justify-center active:opacity-70"
                    >
                        <Text
                            style={{ color: theme.textDark }}
                            className="text-xs font-bold"
                        >
                            ✕
                        </Text>
                    </TouchableOpacity>
                </View>

                {/* Form body */}
                <ScrollView
                    keyboardShouldPersistTaps="handled"
                    nestedScrollEnabled
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={{
                        paddingHorizontal: 20,
                        paddingTop: 16,
                        paddingBottom: 24,
                    }}
                    style={{ flexGrow: 0, flexShrink: 1 }}
                    className="w-full"
                >
                    <View className="w-full gap-y-4">
                        {errorEntries.length > 0 ? (
                            <View
                                className="rounded-xl px-3 py-2"
                                style={{
                                    backgroundColor:
                                        'rgba(239,68,68,0.10)',
                                    borderWidth: 1,
                                    borderColor:
                                        'rgba(239,68,68,0.35)',
                                }}
                            >
                                <Text
                                    style={{
                                        color: '#ef4444',
                                        fontFamily: theme.font.bold,
                                        fontSize: 11,
                                        marginBottom: 4,
                                    }}
                                >
                                    Please fix the following:
                                </Text>
                                {errorEntries.map(([k, v]) => (
                                    <Text
                                        key={k}
                                        style={{
                                            color: '#ef4444',
                                            fontFamily:
                                                theme.font.medium,
                                            fontSize: 11,
                                        }}
                                    >
                                        • {k}: {String(v)}
                                    </Text>
                                ))}
                            </View>
                        ) : null}

                        {isEdit && bannerText ? (
                            <View
                                className="rounded-xl px-3 py-2"
                                style={{
                                    backgroundColor: `${theme.primary}15`,
                                    borderWidth: 1,
                                    borderColor: `${theme.primary}33`,
                                }}
                            >
                                <Text
                                    style={{
                                        color: theme.primary,
                                        fontFamily: theme.font.bold,
                                        fontSize: 11,
                                    }}
                                >
                                    {bannerText}
                                </Text>
                            </View>
                        ) : null}

                        {/* PRODUCT */}
                        <View
                            className="w-full"
                            style={{ zIndex: 100 }}
                        >
                            <Locked isEdit={isEdit}>
                                <ProductPickerAutocomplete
                                    name="product"
                                    fieldMap={{
                                        id: 'product',
                                        title: 'product_title',
                                        bar_code: 'bar_code',
                                        thumbnail_url:
                                            'thumbnail_url',
                                    }}
                                    products={products}
                                    label="Product"
                                    required
                                    disabled={isEdit}
                                    placeholder="Search products…"
                                    debounceMs={250}
                                    maxDropdownHeight={320}
                                    testID="inventory.product"
                                />
                            </Locked>
                        </View>

                        {/* RECEIVED FROM */}
                        <View
                            className="w-full"
                            style={{ zIndex: 90 }}
                        >
                            <Locked isEdit={isEdit}>
                                <EntityAutocomplete
                                    name="received_from"
                                    fieldMap={{
                                        id: 'received_from',
                                        title: 'received_from_title',
                                    }}
                                    entities={entities}
                                    entityTypes={[
                                        'GeneralWholesaler',
                                    ]}
                                    disabled={isEdit}
                                    label="Received From (optional)"
                                    placeholder="Search wholesalers…"
                                    testID="inventory.received_from"
                                />
                            </Locked>
                        </View>

                        {/* UNIT / QTY / BUY PRICE */}
                        <View className="w-full flex-col md:flex-row gap-3 items-start">
                            <View className="w-full md:flex-1">
                                <Locked isEdit={isEdit}>
                                    <SelectDropdown
                                        name="unit_of_receipt"
                                        label="Unit of Receipt"
                                        required
                                        options={
                                            UNIT_OF_RECEIPT_OPTIONS
                                        }
                                        placeholder="Select unit..."
                                        disabled={isEdit}
                                    />
                                </Locked>
                            </View>

                            <View className="w-full md:flex-1">
                                <Locked isEdit={isEdit}>
                                    <UniversalInput
                                        name="unit_quantity"
                                        formik={formik}
                                        theme={theme}
                                        isDarkMode={isDarkMode}
                                        label="Qty"
                                        required
                                        mode="int"
                                        editable={!isEdit}
                                        placeholder="Enter quantity"
                                    />
                                </Locked>
                            </View>

                            <View className="w-full md:flex-1">
                                <Locked
                                    isEdit={isEdit}
                                    allow={canEditPricing}
                                >
                                    <UniversalInput
                                        name="unit_buying_price"
                                        formik={formik}
                                        theme={theme}
                                        isDarkMode={isDarkMode}
                                        label="Unit Buying Price"
                                        required
                                        mode="decimal"
                                        editable={canEditPricing}
                                        placeholder="0.00"
                                    />
                                </Locked>
                            </View>
                        </View>

                        {/* SELL PRICE / DISCOUNT / BARCODE / BATCH */}
                        <View className="w-full flex-col md:flex-row gap-3 items-start">
                            <View className="w-full md:flex-1">
                                <Locked
                                    isEdit={isEdit}
                                    allow={canEditPricing}
                                >
                                    <UniversalInput
                                        name="unit_selling_price"
                                        formik={formik}
                                        theme={theme}
                                        isDarkMode={isDarkMode}
                                        label="Unit Selling Price"
                                        required
                                        mode="decimal"
                                        editable={canEditPricing}
                                        placeholder="0.00"
                                    />
                                </Locked>
                            </View>

                            <View className="w-full md:flex-1">
                                <Locked
                                    isEdit={isEdit}
                                    allow={canEditPricing}
                                >
                                    <UniversalInput
                                        name="unit_price_discount"
                                        formik={formik}
                                        theme={theme}
                                        isDarkMode={isDarkMode}
                                        label="Unit Discount"
                                        mode="decimal"
                                        editable={canEditPricing}
                                        placeholder="0.00"
                                    />
                                </Locked>
                            </View>

                            <View className="w-full md:flex-1">
                                <UniversalInput
                                    name="bar_code"
                                    formik={formik}
                                    theme={theme}
                                    isDarkMode={isDarkMode}
                                    label="Barcode"
                                    mode="text"
                                    autoCapitalize="none"
                                    placeholder="Optional barcode..."
                                    rightAdornment={
                                        <TouchableOpacity
                                            onPress={openScanner}
                                            activeOpacity={0.7}
                                            style={{
                                                backgroundColor:
                                                    saveButtonBg,
                                                width: 36,
                                                height: 36,
                                                borderRadius: 10,
                                                alignItems:
                                                    'center',
                                                justifyContent:
                                                    'center',
                                            }}
                                            accessibilityRole="button"
                                            accessibilityLabel="Scan barcode"
                                        >
                                            <Text
                                                style={{
                                                    color: '#ffffff',
                                                    fontSize: 16,
                                                }}
                                            >
                                                📷
                                            </Text>
                                        </TouchableOpacity>
                                    }
                                />

                                {isScanning && (
                                    <View className="mt-3">
                                        <ScannerViewfinder
                                            isScanning={isScanning}
                                            hasPermission={
                                                hasPermission
                                            }
                                            scanned={scanned}
                                            onBarcodeScanned={
                                                handleBarcodeScanned
                                            }
                                            onCancel={closeScanner}
                                        />
                                    </View>
                                )}
                            </View>

                            <View className="w-full md:flex-1">
                                <UniversalInput
                                    name="batch"
                                    formik={formik}
                                    theme={theme}
                                    isDarkMode={isDarkMode}
                                    label="Batch Ref No."
                                    mode="text"
                                    autoCapitalize="characters"
                                    placeholder="Optional batch code..."
                                />
                            </View>
                        </View>

                        {/* DATES */}
                        <View className="w-full flex-col md:flex-row gap-3 items-start">
                            <View className="w-full md:flex-1">
                                <DateField
                                    name="manufacture_date"
                                    label="Manufacture Date"
                                    placeholder="YYYY-MM-DD"
                                />
                            </View>

                            <View className="w-full md:flex-1">
                                <DateField
                                    name="expiry_date"
                                    label="Expiry Date"
                                    placeholder="YYYY-MM-DD"
                                />
                            </View>
                        </View>
                    </View>
                </ScrollView>

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
                    {Platform.OS === 'web' ? (
                        <div
                            role="button"
                            aria-disabled={isSaving}
                            onClick={(e: any) => {
                                e.preventDefault();
                                e.stopPropagation();
                                if (isSaving) return;
                                onClose();
                            }}
                            style={{
                                cursor: isSaving
                                    ? 'not-allowed'
                                    : 'pointer',
                                userSelect: 'none',
                                WebkitUserSelect: 'none',
                                opacity: isSaving ? 0.5 : 1,
                            }}
                        >
                            <View className="px-4 h-10 rounded-xl items-center justify-center border border-gray-200 dark:border-slate-700">
                                <Text
                                    style={{
                                        color: theme.textDark,
                                    }}
                                    className="text-xs font-bold uppercase tracking-wider"
                                >
                                    Cancel
                                </Text>
                            </View>
                        </div>
                    ) : (
                        <TouchableOpacity
                            disabled={isSaving}
                            onPress={onClose}
                            activeOpacity={0.7}
                            className="px-4 h-10 rounded-xl items-center justify-center border border-gray-200 dark:border-slate-700"
                        >
                            <Text
                                style={{
                                    color: theme.textDark,
                                }}
                                className="text-xs font-bold uppercase tracking-wider"
                            >
                                Cancel
                            </Text>
                        </TouchableOpacity>
                    )}

                    {Platform.OS === 'web' ? (
                        <div
                            role="button"
                            aria-disabled={isSaving}
                            onClick={(e: any) => {
                                e.preventDefault();
                                e.stopPropagation();
                                if (isSaving) return;
                                formik.handleSubmit();
                            }}
                            style={{
                                marginLeft: 12,
                                cursor: isSaving
                                    ? 'not-allowed'
                                    : 'pointer',
                                userSelect: 'none',
                                WebkitUserSelect: 'none',
                            }}
                        >
                            <View
                                style={{
                                    backgroundColor: saveButtonBg,
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
                                        {isEdit
                                            ? 'Update Entry'
                                            : 'Save Entry'}
                                    </Text>
                                )}
                            </View>
                        </div>
                    ) : (
                        <TouchableOpacity
                            disabled={isSaving}
                            onPress={() => formik.handleSubmit()}
                            activeOpacity={0.7}
                            style={{
                                backgroundColor: saveButtonBg,
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
                                    {isEdit
                                        ? 'Update Entry'
                                        : 'Save Entry'}
                                </Text>
                            )}
                        </TouchableOpacity>
                    )}
                </View>
            </View>
        </FormikProvider>
    );
}