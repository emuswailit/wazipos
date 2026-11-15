// utils/parts.ts
//
// "Sold in parts": products that sell as whole units AND in parts — a bottle
// or a tot, a 50 kg sack or 2.5 kg, a tray or 6 eggs. Mirrors the backend
// (backend/products/units.py): stock is whole sealed units + what's left in
// the opened unit (open_content, in base units ml / g / pieces).

export type SaleUnit = 'FULL' | 'PART';
export type Measure = 'VOLUME' | 'MASS' | 'COUNT';

/** Server breakdown on receipts / supplies (`parts` field). */
export interface PartsInfo {
    sold_in_parts: boolean;
    measure?: Measure | null;
    content_per_unit?: string | null;
    part_size?: string | null;
    part_label?: string | null;
    parts_per_unit?: string | null;
    unit_label?: string;
    full_units?: number;
    open_parts?: string;
    total_parts?: string | null;
    label?: string;
}

export const MEASURE_OPTIONS: { value: Measure; label: string }[] = [
    { value: 'VOLUME', label: 'Volume' },
    { value: 'MASS', label: 'Weight' },
    { value: 'COUNT', label: 'Count' },
];

/** Friendly units per measure (factor = base units per 1). */
export const UNITS: Record<Measure, { value: string; label: string; factor: number }[]> = {
    VOLUME: [
        { value: 'ml', label: 'ml', factor: 1 },
        { value: 'cl', label: 'cl', factor: 10 },
        { value: 'l', label: 'litre', factor: 1000 },
    ],
    MASS: [
        { value: 'g', label: 'g', factor: 1 },
        { value: 'kg', label: 'kg', factor: 1000 },
    ],
    COUNT: [{ value: 'piece', label: 'piece', factor: 1 }],
};

export const BASE_UNIT: Record<Measure, string> = { VOLUME: 'ml', MASS: 'g', COUNT: 'piece' };

const num = (v: any) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
};

/** Show a base amount in the biggest unit that gives a whole-ish number (750 ml, 50 kg). */
function friendly(base: number, measure: Measure): { value: string; unit: string } {
    const units = [...UNITS[measure]].sort((a, b) => b.factor - a.factor);
    for (const u of units) {
        if (base >= u.factor && Number.isInteger(+(base / u.factor).toFixed(3))) {
            return { value: String(+(base / u.factor).toFixed(3)), unit: u.value };
        }
    }
    return { value: base ? String(base) : '', unit: BASE_UNIT[measure] };
}

/** Form initial values from a product (or a restaurant stock item). */
export function partsInitialValues(src: any) {
    const p = src?.parts ?? src ?? {};
    const measure = (p.measure || src?.measure || 'VOLUME') as Measure;
    const on = String(p.sold_in_parts ?? src?.sold_in_parts ?? false).toLowerCase() === 'true';
    const content = friendly(num(p.content_per_unit ?? src?.content_per_unit), measure);
    const part = friendly(num(p.part_size ?? src?.part_size), measure);
    return {
        sold_in_parts: on ? 'true' : 'false',
        measure,
        content_per_unit: on ? content.value : '',
        content_unit: content.unit,
        part_size: on ? part.value : '',
        part_unit: part.unit,
        part_label: (p.part_label ?? src?.part_label) || '',
    };
}

/** What the API takes (backend/products/units_admin.py converts to base units). */
export function partsPayload(values: any) {
    if (String(values?.sold_in_parts) !== 'true') return { sold_in_parts: 'false' };
    return {
        sold_in_parts: 'true',
        measure: values.measure,
        content_per_unit: String(values.content_per_unit ?? ''),
        content_unit: values.content_unit,
        part_size: String(values.part_size ?? ''),
        part_unit: values.part_unit,
        part_label: String(values.part_label ?? '').trim(),
    };
}

/** Does this receipt / item sell in parts? */
export const sellsInParts = (item: any): boolean => !!(item?.parts?.sold_in_parts ?? item?.sold_in_parts);

/** "tot", "kg" … for a receipt / item. */
export const partLabel = (item: any): string => item?.parts?.part_label || item?.part_label || 'part';

/** Parts in one whole unit (30 tots a bottle). */
export const partsPerUnit = (item: any): number => num(item?.parts?.parts_per_unit) || 1;

/** All stock in parts (whole units x parts per unit + the opened unit). */
export function totalParts(item: any): number {
    if (item?.parts?.total_parts != null) return num(item.parts.total_parts);
    return num(item?.current_unit_quantity) * partsPerUnit(item);
}

/** "11 bottles + 14 tots" — falls back to the plain count. */
export function stockLabel(item: any, fallbackUnit = 'unit'): string {
    if (item?.parts?.label) return item.parts.label;
    const n = num(item?.current_unit_quantity ?? item?.quantity);
    return `${n} ${fallbackUnit}${n === 1 ? '' : 's'}`;
}

export const plural = (word: string, n: number) =>
    n === 1 || !word || word.endsWith('s') || ['ml', 'g', 'kg', 'l', 'cl'].includes(word) ? word : `${word}s`;

/* ---------------------------------------------------------------- local stock
 * Same arithmetic as backend/products/units.py take(), for the device copy of
 * stock (offline sales): whole units stay sealed, parts come out of the opened
 * unit and a new one is opened when it runs dry. */

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** Text like the server's: "11 bottles + 14 tots". */
export function describeStock(full: number, open: number, info: PartsInfo | null | undefined): string {
    const unit = info?.unit_label || 'unit';
    let text = `${full} ${unit}${full === 1 ? '' : 's'}`;
    const size = num(info?.part_size);
    if (info?.sold_in_parts && open > 0 && size > 0) {
        const parts = Math.floor((open / size) * 100) / 100;
        text += ` + ${parts} ${plural(info.part_label || 'part', parts)}`;
    }
    return text;
}

/** A receipt after selling `qty` whole units (FULL) or parts (PART). Never below zero. */
export function takeLocal<T extends Record<string, any>>(receipt: T, saleUnit: SaleUnit, qty: number): T {
    const info: PartsInfo | null = receipt?.parts ?? null;
    let full = Number(receipt?.current_unit_quantity) || 0;
    let open = num(receipt?.open_content);
    const content = num(info?.content_per_unit);
    const size = num(info?.part_size);
    if (saleUnit === 'PART' && info?.sold_in_parts && content > 0 && size > 0) {
        let need = qty * size;
        if (need > open) {
            const opened = Math.min(full, Math.ceil((need - open) / content));
            full -= opened;
            open += opened * content;
        }
        open = Math.max(0, round3(open - need));
    } else {
        full = Math.max(0, full - qty);
    }
    const next: any = { ...receipt, current_unit_quantity: full, open_content: String(open) };
    if (info?.sold_in_parts && size > 0) {
        next.parts = {
            ...info,
            full_units: full,
            open_parts: String(Math.floor((open / size) * 100) / 100),
            total_parts: String(Math.floor(((full * content + open) / size) * 100) / 100),
            label: describeStock(full, open, info),
        };
    }
    return next as T;
}
