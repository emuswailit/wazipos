// components/retailers/reports/lowStock/lowStockExport.ts

import type { SheetSpec } from '@/components/common/Exportable';
import type {
    LowStockOffer,
    LowStockProductRow,
    LowStockReportData,
    LowStockWholesalerGroup,
} from './LowStockReport';

/* =========================================================
 * Shared formatters
 * ======================================================= */

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

function daysCover(v: number | null | undefined): string {
    if (v === null || v === undefined) return '—';
    return `${v.toFixed(0)}d`;
}

function expiryLabel(days: number | null | undefined): string {
    if (days === null || days === undefined) return '—';
    if (days < 0) return `${Math.abs(days)}d overdue`;
    return `${days}d`;
}

/* =========================================================
 * Excel
 *
 * Sheets:
 *   1. Summary          — KPI + urgency rollup + category rollup
 *   2. Products         — full product list with best offer
 *   3. Offers           — flat list of every offer, one row per lot
 *   4. PO — <wholesaler>— one sheet per wholesaler group, ready to
 *                         send to the vendor
 * ======================================================= */

export function buildLowStockSheets(
    report: LowStockReportData,
): SheetSpec[] {
    return [
        buildSummarySheet(report),
        buildProductsSheet(report),
        buildOffersSheet(report),
        ...buildWholesalerSheets(report),
    ];
}

/* ---------- Sheet 1: Summary ---------- */

function buildSummarySheet(report: LowStockReportData): SheetSpec {
    const k = report.kpi;

    const rows: any[][] = [
        ['Low stock & reorder report'],
        ['Entity', report.entity.title],
        ['As of', report.period.as_of],
        ['Velocity lookback (days)', report.period.lookback_days],
        ['Cover target (days)', report.period.cover_days],
        [],
        ['KPI', 'Value'],
        ['Products to reorder', k.reorder_count],
        ['Out of stock', k.out_of_stock_count],
        ['Critical', k.critical_count],
        ['Warning', k.warning_count],
        ['Running low', k.soon_count],
        ['Estimated units', k.estimated_total_units],
        ['Estimated cost', k.estimated_total_cost],
        ['Zero-velocity products', k.zero_velocity_count],
        [],
        ['Offer coverage', ''],
        ['Products with offers', k.products_with_offers],
        [
            'Products with active discounts',
            k.products_with_discounted_offers,
        ],
        ['Products cheaper elsewhere', k.products_with_cheaper_offer],
        ['Estimated savings available', k.estimated_savings_on_orders],
        [],
        ['By urgency', ''],
        ['Urgency', 'Count', 'Estimated cost'],
        ...report.urgency_rollup.map((u) => [
            u.label,
            u.count,
            u.estimated_cost,
        ]),
        [],
        ['By category', ''],
        ['Category', 'Products', 'Units', 'Est. cost'],
        ...report.category_rollup.map((c) => [
            c.category,
            c.count,
            c.total_units,
            c.total_cost,
        ]),
    ];

    return { name: 'Summary', rows };
}

/* ---------- Sheet 2: Products ---------- */

function buildProductsSheet(report: LowStockReportData): SheetSpec {
    const rows: any[][] = [
        [
            'Product',
            'Category',
            'Urgency',
            'Current stock',
            'Target stock',
            'Suggested order',
            'Pack',
            'Daily sales',
            'Days of cover',
            'Unit cost',
            'Line cost',
            'Best wholesaler',
            'Best unit price',
            'Has discount',
            'Covers order',
            'Savings on line',
            'Offer count',
            'Last sale',
        ],
        ...report.products.map((p: LowStockProductRow) => {
            const b = p.best_offer;
            return [
                p.product_title,
                p.category,
                p.urgency,
                p.current_stock,
                p.target_stock,
                p.suggested_quantity,
                p.pack,
                p.avg_daily_sales.toFixed(2),
                p.days_of_cover ?? '',
                p.unit_cost,
                p.line_cost,
                b?.wholesaler_title ?? '',
                b?.effective_unit_price ?? '',
                b ? (b.has_discount ? 'YES' : 'no') : '',
                b ? (b.covers_suggested ? 'YES' : 'partial') : '',
                p.best_offer_savings_on_suggested,
                p.wholesale_offer_count,
                p.last_sale ?? '',
            ];
        }),
    ];

    return { name: 'Products', rows };
}

/* ---------- Sheet 3: Offers (flat) ---------- */

function buildOffersSheet(report: LowStockReportData): SheetSpec {
    const rows: any[][] = [
        [
            'Product',
            'Wholesaler',
            'Unit price',
            'Effective price',
            'Has discount',
            'Price discount %',
            'Bonus buy',
            'Bonus free',
            'Available units',
            'Pack',
            'Batch',
            'Expiry',
            'Days to expiry',
            'Covers order',
            'Savings on suggested',
            'Rank',
        ],
    ];

    for (const p of report.products) {
        p.wholesale_offers.forEach((o: LowStockOffer, idx: number) => {
            rows.push([
                p.product_title,
                o.wholesaler_title,
                o.unit_price,
                o.effective_unit_price,
                o.has_discount ? 'YES' : 'no',
                o.price_discount?.percent ?? '',
                o.quantity_discount?.limit_quantity ?? '',
                o.quantity_discount?.awarded_quantity ?? '',
                o.available_units,
                o.pack_size,
                o.batch,
                o.expiry_date ?? '',
                o.days_to_expiry ?? '',
                o.covers_suggested ? 'YES' : 'partial',
                o.savings_on_suggested,
                idx + 1,
            ]);
        });
    }

    return { name: 'Offers', rows };
}

/* ---------- Sheets 4+: One per wholesaler ---------- */

function buildWholesalerSheets(
    report: LowStockReportData,
): SheetSpec[] {
    const out: SheetSpec[] = [];

    for (const g of report.wholesaler_groups) {
        const rows: any[][] = [
            ['Suggested purchase order'],
            ['Wholesaler', g.wholesaler_title],
            ['As of', report.period.as_of],
            ['Lines', g.line_count],
            ['Total units', g.total_units],
            ['Total cost', g.total_cost],
            ['Total savings', g.total_savings],
            [],
            [
                'Product',
                'Current stock',
                'Suggested qty',
                'Unit cost',
                'Line cost',
                'Savings',
                'Urgency',
                'Offer price',
                'Has discount',
            ],
            ...g.products.map((p) => [
                p.product_title,
                p.current_stock,
                p.suggested_quantity,
                p.unit_cost,
                p.line_cost,
                p.savings_on_line,
                p.urgency,
                p.best_offer_price ?? '',
                p.best_offer_has_discount ? 'YES' : 'no',
            ]),
        ];

        // Excel sheet names cap at 31 characters. Truncate and
        // de-duplicate against names already used.
        const raw = (g.wholesaler_title || 'Unassigned').slice(0, 28);
        let name = `PO — ${raw}`;
        let suffix = 2;
        while (out.some((s) => s.name === name)) {
            name = `PO — ${raw.slice(0, 25)} ${suffix}`;
            suffix += 1;
        }

        out.push({ name, rows });
    }

    return out;
}

/* =========================================================
 * PDF
 *
 * Single HTML document with:
 *   - Header (entity + period)
 *   - KPI grid
 *   - Urgency + offer coverage
 *   - Suggested orders by wholesaler (PO-style)
 *   - Top products table with best offer
 *   - Full offers appendix (only if < 100 offers to keep it sane)
 * ======================================================= */

function esc(v: unknown): string {
    return String(v ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

const URGENCY_HEX: Record<string, string> = {
    OUT: '#dc2626',
    CRITICAL: '#ea580c',
    WARNING: '#f59e0b',
    SOON: '#0ea5e9',
};

export function buildLowStockHtml(
    report: LowStockReportData,
): string {
    const k = report.kpi;
    const generated = new Date().toLocaleString();

    /* ---- Urgency cards ---- */
    const urgencyCards = report.urgency_rollup
        .map(
            (u) => `
            <div class="urgency-card" style="border-color: ${URGENCY_HEX[u.key]}; background: ${URGENCY_HEX[u.key]}12;">
                <div class="urgency-label" style="color: ${URGENCY_HEX[u.key]};">${esc(u.label)}</div>
                <div class="urgency-count" style="color: ${URGENCY_HEX[u.key]};">${num(u.count)}</div>
                <div class="urgency-sub">${money(u.estimated_cost)}</div>
            </div>`,
        )
        .join('');

    /* ---- Wholesaler PO sections ---- */
    const wholesalerSections = report.wholesaler_groups
        .map((g: LowStockWholesalerGroup) => {
            const savings = parseFloat(g.total_savings);
            return `
            <h3>${esc(g.wholesaler_title)}
                <span class="small">
                    ${num(g.line_count)} lines ·
                    ${num(g.total_units)} units ·
                    ${money(g.total_cost)}
                    ${savings > 0 ? ` · <span style="color:#10b981;">save ${money(g.total_savings)}</span>` : ''}
                </span>
            </h3>
            <table>
                <thead><tr>
                    <th>Product</th>
                    <th class="num">Stock</th>
                    <th class="num">Order</th>
                    <th class="num">Unit cost</th>
                    <th class="num">Line cost</th>
                    <th class="num">Savings</th>
                    <th>Urgency</th>
                </tr></thead>
                <tbody>
                    ${g.products
                    .map(
                        (p) => `
                        <tr>
                            <td>${esc(p.product_title)}</td>
                            <td class="num">${num(p.current_stock)}</td>
                            <td class="num">${num(p.suggested_quantity)}</td>
                            <td class="num">${money(p.unit_cost)}</td>
                            <td class="num">${money(p.line_cost)}</td>
                            <td class="num" style="color:${parseFloat(p.savings_on_line) > 0 ? '#10b981' : '#64748b'};">
                                ${parseFloat(p.savings_on_line) > 0 ? money(p.savings_on_line) : '—'}
                            </td>
                            <td style="color:${URGENCY_HEX[p.urgency]}; font-weight: 600;">${p.urgency}</td>
                        </tr>`,
                    )
                    .join('')}
                </tbody>
            </table>`;
        })
        .join('');

    /* ---- Full product list ---- */
    const productRows = report.products
        .map((p: LowStockProductRow) => {
            const b = p.best_offer;
            const savings = parseFloat(p.best_offer_savings_on_suggested);
            const bestOfferCell = b
                ? `${esc(b.wholesaler_title)}${b.has_discount
                    ? ' <span style="color:#10b981; font-weight:600;">[DISCOUNT]</span>'
                    : ''
                }<br/><span class="small">${money(b.effective_unit_price)}/unit</span>`
                : '<span style="color:#94a3b8;">No offers</span>';

            return `
            <tr>
                <td>${esc(p.product_title)}</td>
                <td>${esc(p.category)}</td>
                <td class="num" style="color:${URGENCY_HEX[p.urgency]}; font-weight: 600;">${p.urgency}</td>
                <td class="num">${num(p.current_stock)}</td>
                <td class="num">${num(p.suggested_quantity)}</td>
                <td class="num">${daysCover(p.days_of_cover)}</td>
                <td class="num">${money(p.line_cost)}</td>
                <td>${bestOfferCell}</td>
                <td class="num" style="color:${savings > 0 ? '#10b981' : '#64748b'}; font-weight: 600;">
                    ${savings > 0 ? money(p.best_offer_savings_on_suggested) : '—'}
                </td>
            </tr>`;
        })
        .join('');

    /* ---- Offers appendix (bounded) ---- */
    const totalOffers = report.products.reduce(
        (sum, p) => sum + p.wholesale_offers.length,
        0,
    );

    const offersAppendix =
        totalOffers > 0 && totalOffers <= 100
            ? `
        <h2>All offers (${totalOffers})</h2>
        <table>
            <thead><tr>
                <th>Product</th><th>Wholesaler</th>
                <th class="num">Price</th>
                <th class="num">Effective</th>
                <th class="num">Available</th>
                <th class="num">Expiry</th>
                <th class="num">Covers</th>
                <th class="num">Savings</th>
            </tr></thead>
            <tbody>
                ${report.products
                .flatMap((p) =>
                    p.wholesale_offers.map(
                        (o: LowStockOffer) => `
                    <tr>
                        <td>${esc(p.product_title)}</td>
                        <td>${esc(o.wholesaler_title)}</td>
                        <td class="num">${money(o.unit_price)}</td>
                        <td class="num" style="color:${o.has_discount ? '#10b981' : '#0f172a'}; font-weight: ${o.has_discount ? '600' : '400'};">
                            ${money(o.effective_unit_price)}
                        </td>
                        <td class="num">${num(o.available_units)}</td>
                        <td class="num">${expiryLabel(o.days_to_expiry)}</td>
                        <td class="num">${o.covers_suggested ? 'Full' : 'Partial'}</td>
                        <td class="num" style="color:${parseFloat(o.savings_on_suggested) > 0 ? '#10b981' : '#64748b'};">
                            ${parseFloat(o.savings_on_suggested) > 0 ? money(o.savings_on_suggested) : '—'}
                        </td>
                    </tr>`,
                    ),
                )
                .join('')}
            </tbody>
        </table>`
            : totalOffers > 100
                ? `<p class="small" style="padding: 8px 0;">${totalOffers} offers attached — see the Excel export for the full list.</p>`
                : '';

    return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Low stock &amp; reorder</title>
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
    h3 {
        font-size: 12px;
        margin: 16px 0 6px;
    }
    .small { font-weight: 400; color: #64748b; font-size: 10px; margin-left: 6px; }
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
    .kpi.success .value { color: #10b981; }

    .urgency-grid {
        display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px;
    }
    .urgency-card {
        flex: 1 1 22%; min-width: 130px;
        border: 1px solid;
        border-radius: 6px;
        padding: 10px 12px;
    }
    .urgency-label {
        text-transform: uppercase; letter-spacing: 0.08em;
        font-size: 9px; font-weight: 700;
    }
    .urgency-count { font-size: 22px; font-weight: 700; margin-top: 4px; }
    .urgency-sub { font-size: 10px; color: #64748b; margin-top: 2px; }

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
    <h1>Low stock &amp; reorder</h1>
    <div class="meta">${esc(report.entity.title)}</div>
    <div class="meta">
        As of ${esc(report.period.as_of)} ·
        ${report.period.lookback_days}d velocity ·
        ${report.period.cover_days}d cover target
    </div>

    <div class="kpi-grid">
        <div class="kpi"><div class="label">To reorder</div><div class="value">${num(k.reorder_count)}</div></div>
        <div class="kpi danger"><div class="label">Out of stock</div><div class="value">${num(k.out_of_stock_count)}</div></div>
        <div class="kpi warn"><div class="label">Critical</div><div class="value">${num(k.critical_count)}</div></div>
        <div class="kpi"><div class="label">Estimated cost</div><div class="value">${money(k.estimated_total_cost)}</div><div class="sub">${num(k.estimated_total_units)} units</div></div>
        <div class="kpi"><div class="label">With offers</div><div class="value">${num(k.products_with_offers)}</div><div class="sub">${num(k.products_with_discounted_offers)} discounted</div></div>
        <div class="kpi success"><div class="label">Savings available</div><div class="value">${money(k.estimated_savings_on_orders)}</div></div>
    </div>

    <h2>By urgency</h2>
    <div class="urgency-grid">${urgencyCards}</div>

    <h2>Suggested orders by wholesaler</h2>
    ${wholesalerSections || '<p style="color:#64748b;">No orders to suggest.</p>'}

    <h2>All products (${report.products.length})</h2>
    <table>
        <thead><tr>
            <th>Product</th><th>Category</th><th>Urgency</th>
            <th class="num">Stock</th><th class="num">Order</th>
            <th class="num">Cover</th><th class="num">Line cost</th>
            <th>Best offer</th><th class="num">Savings</th>
        </tr></thead>
        <tbody>${productRows}</tbody>
    </table>

    ${offersAppendix}

    <div class="footer">Generated ${esc(generated)}</div>
</body>
</html>`;
}