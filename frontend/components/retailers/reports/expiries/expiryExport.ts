// components/retailers/reports/expiries/expiryExport.ts

import type { SheetSpec } from '@/components/common/Exportable';
import type {
    ExpiryReceiptRow,
    ExpiryReportData,
} from './ExpiryReport';

/* =========================================================
 * Excel
 * ======================================================= */

export function buildExpirySheets(
    report: ExpiryReportData,
): SheetSpec[] {
    const k = report.kpi;

    const summary: any[][] = [
        ['Expiry report'],
        ['Entity', report.entity.title],
        ['As of', report.period.as_of],
        ['Window (days)', report.period.window_days],
        [],
        ['KPI', 'Value'],
        ['Batches at risk', k.total_batches],
        ['Units at risk', k.total_units],
        ['Cost value at risk', k.cost_value_at_risk],
        ['Retail value at risk', k.retail_value_at_risk],
        ['Expired batches', k.expired_batches],
        ['Expired units', k.expired_units],
        ['Expired cost value', k.expired_cost_value],
        ['Expiring this week — batches', k.urgent_batches],
        ['Expiring this week — units', k.urgent_units],
        ['Expiring this week — cost value', k.urgent_cost_value],
        [],
        ['By bucket', ''],
        ['Bucket', 'Batches', 'Units', 'Cost value', 'Retail value'],
        ...report.buckets.map((b) => [
            b.label,
            b.batches,
            b.units,
            b.cost_value,
            b.retail_value,
        ]),
        [],
        ['By wholesaler', ''],
        ['Wholesaler', 'Batches', 'Units', 'Cost value'],
        ...report.wholesaler_breakdown.map((w) => [
            w.wholesaler_title,
            w.batches,
            w.units,
            w.cost_value,
        ]),
    ];

    const detail: any[][] = [
        [
            'Product',
            'Batch',
            'Expiry date',
            'Days until expiry',
            'Bucket',
            'Quantity',
            'Unit cost',
            'Cost value',
            'Retail value',
            'Wholesaler',
            'Supplier invoice',
        ],
        ...report.receipts.map((r: ExpiryReceiptRow) => [
            r.product_title,
            r.batch,
            r.expiry_date,
            r.days_until_expiry,
            r.bucket,
            r.quantity,
            r.unit_cost,
            r.cost_value,
            r.retail_value,
            r.wholesaler_title,
            r.supplier_invoice,
        ]),
    ];

    return [
        { name: 'Summary', rows: summary },
        { name: 'Detail', rows: detail },
    ];
}

/* =========================================================
 * PDF
 * ======================================================= */

function esc(v: unknown): string {
    return String(v ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function money(v: string | number | null | undefined): string {
    const n = typeof v === 'string' ? parseFloat(v) : (v ?? 0);
    if (!Number.isFinite(n)) return '0.00';
    return n.toLocaleString('en-KE', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
}

function num(v: string | number | null | undefined): string {
    const n = typeof v === 'string' ? parseFloat(v) : (v ?? 0);
    if (!Number.isFinite(n)) return '0';
    return n.toLocaleString('en-KE');
}

const BUCKET_HEX: Record<string, string> = {
    EXPIRED: '#dc2626',
    '0_7': '#ea580c',
    '8_30': '#f59e0b',
    '31_60': '#0ea5e9',
    '61_90': '#10b981',
    '91_PLUS': '#64748b',
};

export function buildExpiryHtml(report: ExpiryReportData): string {
    const k = report.kpi;
    const generated = new Date().toLocaleString();

    const bucketRows = report.buckets
        .filter((b) => b.batches > 0)
        .map(
            (b) => `
            <tr>
                <td style="color: ${BUCKET_HEX[b.key]}; font-weight: 600;">${esc(b.label)}</td>
                <td class="num">${num(b.batches)}</td>
                <td class="num">${num(b.units)}</td>
                <td class="num">${money(b.cost_value)}</td>
                <td class="num">${money(b.retail_value)}</td>
            </tr>`,
        )
        .join('');

    const wholesalerRows = report.wholesaler_breakdown
        .map(
            (w) => `
            <tr>
                <td>${esc(w.wholesaler_title)}</td>
                <td class="num">${num(w.batches)}</td>
                <td class="num">${num(w.units)}</td>
                <td class="num">${money(w.cost_value)}</td>
            </tr>`,
        )
        .join('');

    const detailRows = report.receipts
        .map(
            (r) => `
            <tr>
                <td>${esc(r.product_title)}</td>
                <td>${esc(r.batch || '—')}</td>
                <td>${esc(r.expiry_date)}</td>
                <td class="num" style="color: ${BUCKET_HEX[r.bucket] || '#64748b'}; font-weight: 600;">
                    ${r.days_until_expiry < 0 ? `${Math.abs(r.days_until_expiry)}d overdue` : `${r.days_until_expiry}d`}
                </td>
                <td class="num">${num(r.quantity)}</td>
                <td class="num">${money(r.cost_value)}</td>
                <td class="num">${money(r.retail_value)}</td>
            </tr>`,
        )
        .join('');

    return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Expiry report</title>
<style>
    * { box-sizing: border-box; }
    body {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
            Helvetica, Arial, sans-serif;
        color: #0f172a;
        margin: 0;
        padding: 28px 32px;
        font-size: 11px;
    }
    h1 { font-size: 20px; margin: 0 0 4px; }
    h2 {
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: #475569;
        margin: 22px 0 8px;
        border-bottom: 1px solid #e2e8f0;
        padding-bottom: 4px;
    }
    .meta { color: #64748b; font-size: 11px; margin-bottom: 2px; }

    .kpi-grid {
        display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px;
    }
    .kpi {
        flex: 1 1 22%; min-width: 130px;
        border: 1px solid #e2e8f0;
        border-radius: 6px;
        padding: 10px 12px;
    }
    .kpi .label {
        text-transform: uppercase; letter-spacing: 0.08em;
        font-size: 8px; color: #64748b; font-weight: 600;
    }
    .kpi .value { font-size: 16px; font-weight: 700; margin-top: 3px; }
    .kpi .sub { font-size: 9px; color: #64748b; margin-top: 1px; }
    .kpi.warn .value { color: #ea580c; }
    .kpi.danger .value { color: #dc2626; }

    table {
        width: 100%;
        border-collapse: collapse;
        margin: 4px 0 8px;
    }
    th, td {
        text-align: left;
        padding: 5px 8px;
        border-bottom: 1px solid #f1f5f9;
        vertical-align: top;
    }
    th {
        font-size: 9px;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: #64748b;
        border-bottom: 1px solid #cbd5e1;
    }
    td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .footer {
        margin-top: 24px; font-size: 9px; color: #94a3b8;
        text-align: center;
    }
</style>
</head>
<body>
    <h1>Expiry report</h1>
    <div class="meta">${esc(report.entity.title)}</div>
    <div class="meta">
        As of ${esc(report.period.as_of)} · ${report.period.window_days}-day window
    </div>

    <div class="kpi-grid">
        <div class="kpi"><div class="label">Batches at risk</div><div class="value">${num(k.total_batches)}</div><div class="sub">${num(k.total_units)} units</div></div>
        <div class="kpi"><div class="label">Cost value at risk</div><div class="value">${money(k.cost_value_at_risk)}</div></div>
        <div class="kpi"><div class="label">Retail value at risk</div><div class="value">${money(k.retail_value_at_risk)}</div></div>
        <div class="kpi danger"><div class="label">Already expired</div><div class="value">${num(k.expired_batches)}</div><div class="sub">${money(k.expired_cost_value)}</div></div>
        <div class="kpi warn"><div class="label">Expires this week</div><div class="value">${num(k.urgent_batches)}</div><div class="sub">${money(k.urgent_cost_value)}</div></div>
    </div>

    <h2>By bucket</h2>
    <table>
        <thead><tr>
            <th>Bucket</th><th class="num">Batches</th><th class="num">Units</th>
            <th class="num">Cost value</th><th class="num">Retail value</th>
        </tr></thead>
        <tbody>${bucketRows}</tbody>
    </table>

    ${wholesalerRows
            ? `
    <h2>By wholesaler</h2>
    <table>
        <thead><tr>
            <th>Wholesaler</th><th class="num">Batches</th>
            <th class="num">Units</th><th class="num">Cost value</th>
        </tr></thead>
        <tbody>${wholesalerRows}</tbody>
    </table>`
            : ''}

    <h2>Detail (${report.receipts.length} batches)</h2>
    <table>
        <thead><tr>
            <th>Product</th><th>Batch</th><th>Expiry</th>
            <th class="num">Days</th><th class="num">Qty</th>
            <th class="num">Cost</th><th class="num">Retail</th>
        </tr></thead>
        <tbody>${detailRows}</tbody>
    </table>

    <div class="footer">Generated ${esc(generated)}</div>
</body>
</html>`;
}