// components/retailers/stockOuts/PaginationBar.tsx

import { useAuth } from '@/context/AuthContext';
import React, { useState } from 'react';
import {
    Platform,
    Pressable,
    Text,
    View,
} from 'react-native';
import { PAGE_SIZE_OPTIONS, PageSize } from './RetailerOutOfStocksList';

interface PaginationBarProps {
    page: number;
    pageSize: PageSize;
    totalItems: number;
    totalPages: number;
    pageStart: number;
    pageEnd: number;
    onPrev: () => void;
    onNext: () => void;
    onPageSizeChange: (size: PageSize) => void;
}

export function PaginationBar({
    page,
    pageSize,
    totalItems,
    totalPages,
    pageStart,
    pageEnd,
    onPrev,
    onNext,
    onPageSizeChange,
}: PaginationBarProps) {
    const { theme, isDarkMode } = useAuth();

    const borderColor = isDarkMode ? '#334155' : '#e2e8f0';

    const onFirst = page <= 1;
    const onLast = page >= totalPages;

    return (
        <View
            className="mt-4 pt-4 border-t flex-row flex-wrap items-center justify-between gap-3"
            style={{ borderTopColor: borderColor }}
        >
            {/* Left — range + page-size selector */}
            <View className="flex-row flex-wrap items-center gap-3">
                <Text
                    className="uppercase tracking-widest"
                    style={{
                        color: theme.textDark,
                        fontFamily: theme.font.bold,
                        fontSize: theme.fontSize.xs,
                    }}
                >
                    {totalItems === 0
                        ? 'No items'
                        : `Showing ${pageStart + 1}–${pageEnd} of ${totalItems}`}
                </Text>

                <PageSizeSelect
                    value={pageSize}
                    onChange={onPageSizeChange}
                />
            </View>

            {/* Right — prev / page indicator / next */}
            <View className="flex-row items-center gap-2">
                <Pressable
                    onPress={onPrev}
                    disabled={onFirst}
                    className="px-3 py-1.5 rounded-lg border"
                    style={{
                        borderColor,
                        backgroundColor: theme.panel,
                        opacity: onFirst ? 0.4 : 1,
                    }}
                >
                    <Text
                        className="uppercase tracking-wide text-[11px]"
                        style={{
                            color: onFirst
                                ? theme.textDark
                                : theme.text,
                            fontFamily: theme.font.bold,
                        }}
                    >
                        ◀ Prev
                    </Text>
                </Pressable>

                <View className="px-3 py-1.5">
                    <Text
                        className="uppercase tracking-widest"
                        style={{
                            color: theme.text,
                            fontFamily: theme.font.bold,
                            fontSize: theme.fontSize.xs,
                        }}
                    >
                        Page {page} of {totalPages}
                    </Text>
                </View>

                <Pressable
                    onPress={onNext}
                    disabled={onLast}
                    className="px-3 py-1.5 rounded-lg border"
                    style={{
                        borderColor,
                        backgroundColor: theme.panel,
                        opacity: onLast ? 0.4 : 1,
                    }}
                >
                    <Text
                        className="uppercase tracking-wide text-[11px]"
                        style={{
                            color: onLast
                                ? theme.textDark
                                : theme.text,
                            fontFamily: theme.font.bold,
                        }}
                    >
                        Next ▶
                    </Text>
                </Pressable>
            </View>
        </View>
    );
}

/* =========================================================
 * Page size selector
 * Native <select> on web, popup menu on native.
 * ======================================================= */
function PageSizeSelect({
    value,
    onChange,
}: {
    value: PageSize;
    onChange: (size: PageSize) => void;
}) {
    const { theme, isDarkMode } = useAuth();
    const [open, setOpen] = useState(false);

    const borderColor = isDarkMode ? '#334155' : '#e2e8f0';
    const bg = isDarkMode ? '#0f172a' : '#f8fafc';

    /* ---------- Web: native <select> ---------- */
    if (Platform.OS === 'web') {
        return (
            <View className="flex-row items-center gap-2">
                <Text
                    className="uppercase tracking-widest"
                    style={{
                        color: theme.textDark,
                        fontFamily: theme.font.bold,
                        fontSize: theme.fontSize.xs,
                    }}
                >
                    Rows
                </Text>
                <select
                    value={value}
                    onChange={(e) =>
                        onChange(
                            Number(
                                e.target.value
                            ) as PageSize
                        )
                    }
                    style={{
                        height: 30,
                        paddingLeft: 8,
                        paddingRight: 8,
                        fontFamily: theme.font.medium,
                        fontSize: theme.fontSize.sm,
                        borderRadius: 8,
                        borderColor,
                        backgroundColor: bg,
                        color: theme.text,
                        borderStyle: 'solid',
                        borderWidth: 1,
                        outline: 'none',
                    }}
                >
                    {PAGE_SIZE_OPTIONS.map((n) => (
                        <option key={n} value={n}>
                            {n}
                        </option>
                    ))}
                </select>
            </View>
        );
    }

    /* ---------- Native: popup ---------- */
    return (
        <View className="flex-row items-center gap-2">
            <Text
                className="uppercase tracking-widest"
                style={{
                    color: theme.textDark,
                    fontFamily: theme.font.bold,
                    fontSize: theme.fontSize.xs,
                }}
            >
                Rows
            </Text>

            <View style={{ position: 'relative' }}>
                <Pressable
                    onPress={() => setOpen((v) => !v)}
                    className="px-3 py-1.5 rounded-lg border flex-row items-center gap-2"
                    style={{
                        borderColor,
                        backgroundColor: bg,
                    }}
                >
                    <Text
                        className="text-[12px]"
                        style={{
                            color: theme.text,
                            fontFamily: theme.font.bold,
                        }}
                    >
                        {value}
                    </Text>
                    <Text
                        style={{ color: theme.textDark }}
                    >
                        {open ? '▲' : '▼'}
                    </Text>
                </Pressable>

                {open ? (
                    <View
                        className="absolute rounded-lg border overflow-hidden"
                        style={{
                            top: 38,
                            right: 0,
                            minWidth: 80,
                            borderColor,
                            backgroundColor: theme.panel,
                            zIndex: 500,
                            elevation: 500,
                        }}
                    >
                        {PAGE_SIZE_OPTIONS.map((n) => {
                            const sel = n === value;
                            return (
                                <Pressable
                                    key={n}
                                    onPress={() => {
                                        onChange(n);
                                        setOpen(false);
                                    }}
                                    className="px-3 py-2"
                                    style={{
                                        backgroundColor: sel
                                            ? `${theme.primary}15`
                                            : 'transparent',
                                    }}
                                >
                                    <Text
                                        className="text-[13px]"
                                        style={{
                                            color: sel
                                                ? theme.primary
                                                : theme.text,
                                            fontFamily: sel
                                                ? theme.font.bold
                                                : theme.font.medium,
                                        }}
                                    >
                                        {n}
                                    </Text>
                                </Pressable>
                            );
                        })}
                    </View>
                ) : null}
            </View>
        </View>
    );
}