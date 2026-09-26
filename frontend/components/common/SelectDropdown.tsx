// components/common/SelectDropdown.tsx
//
// Universal single-select dropdown.
// - Native: inline dropdown, elevation 24
// - Web: portal into document.body so nothing can paint over it
// - Formik-aware via `name`
// - Opaque background
// - NativeWind layout, useAuth() colors

import { useAuth } from '@/context/AuthContext';
import { useFormikContext } from 'formik';
import React, {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import {
    Platform,
    Pressable,
    ScrollView,
    Text,
    View,
    type StyleProp,
    type ViewStyle,
} from 'react-native';

/* ---- Web-only portal (safe require) ---- */
let ReactDOM: any = null;
if (Platform.OS === 'web') {
    try {
        ReactDOM = require('react-dom');
    } catch {
        ReactDOM = null;
    }
}

/* =========================================================
 * Types
 * ======================================================= */
export interface SelectOption {
    value: string;
    label?: string;
    description?: string;
    disabled?: boolean;
}

export interface SelectDropdownProps {
    options: SelectOption[];
    name?: string;
    transform?: (v: string) => any;
    value?: string;
    onChange?: (v: string) => void;
    error?: string;
    label?: string;
    placeholder?: string;
    helperText?: string;
    required?: boolean;
    disabled?: boolean;
    maxHeight?: number;
    style?: StyleProp<ViewStyle>;
    testID?: string;
}

/* =========================================================
 * Component
 * ======================================================= */
export function SelectDropdown({
    options,
    name,
    transform,
    value: controlledValue,
    onChange: controlledOnChange,
    error: controlledError,
    label,
    placeholder = 'Select…',
    helperText,
    required,
    disabled,
    maxHeight = 200,
    style,
    testID,
}: SelectDropdownProps) {
    const { theme, isDarkMode } = useAuth();
    const formik = useFormikContext<any>();
    const isFormik = !!name && !!formik;

    const value: string = isFormik
        ? ((formik.values?.[name!] as string) ?? '')
        : controlledValue ?? '';

    const fieldError: string | undefined = isFormik
        ? formik.touched?.[name!] && formik.errors?.[name!]
            ? String(formik.errors[name!])
            : undefined
        : controlledError;

    const selectedOption = useMemo(
        () => options.find((o) => o.value === value) ?? null,
        [options, value]
    );

    const displayLabel =
        selectedOption?.label ?? selectedOption?.value ?? '';

    /* -------- Theme tokens -------- */
    const danger = '#ef4444';
    const borderColor = fieldError
        ? danger
        : isDarkMode
            ? '#475569'
            : '#cbd5e1';
    const inputBg = isDarkMode ? '#1e293b' : '#f8fafc';
    const dropdownBg = isDarkMode ? '#0f172a' : '#ffffff';
    const dropdownBorder = isDarkMode ? '#334155' : '#cbd5e1';
    const hoverBg = isDarkMode ? '#1e293b' : '#f1f5f9';
    const dividerColor = isDarkMode
        ? 'rgba(51,65,85,0.6)'
        : '#e2e8f0';

    /* -------- State -------- */
    const [open, setOpen] = useState(false);
    const [anchor, setAnchor] = useState({
        x: 0,
        y: 0,
        width: 0,
    });

    const triggerRef = useRef<any>(null);
    const menuRef = useRef<HTMLDivElement | null>(null);

    /* -------- Measure trigger (web) -------- */
    const measure = useCallback(() => {
        if (Platform.OS !== 'web') return;
        const node: any = triggerRef.current;
        if (!node) return;

        const el: HTMLElement | null =
            (typeof node.getScrollableNode === 'function'
                ? node.getScrollableNode()
                : null) ??
            (typeof node.getNode === 'function'
                ? node.getNode()
                : null) ??
            (node instanceof HTMLElement ? node : null);

        if (!el || typeof el.getBoundingClientRect !== 'function')
            return;

        const r = el.getBoundingClientRect();
        setAnchor({
            x: r.left,
            y: r.bottom,
            width: r.width,
        });
    }, []);

    const toggle = () => {
        if (disabled) return;
        if (open) {
            setOpen(false);
        } else {
            measure();
            setOpen(true);
            // re-measure after layout settles
            requestAnimationFrame(measure);
        }
    };

    /* -------- Re-measure while open (web) -------- */
    useEffect(() => {
        if (Platform.OS !== 'web' || !open) return;
        const handler = () => measure();
        window.addEventListener('scroll', handler, true);
        window.addEventListener('resize', handler);
        return () => {
            window.removeEventListener('scroll', handler, true);
            window.removeEventListener('resize', handler);
        };
    }, [open, measure]);

    /* -------- Value writer -------- */
    const setValue = (next: string) => {
        const v = transform ? transform(next) : next;
        if (isFormik) {
            formik.setFieldValue(name!, v);
            formik.setFieldTouched(name!, true, false);
        } else {
            controlledOnChange?.(next);
        }
    };

    const select = (opt: SelectOption) => {
        if (opt.disabled) return;
        setValue(opt.value);
        setOpen(false);
    };

    /* -------- Click outside closes (web) -------- */
    useEffect(() => {
        if (Platform.OS !== 'web' || !open) return;
        if (typeof document === 'undefined') return;

        const onDown = (ev: MouseEvent) => {
            const node: any = triggerRef.current;
            const triggerEl: HTMLElement | null =
                (typeof node?.getScrollableNode === 'function'
                    ? node.getScrollableNode()
                    : null) ??
                (typeof node?.getNode === 'function'
                    ? node.getNode()
                    : null);
            const target = ev.target as Node;
            const insideTrigger = triggerEl?.contains(target);
            const insideMenu = menuRef.current?.contains(target);
            if (!insideTrigger && !insideMenu) setOpen(false);
        };
        document.addEventListener('mousedown', onDown);
        return () =>
            document.removeEventListener('mousedown', onDown);
    }, [open]);

    /* =========================================================
     * Menu content — shared
     * ======================================================= */
    const MenuContent = (
        <View
            className="rounded-xl border overflow-hidden"
            style={{
                maxHeight,
                backgroundColor: dropdownBg,
                borderColor: dropdownBorder,
                ...(Platform.OS === 'web'
                    ? ({
                        boxShadow:
                            '0 12px 32px rgba(0,0,0,0.22), 0 2px 6px rgba(0,0,0,0.1)',
                    } as any)
                    : {
                        elevation: 24,
                        shadowColor: '#000',
                        shadowOpacity: 0.25,
                        shadowRadius: 16,
                        shadowOffset: { width: 0, height: 8 },
                    }),
            }}
        >
            <ScrollView
                keyboardShouldPersistTaps="handled"
                style={{ backgroundColor: dropdownBg }}
            >
                {options.length === 0 ? (
                    <View className="py-5 px-4 items-center">
                        <Text
                            className="text-xs"
                            style={{
                                color: theme.textDark,
                                fontFamily: theme.font.medium,
                            }}
                        >
                            No options available
                        </Text>
                    </View>
                ) : (
                    options.map((opt) => (
                        <OptionRow
                            key={opt.value}
                            option={opt}
                            active={opt.value === value}
                            disabledRow={!!opt.disabled}
                            hoverBg={hoverBg}
                            dividerColor={dividerColor}
                            opaqueBg={dropdownBg}
                            primary={theme.primary}
                            onPress={() => select(opt)}
                        />
                    ))
                )}
            </ScrollView>
        </View>
    );

    /* =========================================================
     * Portal (web only)
     * ======================================================= */
    let portal: any = null;
    if (
        Platform.OS === 'web' &&
        open &&
        !disabled &&
        ReactDOM &&
        typeof document !== 'undefined' &&
        anchor.width > 0
    ) {
        portal = ReactDOM.createPortal(
            <div
                ref={(el: HTMLDivElement | null) => {
                    menuRef.current = el;
                }}
                style={{
                    position: 'fixed',
                    top: anchor.y + 4,
                    left: anchor.x,
                    width: anchor.width,
                    // Max 32-bit signed int; nothing in the app can beat it
                    zIndex: 2147483647,
                    // Own stacking context so nothing paints over
                    isolation: 'isolate',
                }}
            >
                {MenuContent}
            </div>,
            document.body
        );
    }

    /* =========================================================
     * Render
     * ======================================================= */
    return (
        <>
            <View
                testID={testID}
                className="w-full relative"
                style={style}
            >
                {/* Label */}
                {label ? (
                    <View className="flex-row items-center mb-1.5">
                        <Text
                            className="uppercase tracking-wider text-[10px] font-bold"
                            style={{
                                color: theme.textDark,
                                fontFamily: theme.font.bold,
                            }}
                        >
                            {label}
                        </Text>
                        {required ? (
                            <Text
                                className="text-[10px] ml-1 font-bold"
                                style={{
                                    color: danger,
                                    fontFamily: theme.font.bold,
                                }}
                            >
                                *
                            </Text>
                        ) : null}
                    </View>
                ) : null}

                {/* Trigger */}
                <Pressable
                    ref={triggerRef as any}
                    onPress={toggle}
                    className="w-full px-3.5 h-11 rounded-xl border flex-row justify-between items-center"
                    style={{
                        backgroundColor: inputBg,
                        borderColor,
                        opacity: disabled ? 0.55 : 1,
                    }}
                >
                    <Text
                        className="text-sm flex-1"
                        numberOfLines={1}
                        style={{
                            color: displayLabel
                                ? theme.text
                                : '#94a3b8',
                            fontFamily: theme.font.medium,
                        }}
                    >
                        {displayLabel || placeholder}
                    </Text>
                    <Text
                        className="text-[10px] ml-2"
                        style={{ color: theme.textDark }}
                    >
                        {open ? '▲' : '▼'}
                    </Text>
                </Pressable>

                {/* Native-only inline menu */}
                {Platform.OS !== 'web' && open && !disabled ? (
                    <View
                        className="absolute left-0 right-0 top-[68px]"
                        style={{ zIndex: 9999 }}
                    >
                        {MenuContent}
                    </View>
                ) : null}

                {/* Error / helper */}
                {fieldError ? (
                    <Text
                        className="text-[10px] pl-1 mt-1 font-bold"
                        style={{
                            color: danger,
                            fontFamily: theme.font.bold,
                        }}
                    >
                        {fieldError}
                    </Text>
                ) : helperText ? (
                    <Text
                        className="text-[10px] pl-1 mt-1"
                        style={{
                            color: theme.textDark,
                            fontFamily: theme.font.medium,
                            opacity: 0.75,
                        }}
                    >
                        {helperText}
                    </Text>
                ) : null}
            </View>

            {portal}
        </>
    );
}

/* =========================================================
 * Option row
 * ======================================================= */
function OptionRow({
    option,
    active,
    disabledRow,
    hoverBg,
    dividerColor,
    opaqueBg,
    primary,
    onPress,
}: {
    option: SelectOption;
    active: boolean;
    disabledRow: boolean;
    hoverBg: string;
    dividerColor: string;
    opaqueBg: string;
    primary: string;
    onPress: () => void;
}) {
    const { theme } = useAuth();
    const [hovered, setHovered] = useState(false);
    const [pressed, setPressed] = useState(false);

    const highlighted = (hovered || pressed) && !disabledRow;

    const rowBg = active
        ? primary
        : highlighted
            ? hoverBg
            : opaqueBg;

    return (
        <Pressable
            onPress={onPress}
            onPressIn={() => setPressed(true)}
            onPressOut={() => setPressed(false)}
            onHoverIn={
                Platform.OS === 'web'
                    ? () => setHovered(true)
                    : undefined
            }
            onHoverOut={
                Platform.OS === 'web'
                    ? () => setHovered(false)
                    : undefined
            }
            className="w-full px-3 py-2.5 border-b flex-row items-center justify-between"
            style={{
                borderBottomColor: dividerColor,
                backgroundColor: rowBg,
                opacity: disabledRow ? 0.5 : 1,
            }}
        >
            <View className="flex-1 min-w-0">
                <Text
                    className="text-xs font-bold"
                    numberOfLines={1}
                    style={{
                        color: active ? '#ffffff' : theme.text,
                        fontFamily: theme.font.bold,
                    }}
                >
                    {option.label ?? option.value}
                </Text>
                {option.description ? (
                    <Text
                        className="text-[10px] mt-[1px]"
                        numberOfLines={1}
                        style={{
                            color: active
                                ? 'rgba(255,255,255,0.85)'
                                : theme.textDark,
                            fontFamily: theme.font.medium,
                        }}
                    >
                        {option.description}
                    </Text>
                ) : null}
            </View>
            {active ? (
                <Text className="ml-2 text-[11px] text-white">
                    ✓
                </Text>
            ) : null}
        </Pressable>
    );
}