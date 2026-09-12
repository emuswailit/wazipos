// app/(wholesalers)/wholesaleInventory/InventoryAddForm.tsx

import DateTimePicker, {
    DateTimePickerAndroid,
} from '@react-native-community/datetimepicker';
import { Camera } from 'expo-camera';
import React, {
    useEffect,
    useMemo,
    useState,
} from 'react';
import {
    Platform,
    Pressable,
    ScrollView,
    Text,
    TextInput,
    TouchableOpacity,
    Vibration,
    View,
} from 'react-native';

import EntityAutocomplete from './EntityAutocomplete';
import ProductAutocomplete from './ProductAutocomplete';
import ScannerViewfinder from './ScannerViewfinder';

interface InventoryAddFormProps {
    formik: any;
    isDarkMode: boolean;
    theme: any;
    products: any[];
    entities: any[];
}

const UNIT_OF_RECEIPT_OPTIONS = [
    'Piece',
    'Gram',
    'Kilogram',
    'Milligram',
    'Millilitre',
    'Litre',
];

/* =========================================================
 * Universal Date Picker
 * ======================================================= */

interface UniversalDatePickerProps {
    value?: string | null;
    onChange: (value: string | null) => void;
    theme: any;
    isDarkMode: boolean;
    hasError?: boolean;
    placeholder?: string;
    minDate?: Date;
}

function UniversalDatePicker({
    value,
    onChange,
    theme,
    isDarkMode,
    hasError = false,
    placeholder = 'Select Date...',
    minDate,
}: UniversalDatePickerProps) {
    const [showPicker, setShowPicker] = useState(false);

    const backgroundColor = isDarkMode
        ? '#1e293b'
        : '#f8fafc';
    const textColor = theme?.text || '#0f172a';
    const borderColor = hasError
        ? '#ef4444'
        : isDarkMode
            ? '#475569'
            : '#cbd5e1';

    const parseDate = (
        dateString?: string | null
    ): Date => {
        if (!dateString) return minDate ?? new Date();

        const parts = dateString.split('-');
        if (parts.length !== 3)
            return minDate ?? new Date();

        const year = Number(parts[0]);
        const month = Number(parts[1]) - 1;
        const day = Number(parts[2]);

        const date = new Date(year, month, day);

        return Number.isNaN(date.getTime())
            ? minDate ?? new Date()
            : date;
    };

    const formatDate = (date: Date): string => {
        const year = date.getFullYear();
        const month = String(
            date.getMonth() + 1
        ).padStart(2, '0');
        const day = String(date.getDate()).padStart(
            2,
            '0'
        );
        return `${year}-${month}-${day}`;
    };

    const formatMinForWeb = (
        min?: Date
    ): string | undefined => {
        if (!min) return undefined;
        const year = min.getFullYear();
        const month = String(
            min.getMonth() + 1
        ).padStart(2, '0');
        const day = String(min.getDate()).padStart(
            2,
            '0'
        );
        return `${year}-${month}-${day}`;
    };

    const openPicker = () => {
        if (Platform.OS === 'android') {
            try {
                DateTimePickerAndroid.open({
                    value: parseDate(value),
                    mode: 'date',
                    minimumDate: minDate,
                    onChange: (
                        event,
                        selectedDate
                    ) => {
                        if (
                            event.type !== 'set' ||
                            !selectedDate
                        )
                            return;
                        if (
                            minDate &&
                            selectedDate.getTime() <
                            minDate.getTime()
                        )
                            return;
                        onChange(
                            formatDate(selectedDate)
                        );
                    },
                });
            } catch (err) {
                console.error(
                    '[DatePicker] Android picker failed:',
                    err
                );
            }
        } else {
            setShowPicker(true);
        }
    };

    /* ---------- WEB ---------- */
    if (Platform.OS === 'web') {
        const minWeb = formatMinForWeb(minDate);

        return (
            <input
                type="date"
                value={value || ''}
                min={minWeb}
                onChange={(event) => {
                    const nextValue =
                        event.target.value || null;
                    if (nextValue && minWeb) {
                        if (nextValue < minWeb) return;
                    }
                    onChange(nextValue);
                }}
                style={{
                    height: 44,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderStyle: 'solid',
                    paddingLeft: 14,
                    paddingRight: 14,
                    backgroundColor,
                    borderColor,
                    color: textColor,
                    fontSize: 14,
                    width: '100%',
                    boxSizing: 'border-box',
                    fontFamily: theme?.font?.medium,
                    outline: 'none',
                }}
            />
        );
    }

    /* ---------- NATIVE ---------- */
    return (
        <View style={{ width: '100%' }}>
            <Pressable
                onPress={openPicker}
                style={{
                    width: '100%',
                    height: 44,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor,
                    backgroundColor,
                    paddingHorizontal: 14,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                }}
            >
                <Text
                    style={{
                        color: value
                            ? textColor
                            : '#94a3b8',
                        fontFamily:
                            theme?.font?.medium,
                        flexShrink: 1,
                    }}
                    className="text-sm font-medium"
                    numberOfLines={1}
                >
                    {value || placeholder}
                </Text>

                <View pointerEvents="none">
                    <Text
                        style={{
                            color: theme?.primary,
                            fontSize: 16,
                            marginLeft: 8,
                        }}
                    >
                        📅
                    </Text>
                </View>
            </Pressable>

            {Platform.OS === 'ios' && showPicker && (
                <>
                    <DateTimePicker
                        value={parseDate(value)}
                        mode="date"
                        display="spinner"
                        minimumDate={minDate}
                        onChange={(
                            event,
                            selectedDate
                        ) => {
                            if (
                                event.type ===
                                'dismissed'
                            )
                                return;
                            if (selectedDate) {
                                if (
                                    minDate &&
                                    selectedDate.getTime() <
                                    minDate.getTime()
                                )
                                    return;
                                onChange(
                                    formatDate(
                                        selectedDate
                                    )
                                );
                            }
                        }}
                    />
                    <Pressable
                        onPress={() =>
                            setShowPicker(false)
                        }
                        style={{
                            marginTop: 8,
                            alignSelf: 'flex-end',
                            paddingHorizontal: 12,
                            paddingVertical: 8,
                            borderRadius: 8,
                            backgroundColor:
                                theme?.primary,
                        }}
                    >
                        <Text
                            style={{
                                color: '#ffffff',
                                fontFamily:
                                    theme?.font?.bold,
                            }}
                            className="text-xs font-bold"
                        >
                            Done
                        </Text>
                    </Pressable>
                </>
            )}
        </View>
    );
}

/* =========================================================
 * Universal Select — with optional search filtering
 * ======================================================= */

interface UniversalSelectProps {
    value?: string | null;
    options: string[];
    onChange: (value: string) => void;
    theme: any;
    isDarkMode: boolean;
    hasError?: boolean;
    placeholder?: string;
    searchable?: boolean;
}

function UniversalSelect({
    value,
    options,
    onChange,
    theme,
    isDarkMode,
    hasError = false,
    placeholder = 'Select...',
    searchable = false,
}: UniversalSelectProps) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');

    const backgroundColor = isDarkMode
        ? '#1e293b'
        : '#f8fafc';
    const dropdownBackground = isDarkMode
        ? '#0f172a'
        : '#ffffff';
    const textColor = theme?.text || '#0f172a';
    const borderColor = hasError
        ? '#ef4444'
        : isDarkMode
            ? '#475569'
            : '#cbd5e1';
    const selectedColor = theme?.primary;

    const filteredOptions = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!searchable || !q) return options;

        return options.filter((option) =>
            option.toLowerCase().includes(q)
        );
    }, [options, query, searchable]);

    useEffect(() => {
        if (!open) setQuery('');
    }, [open]);

    return (
        <View
            className="w-full relative"
            style={{
                zIndex: open ? 9999 : 1,
                elevation: open ? 9999 : 1,
            }}
        >
            <Pressable
                onPress={() =>
                    setOpen((current) => !current)
                }
                className="w-full h-11 rounded-xl border px-3.5 flex-row items-center justify-between"
                style={{
                    backgroundColor,
                    borderColor,
                    borderWidth: 1,
                }}
            >
                <Text
                    numberOfLines={1}
                    style={{
                        color: value
                            ? textColor
                            : '#94a3b8',
                        fontFamily:
                            theme?.font?.medium,
                    }}
                    className="text-sm font-medium flex-1"
                >
                    {value || placeholder}
                </Text>
                <Text
                    style={{
                        color: selectedColor,
                        transform: [
                            {
                                rotate: open
                                    ? '180deg'
                                    : '0deg',
                            },
                        ],
                    }}
                    className="text-base ml-2"
                >
                    ▼
                </Text>
            </Pressable>

            {open && (
                <View
                    className="absolute left-0 right-0 rounded-xl border overflow-hidden"
                    style={{
                        top: 48,
                        backgroundColor:
                            dropdownBackground,
                        borderColor: selectedColor,
                        borderWidth: 1,
                        zIndex: 10000,
                        elevation: 10000,
                        maxHeight: 320,
                    }}
                >
                    {searchable && (
                        <View
                            style={{
                                borderBottomColor:
                                    borderColor,
                                borderBottomWidth: 1,
                                paddingHorizontal: 10,
                                paddingVertical: 8,
                            }}
                        >
                            <TextInput
                                value={query}
                                onChangeText={setQuery}
                                placeholder="Search..."
                                placeholderTextColor={
                                    '#94a3b8'
                                }
                                autoCorrect={false}
                                autoCapitalize="none"
                                style={{
                                    backgroundColor:
                                        isDarkMode
                                            ? '#1e293b'
                                            : '#f1f5f9',
                                    color: textColor,
                                    fontFamily:
                                        theme?.font
                                            ?.medium,
                                    height: 36,
                                    borderRadius: 8,
                                    paddingHorizontal: 10,
                                    fontSize: 13,
                                }}
                            />
                        </View>
                    )}

                    <ScrollView
                        nestedScrollEnabled
                        keyboardShouldPersistTaps="handled"
                        showsVerticalScrollIndicator
                        style={{ maxHeight: 260 }}
                    >
                        {filteredOptions.length === 0 ? (
                            <View
                                style={{
                                    padding: 16,
                                }}
                            >
                                <Text
                                    style={{
                                        color: theme?.textDark,
                                        fontFamily:
                                            theme?.font
                                                ?.medium,
                                    }}
                                    className="text-xs text-center"
                                >
                                    No matches
                                </Text>
                            </View>
                        ) : (
                            filteredOptions.map((option) => {
                                const selected =
                                    option === value;
                                return (
                                    <Pressable
                                        key={option}
                                        onPress={() => {
                                            onChange(option);
                                            setOpen(false);
                                        }}
                                        className="min-h-[44px] px-3.5 flex-row items-center justify-between border-b border-slate-700/10"
                                        style={({
                                            pressed,
                                        }) => ({
                                            backgroundColor:
                                                pressed
                                                    ? isDarkMode
                                                        ? '#1e293b'
                                                        : '#f1f5f9'
                                                    : selected
                                                        ? isDarkMode
                                                            ? '#172554'
                                                            : '#eff6ff'
                                                        : 'transparent',
                                        })}
                                    >
                                        <Text
                                            style={{
                                                color:
                                                    selected
                                                        ? selectedColor
                                                        : textColor,
                                                fontFamily:
                                                    selected
                                                        ? theme
                                                            ?.font
                                                            ?.bold
                                                        : theme
                                                            ?.font
                                                            ?.medium,
                                            }}
                                            className="text-sm"
                                        >
                                            {option}
                                        </Text>
                                        {selected && (
                                            <Text
                                                style={{
                                                    color:
                                                        selectedColor,
                                                }}
                                                className="text-sm font-black"
                                            >
                                                ✓
                                            </Text>
                                        )}
                                    </Pressable>
                                );
                            })
                        )}
                    </ScrollView>
                </View>
            )}
        </View>
    );
}

/* =========================================================
 * Inventory Add Form
 * ======================================================= */

export default function InventoryAddForm({
    formik,
    isDarkMode,
    theme,
    products,
    entities,
}: InventoryAddFormProps) {
    const bg = isDarkMode ? '#1e293b' : '#f8fafc';
    const tc = theme?.text || '#0f172a';

    const [isScanning, setIsScanning] =
        useState(false);
    const [hasPermission, setHasPermission] =
        useState<boolean | null>(null);
    const [scanned, setScanned] = useState(false);

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
            if (
                nav &&
                typeof nav.vibrate === 'function'
            ) {
                try {
                    nav.vibrate(60);
                } catch { }
            }
        } else {
            Vibration.vibrate(60);
        }

        setScanned(true);
        formik.setFieldValue('bar_code', data);
        formik.setFieldTouched(
            'bar_code',
            true,
            false
        );

        setTimeout(() => {
            setIsScanning(false);
            setScanned(false);
        }, 400);
    };

    const bc = (field: string) =>
        formik.errors?.[field] &&
            formik.touched?.[field]
            ? '#ef4444'
            : isDarkMode
                ? '#475569'
                : '#cbd5e1';

    const iSt = {
        backgroundColor: bg,
        color: tc,
        fontFamily: theme?.font?.medium,
    };

    const lSt = {
        color: theme?.textDark,
        fontFamily: theme?.font?.bold,
    };

    const renderError = (field: string) => {
        if (
            !formik.errors?.[field] ||
            !formik.touched?.[field]
        )
            return null;
        return (
            <Text className="text-red-500 text-[10px] pl-1 font-semibold">
                {formik.errors[field]}
            </Text>
        );
    };

    const handleProductSelect = (
        id: string,
        title: string
    ) => {
        formik.setFieldValue('product', id);
        formik.setFieldValue('product_title', title);
    };

    const handleReceivedFromSelect = (
        id: string,
        title: string
    ) => {
        formik.setFieldValue('received_from', id);
        formik.setFieldValue(
            'received_from_title',
            title
        );
    };

    const minExpiryDate = (() => {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        return d;
    })();

    return (
        <ScrollView
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{
                paddingHorizontal: 20,
                paddingTop: 16,
                paddingBottom: 24,
            }}
            style={{
                flexGrow: 0,
                flexShrink: 1,
            }}
            className="w-full"
        >
            <View className="w-full gap-y-4">
                {/* PRODUCT */}
                <View
                    className="w-full"
                    style={{ zIndex: 100 }}
                >
                    <ProductAutocomplete
                        theme={theme}
                        isDarkMode={isDarkMode}
                        selectedValue={
                            formik.values?.product ?? ''
                        }
                        hasError={
                            !!formik.errors?.product &&
                            !!formik.touched?.product
                        }
                        initialTitle={
                            formik.values
                                ?.product_title ?? ''
                        }
                        onSelect={handleProductSelect}
                        zIndexValue={100}
                        products={products}
                    />
                    {renderError('product')}
                </View>

                {/* RECEIVED FROM */}
                <View
                    className="w-full"
                    style={{ zIndex: 90 }}
                >
                    <EntityAutocomplete
                        theme={theme}
                        isDarkMode={isDarkMode}
                        name="received_from"
                        selectedValue={
                            formik.values
                                ?.received_from ?? ''
                        }
                        entityTypes={[
                            'GeneralWholesaler',
                        ]}
                        hasError={
                            !!formik.errors
                                ?.received_from &&
                            !!formik.touched
                                ?.received_from
                        }
                        initialTitle={
                            formik.values
                                ?.received_from_title ?? ''
                        }
                        onSelect={
                            handleReceivedFromSelect
                        }
                        zIndexValue={90}
                        entities={entities}
                    />
                    {renderError('received_from')}
                </View>

                {/* UNIT / QTY / BUY PRICE */}
                <View
                    className="w-full flex-col md:flex-row gap-3 items-start"
                    style={{ zIndex: 50 }}
                >
                    <View
                        className="w-full md:flex-1"
                        style={{ zIndex: 60 }}
                    >
                        <Text
                            style={lSt}
                            className="text-[10px] font-bold uppercase tracking-wider mb-1.5"
                        >
                            Unit of Receipt *
                        </Text>
                        <UniversalSelect
                            value={
                                formik.values
                                    ?.unit_of_receipt ?? ''
                            }
                            options={
                                UNIT_OF_RECEIPT_OPTIONS
                            }
                            onChange={(value) => {
                                formik.setFieldValue(
                                    'unit_of_receipt',
                                    value
                                );
                                formik.setFieldTouched(
                                    'unit_of_receipt',
                                    true,
                                    false
                                );
                            }}
                            theme={theme}
                            isDarkMode={isDarkMode}
                            hasError={
                                !!formik.errors
                                    ?.unit_of_receipt &&
                                !!formik.touched
                                    ?.unit_of_receipt
                            }
                            placeholder="Select unit..."
                            searchable
                        />
                        {renderError('unit_of_receipt')}
                    </View>

                    <View className="w-full md:flex-1">
                        <Text
                            style={lSt}
                            className="text-[10px] font-bold uppercase tracking-wider mb-1.5"
                        >
                            Qty *
                        </Text>
                        <TextInput
                            keyboardType="number-pad"
                            value={
                                formik.values
                                    ?.unit_quantity ?? ''
                            }
                            onChangeText={formik.handleChange(
                                'unit_quantity'
                            )}
                            onBlur={formik.handleBlur(
                                'unit_quantity'
                            )}
                            placeholder="Enter quantity"
                            placeholderTextColor="#94a3b8"
                            className="w-full px-3.5 h-11 rounded-xl border text-sm font-medium"
                            style={{
                                ...iSt,
                                borderColor:
                                    bc('unit_quantity'),
                                borderWidth: 1,
                            }}
                        />
                        {renderError('unit_quantity')}
                    </View>

                    <View className="w-full md:flex-1">
                        <Text
                            style={lSt}
                            className="text-[10px] font-bold uppercase tracking-wider mb-1.5"
                        >
                            Unit Buying Price *
                        </Text>
                        <TextInput
                            keyboardType="decimal-pad"
                            value={
                                formik.values
                                    ?.unit_buying_price ??
                                ''
                            }
                            onChangeText={formik.handleChange(
                                'unit_buying_price'
                            )}
                            onBlur={formik.handleBlur(
                                'unit_buying_price'
                            )}
                            placeholder="0.00"
                            placeholderTextColor="#94a3b8"
                            className="w-full px-3.5 h-11 rounded-xl border text-sm font-medium"
                            style={{
                                ...iSt,
                                borderColor: bc(
                                    'unit_buying_price'
                                ),
                                borderWidth: 1,
                            }}
                        />
                        {renderError(
                            'unit_buying_price'
                        )}
                    </View>
                </View>

                {/* SELL PRICE / BARCODE / BATCH */}
                <View
                    className="w-full flex-col md:flex-row gap-3 items-start"
                    style={{ zIndex: 1 }}
                >
                    <View className="w-full md:flex-1">
                        <Text
                            style={lSt}
                            className="text-[10px] font-bold uppercase tracking-wider mb-1.5"
                        >
                            Unit Selling Price *
                        </Text>
                        <TextInput
                            keyboardType="decimal-pad"
                            value={
                                formik.values
                                    ?.unit_selling_price ??
                                ''
                            }
                            onChangeText={formik.handleChange(
                                'unit_selling_price'
                            )}
                            onBlur={formik.handleBlur(
                                'unit_selling_price'
                            )}
                            placeholder="0.00"
                            placeholderTextColor="#94a3b8"
                            className="w-full px-3.5 h-11 rounded-xl border text-sm font-medium"
                            style={{
                                ...iSt,
                                borderColor: bc(
                                    'unit_selling_price'
                                ),
                                borderWidth: 1,
                            }}
                        />
                        {renderError(
                            'unit_selling_price'
                        )}
                    </View>

                    {/* BARCODE + SCAN */}
                    <View className="w-full md:flex-1">
                        <Text
                            style={lSt}
                            className="text-[10px] font-bold uppercase tracking-wider mb-1.5"
                        >
                            Barcode
                        </Text>

                        <View className="w-full flex-row items-center gap-2">
                            <TextInput
                                value={
                                    formik.values
                                        ?.bar_code ?? ''
                                }
                                onChangeText={formik.handleChange(
                                    'bar_code'
                                )}
                                onBlur={formik.handleBlur(
                                    'bar_code'
                                )}
                                placeholder="Optional barcode..."
                                placeholderTextColor="#94a3b8"
                                className="flex-1 px-3.5 h-11 rounded-xl border text-sm font-medium"
                                style={{
                                    ...iSt,
                                    borderColor:
                                        bc('bar_code'),
                                    borderWidth: 1,
                                }}
                            />

                            <TouchableOpacity
                                onPress={openScanner}
                                activeOpacity={0.7}
                                style={{
                                    backgroundColor:
                                        theme?.primary,
                                    width: 44,
                                    height: 44,
                                    borderRadius: 12,
                                    alignItems: 'center',
                                    justifyContent:
                                        'center',
                                }}
                            >
                                <Text
                                    style={{
                                        color: '#ffffff',
                                        fontSize: 18,
                                    }}
                                >
                                    📷
                                </Text>
                            </TouchableOpacity>
                        </View>

                        {isScanning && (
                            <View className="mt-3">
                                <ScannerViewfinder
                                    isScanning={
                                        isScanning
                                    }
                                    hasPermission={
                                        hasPermission
                                    }
                                    scanned={scanned}
                                    onBarcodeScanned={
                                        handleBarcodeScanned
                                    }
                                    onCancel={
                                        closeScanner
                                    }
                                />
                            </View>
                        )}
                    </View>

                    <View className="w-full md:flex-1">
                        <Text
                            style={lSt}
                            className="text-[10px] font-bold uppercase tracking-wider mb-1.5"
                        >
                            Batch Ref No.
                        </Text>
                        <TextInput
                            value={
                                formik.values?.batch ?? ''
                            }
                            onChangeText={formik.handleChange(
                                'batch'
                            )}
                            onBlur={formik.handleBlur(
                                'batch'
                            )}
                            placeholder="Optional batch code..."
                            placeholderTextColor="#94a3b8"
                            className="w-full px-3.5 h-11 rounded-xl border text-sm font-medium"
                            style={{
                                ...iSt,
                                borderColor: bc('batch'),
                                borderWidth: 1,
                            }}
                        />
                    </View>
                </View>

                {/* DATES */}
                <View
                    className="w-full flex-col md:flex-row gap-3 items-start"
                    style={{ zIndex: 1 }}
                >
                    <View className="w-full md:flex-1">
                        <Text
                            style={lSt}
                            className="text-[10px] font-bold uppercase tracking-wider mb-1.5"
                        >
                            Manufacture Date
                        </Text>
                        <UniversalDatePicker
                            value={
                                formik.values
                                    ?.manufacture_date ??
                                null
                            }
                            onChange={(value) => {
                                formik.setFieldValue(
                                    'manufacture_date',
                                    value
                                );
                                formik.setFieldTouched(
                                    'manufacture_date',
                                    true,
                                    false
                                );
                            }}
                            theme={theme}
                            isDarkMode={isDarkMode}
                            hasError={
                                !!formik.errors
                                    ?.manufacture_date &&
                                !!formik.touched
                                    ?.manufacture_date
                            }
                            placeholder="Select manufacture date..."
                        />
                        {renderError(
                            'manufacture_date'
                        )}
                    </View>

                    <View className="w-full md:flex-1">
                        <Text
                            style={lSt}
                            className="text-[10px] font-bold uppercase tracking-wider mb-1.5"
                        >
                            Expiry Date
                        </Text>
                        <UniversalDatePicker
                            value={
                                formik.values
                                    ?.expiry_date ?? null
                            }
                            onChange={(value) => {
                                formik.setFieldValue(
                                    'expiry_date',
                                    value
                                );
                                formik.setFieldTouched(
                                    'expiry_date',
                                    true,
                                    false
                                );
                            }}
                            theme={theme}
                            isDarkMode={isDarkMode}
                            hasError={
                                !!formik.errors
                                    ?.expiry_date &&
                                !!formik.touched
                                    ?.expiry_date
                            }
                            placeholder="Select expiry date..."
                            minDate={minExpiryDate}
                        />
                        {renderError('expiry_date')}
                    </View>
                </View>
            </View>
        </ScrollView>
    );
}