// components/retailers/reports/stock/stockExport.ts

import type { SheetSpec } from '@/components/common/Exportable';
import type {
    StockCategoryRow,
    StockProductRow,
    StockReportData,
} from './StockReport';

/* =========================================================
 * Excel
 * ======================================================= */

export function buildStockSheets(report: StockReportData): SheetSpec[] {
    const k = report.kpi;

    const summary: any[][] = [
        ['Stock report'],
        ['Entity', report.entity.title],
        ['As of', report.period.as_of],
        ['Dead-stock threshold (days)', report.period.dead_days],
        [],
        ['KPI', 'Value'],
        ['SKUs', k.sku_count],
        ['Batches', k.batch_count],
        ['Units on hand', k.total_units],
        ['Cost value', k.cost_value],
        ['Retail value', k.retail_value],
        ['Potential margin', k.potential_margin],
        ['Margin %', k.margin_percent],
        ['Dead SKUs', k.dead_sku_count],
        ['Expiring within 30 days', k.expiring_within_30],
        ['Already expired', k.already_expired],
        ...(k.cost_basis_missing_count !== undefined
            ? [
                ['SKUs missing cost basis', k.cost_basis_missing_count],
            ]
            : []),
        [],
        ['By category', ''],
        [
            'Category',
            'SKUs',
            'Units',
            'Cost value',
            'Retail value',
            'Margin',
            'Margin %',
        ],
        ...report.category_rollup.map((c: StockCategoryRow) => [
            c.category,
            c.sku_count,
            c.units,
            c.cost_value,
            c.retail_value,
            c.margin,
            c.margin_percent,
        ]),
    ];

    const products: any[][] = [
        [
            'Product',
            'Category',
            'Sub-category',
            'Units',
            'Batches',
            'Unit cost',
            'Cost value',
            'Retail value',
            'Margin',
            'Margin %',
            'Nearest expiry',
            'Days to expiry',
            'Last sale',
            'Days since sale',
            'Dead',
        ],
        ...report.products.map((p: StockProductRow) => [
            p.product_title,
            p.category,
            p.sub_category,
            p.units,
            p.receipt_count,
            p.unit_cost,
            p.cost_value,
            p.retail_value,
            p.margin,
            p.margin_percent,
            p.nearest_expiry ?? '',
            p.days_to_expiry ?? '',
            p.last_sale ?? '',
            p.days_since_sale ?? '',
            p.is_dead ? 'YES' : '',
        ]),
    ];

    return [
        { name: 'Summary', rows: summary },
        { name: 'Products', rows: products },
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

export function buildStockHtml(report: StockReportData): string {
    const k = report.kpi;
    const generated = new Date().toLocaleString();

    const categoryRows = report.category_rollup
        .map(
            (c) => `
            <tr>
                <td>${esc(c.category)}</td>
                <td class="num">${num(c.sku_count)}</td>
                <td class="num">${num(c.units)}</td>
                <td class="num">${money(c.cost_value)}</td>
                <td class="num">${money(c.retail_value)}</td>
                <td class="num">${money(c.margin)}</td>
                <td class="num">${c.margin_percent}%</td>
            </tr>`,
        )
        .join('');

    const productRows = report.products
        .map((p) => {
            const expiry =
                p.days_to_expiry === null
                    ? '—'
                    : p.days_to_expiry < 0
                        ? `${Math.abs(p.days_to_expiry)}d overdue`
                        : `${p.days_to_expiry}d`;
            const lastSale =
                p.days_since_sale === null
                    ? 'never'
                    : `${p.days_since_sale}d ago`;
            const flag = p.is_dead
                ? ' style="color:#b91c1c; font-weight:600;"'
                : '';
            return `
            <tr${flag}>
                <td>${esc(p.product_title)}</td>
                <td>${esc(p.category)}</td>
                <td class="num">${num(p.units)}</td>
                <td class="num">${num(p.receipt_count)}</td>
                <td class="num">${money(p.cost_value)}</td>
                <td class="num">${money(p.retail_value)}</td>
                <td class="num">${money(p.margin)}</td>
                <td class="num">${p.margin_percent}%</td>
                <td>${expiry}</td>
                <td>${lastSale}</td>
            </tr>`;
        })
        .join('');

    return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Stock report</title>
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
    <h1>Stock report</h1>
    <div class="meta">${esc(report.entity.title)}</div>
    <div class="meta">
        As of ${esc(report.period.as_of)} ·
        dead-stock threshold ${report.period.dead_days} days
    </div>

    <div class="kpi-grid">
        <div class="kpi"><div class="label">SKUs</div><div class="value">${num(k.sku_count)}</div><div class="sub">${num(k.batch_count)} batches</div></div>
        <div class="kpi"><div class="label">Units on hand</div><div class="value">${num(k.total_units)}</div></div>
        <div class="kpi"><div class="label">Cost value</div><div class="value">${money(k.cost_value)}</div></div>
        <div class="kpi"><div class="label">Retail value</div><div class="value">${money(k.retail_value)}</div></div>
        <div class="kpi"><div class="label">Potential margin</div><div class="value">${money(k.potential_margin)}</div><div class="sub">${k.margin_percent}%</div></div>
        <div class="kpi warn"><div class="label">Dead SKUs</div><div class="value">${num(k.dead_sku_count)}</div></div>
        <div class="kpi warn"><div class="label">Expiring ≤30d</div><div class="value">${num(k.expiring_within_30)}</div></div>
        <div class="kpi warn"><div class="label">Already expired</div><div class="value">${num(k.already_expired)}</div></div>
    </div>

    <h2>By category</h2>
    <table>
        <thead><tr>
            <th>Category</th><th class="num">SKUs</th><th class="num">Units</th>
            <th class="num">Cost value</th><th class="num">Retail value</th>
            <th class="num">Margin</th><th class="num">Margin %</th>
        </tr></thead>
        <tbody>${categoryRows}</tbody>
    </table>

    <h2>Products (${report.products.length})</h2>
    <table>
        <thead><tr>
            <th>Product</th><th>Category</th><th class="num">Units</th>
            <th class="num">Batches</th><th class="num">Cost value</th>
            <th class="num">Retail value</th><th class="num">Margin</th>
            <th class="num">Margin %</th><th>Nearest expiry</th><th>Last sale</th>
        </tr></thead>
        <tbody>${productRows}</tbody>
    </table>

    <div class="footer">Generated ${esc(generated)}</div>
</body>
</html>`;
}