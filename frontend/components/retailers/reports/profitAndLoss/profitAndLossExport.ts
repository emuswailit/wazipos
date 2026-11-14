// components/retailers/reports/profitAndLoss/profitAndLossExport.ts

import type { SheetSpec } from '@/components/common/Exportable';
import type {
    PlExpenseCategory,
    ProfitAndLossData,
} from './ProfitAndLossReport';

/* =========================================================
 * Excel
 * ======================================================= */

export function buildProfitAndLossSheets(
    report: ProfitAndLossData,
): SheetSpec[] {
    const r = report.revenue;
    const c = report.cogs;
    const o = report.operating_expenses;

    const statement: any[][] = [
        ['Profit & loss statement'],
        ['Entity', report.entity.title],
        ['From', report.period.from],
        ['To', report.period.to],
        ['Days', report.period.days],
        [],
        ['REVENUE', ''],
        ['Gross sales', r.gross_sales],
        ['Less: discounts', `(${r.discounts})`],
        ['Less: sales returns', `(${r.returns_value})`],
        ['Less: tax collected', `(${r.tax_collected})`],
        ['Net revenue', r.net_revenue],
        [],
        ['COST OF SALES', ''],
        ['Cost of goods sold', c.sold_cost],
        ['Less: returned cost', `(${c.returned_cost})`],
        ['COGS expense categories', ''],
        ...c.expense_categories.map((cat) => [
            `  ${cat.category}`,
            cat.amount,
        ]),
        ['Total cost of sales', c.total],
        [],
        ['GROSS PROFIT', report.gross_profit],
        ['Gross margin %', report.gross_margin_percent],
        [],
        ['OPERATING EXPENSES', ''],
        ...o.categories.map((cat) => [cat.category, cat.amount]),
        ['  Total categories', o.categories_total],
        ['Payment fees', o.payment_fees.fees],
        ['  Transactions', o.payment_fees.transactions],
        ...o.inventory_write_offs.breakdown.map((w) => [
            `Write-off · ${w.reason}`,
            w.cost,
        ]),
        ['Total operating expenses', o.total],
        [],
        ['NET PROFIT', report.net_profit],
        ['Net margin %', report.net_margin_percent],
        [],
        ['STOCK POSITION (all-time)', ''],
        ['Units on hand', report.stock_position.units],
        ['Cost value', report.stock_position.cost_value],
        ['Retail value', report.stock_position.retail_value],
    ];

    const expenses: any[][] = [
        ['Category', 'Amount', 'Entry count'],
        ...o.categories.map((cat: PlExpenseCategory) => [
            cat.category,
            cat.amount,
            cat.count,
        ]),
        [],
        ['Total operating categories', o.categories_total],
        ['Payment fees', o.payment_fees.fees],
        ['Inventory write-offs', o.inventory_write_offs.total_cost],
        [],
        ['Total operating expenses', o.total],
    ];

    return [
        { name: 'P&L Statement', rows: statement },
        { name: 'Operating Expenses', rows: expenses },
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

export function buildProfitAndLossHtml(
    report: ProfitAndLossData,
): string {
    const r = report.revenue;
    const c = report.cogs;
    const o = report.operating_expenses;
    const generated = new Date().toLocaleString();

    const netProfit = parseFloat(report.net_profit);
    const isProfit = netProfit >= 0;

    const cogsExpenseRows = c.expense_categories
        .map(
            (cat) =>
                `<tr><td class="indent">${esc(cat.category)}</td><td class="num">${money(cat.amount)}</td></tr>`,
        )
        .join('');

    const opexRows = o.categories
        .map(
            (cat) =>
                `<tr><td class="indent">${esc(cat.category)} <span class="small">(${cat.count})</span></td><td class="num">${money(cat.amount)}</td></tr>`,
        )
        .join('');

    const writeOffRows = o.inventory_write_offs.breakdown
        .map(
            (w) =>
                `<tr><td class="indent">Write-off · ${esc(w.reason)} <span class="small">(${num(w.quantity)} units)</span></td><td class="num">${money(w.cost)}</td></tr>`,
        )
        .join('');

    return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Profit &amp; loss</title>
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
    .small { font-weight: 400; color: #64748b; font-size: 10px; }

    .headline {
        display: flex; flex-wrap: wrap; gap: 10px; margin: 12px 0 4px;
    }
    .card {
        flex: 1 1 22%; min-width: 130px;
        border: 1px solid #e2e8f0;
        border-radius: 6px;
        padding: 10px 12px;
    }
    .card .label {
        text-transform: uppercase; letter-spacing: 0.08em;
        font-size: 8px; color: #64748b; font-weight: 600;
    }
    .card .value { font-size: 16px; font-weight: 700; margin-top: 3px; }
    .card .sub { font-size: 9px; color: #64748b; margin-top: 1px; }
    .card.profit .value { color: #15803d; }
    .card.loss .value { color: #b91c1c; }

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
    td.indent { padding-left: 22px; color: #475569; }
    tr.subtotal td {
        font-weight: 700;
        border-top: 1px solid #cbd5e1;
        border-bottom: 1px solid #cbd5e1;
    }
    tr.total td {
        font-weight: 700;
        font-size: 12px;
        border-top: 2px solid #0f172a;
        border-bottom: 2px solid #0f172a;
        padding-top: 8px;
        padding-bottom: 8px;
    }
    tr.muted td { color: #64748b; }
    .footer {
        margin-top: 24px; font-size: 9px; color: #94a3b8;
        text-align: center;
    }
</style>
</head>
<body>
    <h1>Profit &amp; loss</h1>
    <div class="meta">${esc(report.entity.title)}</div>
    <div class="meta">
        Period: ${esc(report.period.from)} → ${esc(report.period.to)}
        (${report.period.days} day${report.period.days === 1 ? '' : 's'})
    </div>

    <div class="headline">
        <div class="card"><div class="label">Net revenue</div><div class="value">${money(r.net_revenue)}</div></div>
        <div class="card"><div class="label">Gross profit</div><div class="value">${money(report.gross_profit)}</div><div class="sub">${report.gross_margin_percent}% margin</div></div>
        <div class="card ${isProfit ? 'profit' : 'loss'}"><div class="label">${isProfit ? 'Net profit' : 'Net loss'}</div><div class="value">${money(report.net_profit)}</div><div class="sub">${report.net_margin_percent}% margin</div></div>
        <div class="card"><div class="label">Orders</div><div class="value">${num(r.orders_count)}</div></div>
    </div>

    <h2>Trading account</h2>
    <table>
        <tr><td>Gross sales</td><td class="num">${money(r.gross_sales)}</td></tr>
        <tr class="muted"><td class="indent">Less: discounts</td><td class="num">(${money(r.discounts)})</td></tr>
        <tr class="muted"><td class="indent">Less: sales returns</td><td class="num">(${money(r.returns_value)})</td></tr>
        <tr class="muted"><td class="indent">Less: tax collected</td><td class="num">(${money(r.tax_collected)})</td></tr>
        <tr class="subtotal"><td>Net revenue</td><td class="num">${money(r.net_revenue)}</td></tr>
        <tr><td>Cost of goods sold</td><td class="num">${money(c.sold_cost)}</td></tr>
        <tr class="muted"><td class="indent">Less: returned cost</td><td class="num">(${money(c.returned_cost)})</td></tr>
        ${cogsExpenseRows}
        <tr class="subtotal"><td>Total cost of sales</td><td class="num">${money(c.total)}</td></tr>
        <tr class="total"><td>Gross profit</td><td class="num">${money(report.gross_profit)}</td></tr>
    </table>

    <h2>Operating expenses</h2>
    <table>
        ${opexRows || '<tr><td colspan="2" class="muted">No operating expenses in period</td></tr>'}
        <tr class="subtotal"><td>Total categories</td><td class="num">${money(o.categories_total)}</td></tr>
        <tr><td>Payment fees <span class="small">(${num(o.payment_fees.transactions)} txns)</span></td><td class="num">${money(o.payment_fees.fees)}</td></tr>
        ${writeOffRows}
        <tr class="total"><td>Total operating expenses</td><td class="num">${money(o.total)}</td></tr>
    </table>

    <h2>Net result</h2>
    <table>
        <tr class="total">
            <td>${isProfit ? 'Net profit' : 'Net loss'}</td>
            <td class="num">${money(report.net_profit)}</td>
        </tr>
        <tr><td>Net margin</td><td class="num">${report.net_margin_percent}%</td></tr>
    </table>

    <h2>Stock position (all-time)</h2>
    <table>
        <tr><td>Units on hand</td><td class="num">${num(report.stock_position.units)}</td></tr>
        <tr><td>Cost value</td><td class="num">${money(report.stock_position.cost_value)}</td></tr>
        <tr><td>Retail value</td><td class="num">${money(report.stock_position.retail_value)}</td></tr>
    </table>

    <div class="footer">Generated ${esc(generated)}</div>
</body>
</html>`;
}