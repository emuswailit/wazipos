// components/common/Exportable.tsx
//
// Universal export module — Excel and PDF, web and native.
//
// Public API:
//   exportToExcel(options)          — fire-and-forget helper
//   exportToPdf(options)            — fire-and-forget helper
//   useExport()                     — hook managing per-format state
//   <ExportButtons />               — drop-in UI for any header
//
// Install:
//   npx expo install expo-print expo-sharing expo-file-system
//   npm install xlsx

import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import React, { useCallback, useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import * as XLSX from 'xlsx';

import { useAlert } from '@/components/common/AlertProvider';
import { useAuth } from '@/context/AuthContext';

/* =========================================================
 * Types
 * ======================================================= */

export type SheetRow = (string | number | null | undefined)[];

export interface SheetSpec {
    name: string;
    rows: SheetRow[];
    columnWidths?: number[];
}

interface ExcelExportOptions {
    sheets: SheetSpec[];
    filename: string;
}

interface PdfExportOptions {
    html: string;
    filename: string;
}

type ExportKind = 'excel' | 'pdf';

/* =========================================================
 * Constants
 * ======================================================= */

const XLSX_MIME =
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const PDF_MIME = 'application/pdf';

/* =========================================================
 * Excel
 * ======================================================= */

function buildWorksheet(spec: SheetSpec): XLSX.WorkSheet {
    const ws = XLSX.utils.aoa_to_sheet(spec.rows as any[][]);

    const widths =
        spec.columnWidths ??
        (() => {
            const w: number[] = [];
            spec.rows.forEach((row) => {
                row.forEach((cell, i) => {
                    const len = String(cell ?? '').length;
                    w[i] = Math.max(w[i] ?? 8, Math.min(len + 2, 40));
                });
            });
            return w;
        })();

    ws['!cols'] = widths.map((w) => ({ wch: w }));
    return ws;
}

function buildWorkbook(options: ExcelExportOptions): XLSX.WorkBook {
    const wb = XLSX.utils.book_new();
    for (const spec of options.sheets) {
        XLSX.utils.book_append_sheet(wb, buildWorksheet(spec), spec.name);
    }
    return wb;
}

async function exportToExcel(
    options: ExcelExportOptions,
): Promise<{ uri?: string }> {
    const wb = buildWorkbook(options);

    if (Platform.OS === 'web') {
        XLSX.writeFile(wb, options.filename, { bookType: 'xlsx' });
        return {};
    }

    const base64 = XLSX.write(wb, {
        type: 'base64',
        bookType: 'xlsx',
    });

    const uri = `${FileSystem.cacheDirectory}${options.filename}`;
    await FileSystem.writeAsStringAsync(uri, base64, {
        encoding: FileSystem.EncodingType.Base64,
    });

    if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
            mimeType: XLSX_MIME,
            dialogTitle: options.filename,
            UTI: 'com.microsoft.excel.xlsx',
        });
    }

    return { uri };
}

/* =========================================================
 * PDF
 * ======================================================= */

async function exportToPdf(
    options: PdfExportOptions,
): Promise<{ uri?: string }> {
    if (Platform.OS === 'web') {
        await Print.printAsync({ html: options.html });
        return {};
    }

    const { uri } = await Print.printToFileAsync({ html: options.html });

    const target = `${FileSystem.cacheDirectory}${options.filename}`;
    try {
        await FileSystem.deleteAsync(target, { idempotent: true });
        await FileSystem.moveAsync({ from: uri, to: target });
    } catch {
        if (await Sharing.isAvailableAsync()) {
            await Sharing.shareAsync(uri, {
                mimeType: PDF_MIME,
                dialogTitle: options.filename,
                UTI: 'com.adobe.pdf',
            });
        }
        return { uri };
    }

    if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(target, {
            mimeType: PDF_MIME,
            dialogTitle: options.filename,
            UTI: 'com.adobe.pdf',
        });
    }

    return { uri: target };
}

/* =========================================================
 * Hook
 * ======================================================= */

interface UseExportResult {
    exporting: ExportKind | null;
    excel: (options: ExcelExportOptions) => Promise<void>;
    pdf: (options: PdfExportOptions) => Promise<void>;
}

function useExport(): UseExportResult {
    const [exporting, setExporting] = useState<ExportKind | null>(null);

    const excel = useCallback(async (options: ExcelExportOptions) => {
        setExporting('excel');
        try {
            await exportToExcel(options);
        } finally {
            setExporting(null);
        }
    }, []);

    const pdf = useCallback(async (options: PdfExportOptions) => {
        setExporting('pdf');
        try {
            await exportToPdf(options);
        } finally {
            setExporting(null);
        }
    }, []);

    return { exporting, excel, pdf };
}

/* =========================================================
 * ExportButtons — drop-in UI
 * ======================================================= */

interface ExportButtonsProps {
    /** When false, both buttons are disabled. */
    enabled?: boolean;
    /** Visual variant. Defaults to "inline". */
    variant?: 'inline' | 'primary';
    /** Button height in px. Defaults to 38. */
    height?: number;
    /** Show a thin divider between the two buttons. */
    showDivider?: boolean;
    /** Override error handling. Defaults to useAlert(). */
    onError?: (message: string) => void;
    /** Called at click time — build options from current screen state. */
    getExcel: () => ExcelExportOptions;
    getPdf: () => PdfExportOptions;
}

export function ExportButtons({
    enabled = true,
    variant = 'inline',
    height = 38,
    showDivider = false,
    onError,
    getExcel,
    getPdf,
}: ExportButtonsProps) {
    const { theme, isDarkMode } = useAuth();
    const alert = useAlert();
    const { exporting, excel, pdf } = useExport();

    const canClick = enabled && exporting === null;

    const handleError = useCallback(
        (err: any, fallback: string) => {
            const message = err?.message ?? fallback;
            // eslint-disable-next-line no-console
            console.warn('[ExportButtons] export failed:', err);
            if (onError) {
                onError(message);
            } else {
                alert('Export failed', message, [{ text: 'OK' }], 'danger');
            }
        },
        [alert, onError],
    );

    const onExcel = useCallback(async () => {
        if (!canClick) return;
        try {
            await excel(getExcel());
        } catch (e: any) {
            handleError(e, 'Could not export Excel.');
        }
    }, [canClick, excel, getExcel, handleError]);

    const onPdf = useCallback(async () => {
        if (!canClick) return;
        try {
            await pdf(getPdf());
        } catch (e: any) {
            handleError(e, 'Could not export PDF.');
        }
    }, [canClick, pdf, getPdf, handleError]);

    const buttonBg = isDarkMode
        ? 'rgba(148, 163, 184, 0.10)'
        : 'rgba(100, 116, 139, 0.06)';

    const borderStroke = canClick
        ? theme.primary + '55'
        : theme.textDark + '22';

    const buttonStyle = (): any => ({
        paddingHorizontal: variant === 'primary' ? 16 : 12,
        height,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: canClick ? buttonBg : 'transparent',
        borderWidth: 1,
        borderColor: borderStroke,
        opacity: canClick ? 1 : 0.45,
        ...(Platform.OS === 'web'
            ? ({
                cursor: canClick ? 'pointer' : 'not-allowed',
                transition: 'background-color 120ms ease',
            } as any)
            : null),
    });

    const labelStyle = {
        color: canClick ? theme.primary : theme.textDark,
        fontFamily: theme.font.bold,
        fontSize: 10,
        letterSpacing: 0.8,
        textTransform: 'uppercase' as const,
    };

    return (
        <View className="flex-row items-center" style={{ gap: 8 }}>
            <Pressable
                onPress={onExcel}
                disabled={!canClick}
                accessibilityRole="button"
                accessibilityLabel="Export to Excel"
                accessibilityState={{ disabled: !canClick }}
                style={buttonStyle()}
            >
                <Text style={labelStyle}>
                    {exporting === 'excel' ? '...' : 'Excel'}
                </Text>
            </Pressable>

            {showDivider ? (
                <View
                    style={{
                        width: 1,
                        height: Math.max(20, height - 14),
                        backgroundColor: theme.textDark + '22',
                    }}
                />
            ) : null}

            <Pressable
                onPress={onPdf}
                disabled={!canClick}
                accessibilityRole="button"
                accessibilityLabel="Export to PDF"
                accessibilityState={{ disabled: !canClick }}
                style={buttonStyle()}
            >
                <Text style={labelStyle}>
                    {exporting === 'pdf' ? '...' : 'PDF'}
                </Text>
            </Pressable>
        </View>
    );
}