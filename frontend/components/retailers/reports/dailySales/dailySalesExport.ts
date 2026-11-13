// components/retailers/reports/dailySales/dailySalesExport.ts
//
// Report-specific data builders. Feeds the universal Exportable module.
// Owns everything the daily sales report needs to say about itself in
// an Excel workbook or a PDF document.

import type { SheetSpec } from '@/components/common/Exportable';
import type {
    CollectionRow,
    DailySalesReportData,
    OriginPaymentRow,
    PaymentRow,
    ProductRow,
} from './DailySalesReport';

/* =========================================================
 * Excel
 * ======================================================= */

export function buildDailySalesSheets(
    report: DailySalesReportData,
): SheetSpec[] {
    const k = report.kpi;

    const summary: SheetSpec = {
        name: 'Summary',
        rows: [
            ['Daily sales report'],
            ['Entity', report.entity.title],
            ['From', report.period.from],
            ['To', report.period.to],
            ['Days', report.period.days],
            [
                'Include cancelled',
                report.filters.include_cancelled ? 'Yes' : 'No',
            ],
            [],
            ['KPI', 'Value'],
            ['Orders', k.orders_count],
            ['Gross sales', k.gross_sales],
            ['Tax', k.tax_total],
            ['Discount', k.discount_total],
            ['Shipping', k.shipping_total],
            ['Net sales', k.net_sales],
            ['Paid', k.paid_total],
            ['Balance due', k.balance_due_total],
            ['Units sold', k.units_sold],
            ['Returns count', k.returns_count],
            ['Units returned', k.units_returned],
            ['Returns value', k.returns_value],
            ['Net after returns', k.net_after_returns],
            ['Stock on hand (units)', k.receipts_on_hand_units],
            ['Stock value', k.receipts_on_hand_value],
        ],
    };

    const originAndChannel: SheetSpec = {
        name: 'Origin & Channel',
        rows: [
            ['Order origin', 'Orders', 'Net', 'Paid'],
            ...report.origin_counts.map((r) => [
                r.order_origin,
                r.orders_count,
                r.net,
                r.paid,
            ]),
            [],
            ['Channel', 'Orders', 'Net'],
            ...report.channel_counts.map((r) => [
                r.order_channel,
                r.orders_count,
                r.net,
            ]),
        ],
    };

    const payments: SheetSpec = {
        name: 'Payments',
        rows: [
            ['Payment method', 'Orders', 'Gross', 'Net', 'Paid'],
            ...report.payment_breakdown.map((p: PaymentRow) => [
                p.payment_method_title,
                p.orders_count,
                p.gross ?? '',
                p.net,
                p.paid,
            ]),
        ],
    };

    const collections: SheetSpec = {
        name: 'Collections',
        rows: [
            ['Payment method', 'Transactions', 'Collected'],
            ...report.collections_breakdown.map((c: CollectionRow) => [
                c.payment_method_title,
                c.transactions,
                c.collected,
            ]),
        ],
    };

    const opRows: any[][] = [];
    report.origin_payment_breakdown.forEach((op: OriginPaymentRow) => {
        opRows.push([`Origin: ${op.order_origin}`]);
        opRows.push(['Method', 'Orders', 'Net', 'Paid']);
        op.methods.forEach((m) => {
            opRows.push([
                m.payment_method_title,
                m.orders_count,
                m.net,
                m.paid,
            ]);
        });
        opRows.push([
            'Subtotal',
            op.summary.orders_count,
            op.summary.net,
            op.summary.paid,
        ]);
        opRows.push([]);
    });

    const originPayment: SheetSpec = {
        name: 'Origin x Payment',
        rows: opRows,
    };

    const products: SheetSpec = {
        name: 'Products',
        rows: [
            [
                'Product',
                'Sold qty',
                'Returned qty',
                'Net qty',
                'Gross value',
                'Net value',
                'Stock',
                'Stock value',
            ],
            ...report.product_breakdown.map((p: ProductRow) => [
                p.product_title,
                p.sold_quantity,
                p.returned_quantity,
                p.net_quantity,
                p.gross_value,
                p.net_value,
                p.current_stock,
                p.stock_value,
            ]),
            [],
            [
                'Totals',
                report.totals.sold_quantity,
                report.totals.returned_quantity,
                '',
                report.totals.gross_value,
                report.totals.net_value,
                report.totals.current_stock,
                report.totals.stock_value,
            ],
        ],
    };

    return [
        summary,
        originAndChannel,
        payments,
        collections,
        originPayment,
        products,
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

export function buildDailySalesHtml(
    report: DailySalesReportData,
): string {
    const k = report.kpi;
    const p = report.period;
    const generated = new Date().toLocaleString();

    const originRows = report.origin_counts
        .map(
            (r) => `
            <tr>
                <td>${esc(r.order_origin)}</td>
                <td class="num">${num(r.orders_count)}</td>
                <td class="num">${money(r.net)}</td>
                <td class="num">${money(r.paid)}</td>
            </tr>`,
        )
        .join('');

    const channelRows = report.channel_counts
        .map(
            (r) => `
            <tr>
                <td>${esc(r.order_channel)}</td>
                <td class="num">${num(r.orders_count)}</td>
                <td class="num">${money(r.net)}</td>
            </tr>`,
        )
        .join('');

    const paymentRows = report.payment_breakdown
        .map(
            (pm: PaymentRow) => `
            <tr>
                <td>${esc(pm.payment_method_title)}</td>
                <td class="num">${num(pm.orders_count)}</td>
                <td class="num">${money(pm.net)}</td>
                <td class="num">${money(pm.paid)}</td>
            </tr>`,
        )
        .join('');

    const collectionsRows = report.collections_breakdown
        .map(
            (c: CollectionRow) => `
            <tr>
                <td>${esc(c.payment_method_title)}</td>
                <td class="num">${num(c.transactions)}</td>
                <td class="num">${money(c.collected)}</td>
            </tr>`,
        )
        .join('');

    const productRows = report.product_breakdown
        .map(
            (pr: ProductRow) => `
            <tr>
                <td>${esc(pr.product_title)}</td>
                <td class="num">${num(pr.sold_quantity)}</td>
                <td class="num">${num(pr.returned_quantity)}</td>
                <td class="num">${num(pr.net_quantity)}</td>
                <td class="num">${money(pr.net_value)}</td>
                <td class="num">${num(pr.current_stock)}</td>
                <td class="num">${money(pr.stock_value)}</td>
            </tr>`,
        )
        .join('');

    const opSections = report.origin_payment_breakdown
        .map(
            (op: OriginPaymentRow) => `
            <h3>${esc(op.order_origin)}
                <span class="small">
                    ${num(op.summary.orders_count)} orders ·
                    net ${money(op.summary.net)} ·
                    paid ${money(op.summary.paid)}
                </span>
            </h3>
            <table>
                <thead><tr>
                    <th>Method</th><th class="num">Orders</th>
                    <th class="num">Net</th><th class="num">Paid</th>
                </tr></thead>
                <tbody>
                ${op.methods
                    .map(
                        (m) => `<tr>
                            <td>${esc(m.payment_method_title)}</td>
                            <td class="num">${num(m.orders_count)}</td>
                            <td class="num">${money(m.net)}</td>
                            <td class="num">${money(m.paid)}</td>
                        </tr>`,
                    )
                    .join('')}
                </tbody>
            </table>`,
        )
        .join('');

    return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Daily sales report</title>
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
        font-size: 13px;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: #475569;
        margin: 22px 0 8px;
        border-bottom: 1px solid #e2e8f0;
        padding-bottom: 4px;
    }
    h3 {
        font-size: 12px;
        margin: 14px 0 6px;
        color: #0f172a;
    }
    .small { font-weight: 400; color: #64748b; font-size: 10px; margin-left: 6px; }
    .meta { color: #64748b; font-size: 11px; margin-bottom: 2px; }
    .kpi-grid {
        display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px;
    }
    .kpi {
        flex: 1 1 22%; min-width: 120px;
        border: 1px solid #e2e8f0;
        border-radius: 6px;
        padding: 8px 10px;
    }
    .kpi .label {
        text-transform: uppercase; letter-spacing: 0.08em;
        font-size: 8px; color: #64748b; font-weight: 600;
    }
    .kpi .value { font-size: 15px; font-weight: 700; margin-top: 2px; }
    .kpi .sub { font-size: 9px; color: #64748b; margin-top: 1px; }
    table {
        width: 100%;
        border-collapse: collapse;
        margin: 4px 0 8px;
    }
    th, td {
        text-align: left;
        padding: 5px 6px;
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
    td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
    tfoot td { font-weight: 700; border-top: 1px solid #cbd5e1; }
    .footer {
        margin-top: 20px; font-size: 9px; color: #94a3b8;
        text-align: center;
    }
</style>
</head>
<body>
    <h1>Daily sales report</h1>
    <div class="meta">${esc(report.entity.title)}</div>
    <div class="meta">
        Period: ${esc(p.from)} → ${esc(p.to)} (${p.days} day${p.days === 1 ? '' : 's'})
        · Cancelled orders: ${report.filters.include_cancelled ? 'included' : 'excluded'}
    </div>

    <h2>Key metrics</h2>
    <div class="kpi-grid">
        <div class="kpi"><div class="label">Orders</div><div class="value">${num(k.orders_count)}</div></div>
        <div class="kpi"><div class="label">Net sales</div><div class="value">${money(k.net_sales)}</div></div>
        <div class="kpi"><div class="label">Paid</div><div class="value">${money(k.paid_total)}</div></div>
        <div class="kpi"><div class="label">Balance due</div><div class="value">${money(k.balance_due_total)}</div></div>
        <div class="kpi"><div class="label">Units sold</div><div class="value">${num(k.units_sold)}</div></div>
        <div class="kpi"><div class="label">Returns</div><div class="value">${num(k.returns_count)}</div><div class="sub">${money(k.returns_value)}</div></div>
        <div class="kpi"><div class="label">Stock on hand</div><div class="value">${num(k.receipts_on_hand_units)}</div><div class="sub">${money(k.receipts_on_hand_value)}</div></div>
        <div class="kpi"><div class="label">Net after returns</div><div class="value">${money(k.net_after_returns)}</div></div>
    </div>

    <h2>By origin</h2>
    <table>
        <thead><tr>
            <th>Origin</th><th class="num">Orders</th>
            <th class="num">Net</th><th class="num">Paid</th>
        </tr></thead>
        <tbody>${originRows}</tbody>
    </table>

    <h2>By channel</h2>
    <table>
        <thead><tr>
            <th>Channel</th><th class="num">Orders</th><th class="num">Net</th>
        </tr></thead>
        <tbody>${channelRows}</tbody>
    </table>

    <h2>Payment methods (declared)</h2>
    <table>
        <thead><tr>
            <th>Method</th><th class="num">Orders</th>
            <th class="num">Net</th><th class="num">Paid</th>
        </tr></thead>
        <tbody>${paymentRows}</tbody>
    </table>

    <h2>Collections (actual)</h2>
    <table>
        <thead><tr>
            <th>Method</th><th class="num">Transactions</th>
            <th class="num">Collected</th>
        </tr></thead>
        <tbody>${collectionsRows}</tbody>
    </table>

    <h2>Origin × payment method</h2>
    ${opSections}

    <h2>Products</h2>
    <table>
        <thead><tr>
            <th>Product</th>
            <th class="num">Sold</th>
            <th class="num">Returned</th>
            <th class="num">Net qty</th>
            <th class="num">Net value</th>
            <th class="num">Stock</th>
            <th class="num">Stock value</th>
        </tr></thead>
        <tbody>${productRows}</tbody>
        <tfoot><tr>
            <td>Totals</td>
            <td class="num">${num(report.totals.sold_quantity)}</td>
            <td class="num">${num(report.totals.returned_quantity)}</td>
            <td class="num"></td>
            <td class="num">${money(report.totals.net_value)}</td>
            <td class="num">${num(report.totals.current_stock)}</td>
            <td class="num">${money(report.totals.stock_value)}</td>
        </tr></tfoot>
    </table>

    <div class="footer">Generated ${esc(generated)}</div>
</body>
</html>`;
}