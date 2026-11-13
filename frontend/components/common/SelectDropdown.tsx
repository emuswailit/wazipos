// components/common/SelectDropdown.tsx
import { useAuth } from '@/context/AuthContext';
import { useFormikContext } from 'formik';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Platform,
    Pressable,
    ScrollView,
    Text,
    View,
    type StyleProp,
    type ViewStyle,
} from 'react-native';

let ReactDOM: any = null;
if (Platform.OS === 'web') {
    try { ReactDOM = require('react-dom'); } catch { ReactDOM = null; }
}

export interface SelectOption {
    value: string;
    label?: string;
    description?: string;
    disabled?: boolean;
}

interface SelectDropdownProps {
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

export function SelectDropdown({
    options, name, transform, value: controlledValue, onChange: controlledOnChange, error: controlledError,
    label, placeholder = 'Select…', helperText, required, disabled, maxHeight = 200, style, testID,
}: SelectDropdownProps) {
    const { theme, isDarkMode } = useAuth();
    const formik = useFormikContext<any>();
    const isFormik = !!name && !!formik;

    const value: string = isFormik ? ((formik.values?.[name!] as string) ?? '') : controlledValue ?? '';
    const fieldError: string | undefined = isFormik
        ? formik.touched?.[name!] && formik.errors?.[name!] ? String(formik.errors[name!]) : undefined
        : controlledError;

    const selectedOption = useMemo(() => options.find((o) => o.value === value) ?? null, [options, value]);
    const displayLabel = selectedOption?.label ?? selectedOption?.value ?? '';

    const danger = '#ef4444';
    const borderColor = fieldError ? danger : isDarkMode ? 'rgba(148,163,184,0.18)' : 'rgba(15,23,42,0.10)';
    const inputBg = isDarkMode ? '#0f172a' : theme.surface;
    const dropdownBg = isDarkMode ? '#0f172a' : '#ffffff';
    const dropdownBorder = isDarkMode ? '#334155' : '#cbd5e1';
    const hoverBg = isDarkMode ? '#1e293b' : '#f1f5f9';
    const dividerColor = isDarkMode ? 'rgba(51,65,85,0.6)' : '#e2e8f0';

    const [open, setOpen] = useState(false);
    const [anchor, setAnchor] = useState({ x: 0, y: 0, width: 0 });

    const triggerRef = useRef<any>(null);
    const menuRef = useRef<HTMLDivElement | null>(null);

    const measure = useCallback(() => {
        if (Platform.OS !== 'web') return;
        const node: any = triggerRef.current;
        if (!node) return;
        const el: HTMLElement | null =
            (typeof node.getScrollableNode === 'function' ? node.getScrollableNode() : null) ??
            (typeof node.getNode === 'function' ? node.getNode() : null) ??
            (node instanceof HTMLElement ? node : null);
        if (!el || typeof el.getBoundingClientRect !== 'function') return;
        const r = el.getBoundingClientRect();
        setAnchor({ x: r.left, y: r.bottom, width: r.width });
    }, []);

    const toggle = () => {
        if (disabled) return;
        if (open) {
            setOpen(false);
        } else {
            measure();
            setOpen(true);
            requestAnimationFrame(measure);
        }
    };

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

    useEffect(() => {
        if (Platform.OS !== 'web' || !open) return;
        if (typeof document === 'undefined') return;
        const onDown = (ev: MouseEvent) => {
            const node: any = triggerRef.current;
            const triggerEl: HTMLElement | null =
                (typeof node?.getScrollableNode === 'function' ? node.getScrollableNode() : null) ??
                (typeof node?.getNode === 'function' ? node.getNode() : null);
            const target = ev.target as Node;
            const insideTrigger = triggerEl?.contains(target);
            const insideMenu = menuRef.current?.contains(target);
            if (!insideTrigger && !insideMenu) setOpen(false);
        };
        document.addEventListener('mousedown', onDown);
        return () => document.removeEventListener('mousedown', onDown);
    }, [open]);

    const MenuContent = (
        <View
            className="rounded-lg border overflow-hidden"
            style={{
                maxHeight, backgroundColor: dropdownBg, borderColor: dropdownBorder,
                ...(Platform.OS === 'web'
                    ? ({ boxShadow: '0 12px 32px rgba(0,0,0,0.22), 0 2px 6px rgba(0,0,0,0.1)' } as any)
                    : { elevation: 24, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 16, shadowOffset: { width: 0, height: 8 } }),
            }}
        >
            <ScrollView keyboardShouldPersistTaps="handled" style={{ backgroundColor: dropdownBg }}>
                {options.length === 0 ? (
                    <View className="py-4 px-3 items-center">
                        <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12 }}>
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

    let portal: any = null;
    if (Platform.OS === 'web' && open && !disabled && ReactDOM && typeof document !== 'undefined' && anchor.width > 0) {
        portal = ReactDOM.createPortal(
            <div
                ref={(el: HTMLDivElement | null) => { menuRef.current = el; }}
                style={{ position: 'fixed', top: anchor.y + 4, left: anchor.x, width: anchor.width, zIndex: 2147483647, isolation: 'isolate' }}
            >
                {MenuContent}
            </div>,
            document.body
        );
    }

    return (
        <>
            <View testID={testID} className="w-full relative" style={style}>
                {label ? (
                    <View className="flex-row items-center mb-1">
                        <Text
                            style={{
                                color: theme.textDark,
                                fontFamily: theme.font.bold,
                                fontSize: 10,
                                letterSpacing: 0.5,
                                textTransform: 'uppercase',
                                paddingHorizontal: 2
                            }}
                        >
                            {label}
                        </Text>
                        {required ? (
                            <Text style={{ color: danger, fontFamily: theme.font.bold, fontSize: 10, marginLeft: 4 }}>
                                *
                            </Text>
                        ) : null}
                    </View>
                ) : null}

                <Pressable
                    ref={triggerRef as any}
                    onPress={toggle}
                    className="w-full px-[10px] rounded-lg border flex-row justify-between items-center"
                    style={{
                        backgroundColor: inputBg,
                        borderColor,
                        opacity: disabled ? 0.55 : 1,
                        minHeight: 38,
                        height: 38
                    }}
                >
                    <Text
                        className="flex-1"
                        numberOfLines={1}
                        style={{
                            color: displayLabel ? theme.text : '#94a3b8',
                            fontFamily: theme.font.medium,
                            fontSize: 12
                        }}
                    >
                        {displayLabel || placeholder}
                    </Text>
                    <Text style={{ color: theme.textDark, fontSize: 10, marginLeft: 8 }}>
                        {open ? '▲' : '▼'}
                    </Text>
                </Pressable>

                {Platform.OS !== 'web' && open && !disabled ? (
                    <View className="absolute left-0 right-0 top-[42px]" style={{ zIndex: 9999 }}>
                        {MenuContent}
                    </View>
                ) : null}

                {fieldError ? (
                    <Text style={{ color: danger, fontFamily: theme.font.bold, fontSize: 10, paddingLeft: 2, marginTop: 4 }}>
                        {fieldError}
                    </Text>
                ) : helperText ? (
                    <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 10, paddingLeft: 2, marginTop: 4, opacity: 0.75 }}>
                        {helperText}
                    </Text>
                ) : null}
            </View>
            {portal}
        </>
    );
}

function OptionRow({ option, active, disabledRow, hoverBg, dividerColor, opaqueBg, primary, onPress }: any) {
    const { theme } = useAuth();
    const [hovered, setHovered] = useState(false);
    const [pressed, setPressed] = useState(false);

    const highlighted = (hovered || pressed) && !disabledRow;
    const rowBg = active ? primary : highlighted ? hoverBg : opaqueBg;

    return (
        <Pressable
            onPress={onPress}
            onPressIn={() => setPressed(true)}
            onPressOut={() => setPressed(false)}
            onHoverIn={Platform.OS === 'web' ? () => setHovered(true) : undefined}
            onHoverOut={Platform.OS === 'web' ? () => setHovered(false) : undefined}
            className="w-full px-3 py-2 border-b flex-row items-center justify-between"
            style={{ borderBottomColor: dividerColor, backgroundColor: rowBg, opacity: disabledRow ? 0.5 : 1 }}
        >
            <View className="flex-1 min-w-0">
                <Text
                    numberOfLines={1}
                    style={{
                        color: active ? '#ffffff' : theme.text,
                        fontFamily: theme.font.medium, // 🌟 Removed bold
                        fontSize: 12
                    }}
                >
                    {option.label ?? option.value}
                </Text>
                {option.description ? (
                    <Text
                        numberOfLines={1}
                        style={{
                            color: active ? 'rgba(255,255,255,0.85)' : theme.textDark,
                            fontFamily: theme.font.medium,
                            fontSize: 10,
                            marginTop: 1
                        }}
                    >
                        {option.description}
                    </Text>
                ) : null}
            </View>
            {active ? (
                <Text style={{ marginLeft: 8, fontSize: 10, color: '#ffffff' }}>✓</Text>
            ) : null}
        </Pressable>
    );
}