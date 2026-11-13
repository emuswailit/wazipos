// components/retailers/reports/productMovement/productMovementExport.ts

import type { SheetSpec } from '@/components/common/Exportable';
import type {
    DailySummaryRow,
    MovementRow,
    ProductMovementReportData,
    ReceiptBreakdownRow,
} from './ProductMovementReport';

/* =========================================================
 * Shared formatters
 * ======================================================= */

function num(v: string | number | null | undefined): string {
    const n = typeof v === 'string' ? parseFloat(v) : (v ?? 0);
    if (!Number.isFinite(n)) return '0';
    return n.toLocaleString('en-KE');
}

function signed(n: number): string {
    if (n === 0) return '0';
    return n > 0 ? `+${n}` : `${n}`;
}

function fmtDate(iso: string | null | undefined): string {
    if (!iso) return '';
    try {
        const d = new Date(iso);
        return d.toLocaleDateString('en-GB', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
        });
    } catch {
        return iso;
    }
}

function fmtDatetime(iso: string | null | undefined): string {
    if (!iso) return '';
    try {
        const d = new Date(iso);
        return d.toLocaleString('en-GB', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    } catch {
        return iso;
    }
}

function typeLabel(type: string): string {
    return type
        .replace(/_/g, ' ')
        .toLowerCase()
        .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Sanitise a string for use as an Excel sheet name.
 * Excel caps at 31 characters and forbids : \ / ? * [ ]
 */
function safeSheetName(s: string, fallback = 'Sheet'): string {
    const cleaned = (s || fallback)
        .replace(/[:\\\/\?\*\[\]]/g, '')
        .trim()
        .slice(0, 31);
    return cleaned || fallback;
}

/* =========================================================
 * Excel
 *
 * Sheets:
 *   1. Summary   — KPIs + period + product info
 *   2. Ledger    — every movement, chronological, with running balance
 *   3. Daily     — one row per day (in / out / net / balance)
 *   4. Batches   — per-batch breakdown
 * ======================================================= */

export function buildProductMovementSheets(
    report: ProductMovementReportData,
): SheetSpec[] {
    return [
        buildSummarySheet(report),
        buildLedgerSheet(report),
        buildDailySheet(report),
        buildBatchesSheet(report),
    ];
}

/* ---------- Sheet 1: Summary ---------- */

function buildSummarySheet(report: ProductMovementReportData): SheetSpec {
    const k = report.kpi;

    const rows: any[][] = [
        ['Product movement ledger'],
        ['Entity', report.entity.title],
        ['Product', report.product.title],
        ['Category', report.product.category ?? '—'],
        ['Receipt count', report.product.receipt_count],
        ['Current stock (live)', report.product.current_stock],
        [],
        ['Period', ''],
        ['From', report.period.from],
        ['To', report.period.to],
        ['Days', report.period.days],
        [],
        ['KPI', 'Value'],
        ['Opening balance', k.opening_balance],
        ['Total in', k.total_in],
        ['Total out', k.total_out],
        ['Net change', k.net_change],
        ['Closing balance', k.closing_balance],
        [],
        ['Movement count', k.movement_count],
        ['Receipts', k.receipts_count],
        ['Sales', k.sales_count],
        ['Adjustments', k.adjustments_count],
    ];

    return {
        name: safeSheetName('Summary'),
        rows,
    };
}

/* ---------- Sheet 2: Ledger ---------- */

function buildLedgerSheet(report: ProductMovementReportData): SheetSpec {
    const rows: any[][] = [
        [
            'Date',
            'Type',
            'Direction',
            'In',
            'Out',
            'Balance after',
            'Reference',
            'Batch',
            'Notes',
        ],
    ];

    // Opening balance row at the top
    rows.push([
        fmtDate(report.period.from),
        'OPENING',
        '—',
        '',
        '',
        report.kpi.opening_balance,
        'Opening balance',
        '',
        '',
    ]);

    for (const m of report.movements) {
        const isIn = m.direction === 'IN';
        rows.push([
            fmtDatetime(m.datetime),
            typeLabel(m.type),
            m.direction,
            isIn ? m.quantity : '',
            !isIn ? m.quantity : '',
            m.balance_after,
            m.reference || '',
            m.batch || '',
            m.note || '',
        ]);
    }

    return { name: safeSheetName('Ledger'), rows };
}

/* ---------- Sheet 3: Daily ---------- */

function buildDailySheet(report: ProductMovementReportData): SheetSpec {
    const rows: any[][] = [
        ['Date', 'In', 'Out', 'Net', 'Closing balance'],
    ];

    for (const d of report.daily_summary) {
        rows.push([
            d.date,
            d.in,
            d.out,
            d.net,
            d.balance,
        ]);
    }

    if (report.daily_summary.length === 0) {
        rows.push(['No daily data', '', '', '', '']);
    }

    return { name: safeSheetName('Daily'), rows };
}

/* ---------- Sheet 4: Batches ---------- */

function buildBatchesSheet(report: ProductMovementReportData): SheetSpec {
    const rows: any[][] = [
        [
            'Batch',
            'Expiry',
            'Received',
            'Sold',
            'On hand',
            'Status',
        ],
    ];

    for (const b of report.receipt_breakdown) {
        rows.push([
            b.batch || '(no batch)',
            b.expiry_date ? fmtDate(b.expiry_date) : '',
            b.received,
            b.sold,
            b.current,
            b.is_active ? 'Active' : 'Closed',
        ]);
    }

    if (report.receipt_breakdown.length === 0) {
        rows.push(['No batches', '', '', '', '', '']);
    }

    return { name: safeSheetName('Batches'), rows };
}

/* =========================================================
 * PDF
 *
 * Single HTML document:
 *   - Header (product + entity + period)
 *   - KPI grid
 *   - Daily movement summary table
 *   - Full ledger (paginated naturally by the print engine)
 *   - Per-batch breakdown
 * ======================================================= */

const TYPE_HEX: Record<string, string> = {
    RECEIPT: '#10b981',
    SALE: '#0ea5e9',
    ADJUSTMENT: '#64748b',
    CORRECTION: '#94a3b8',
    EXPIRY_WRITE_OFF: '#dc2626',
    DAMAGE_WRITE_OFF: '#ea580c',
    WHOLESALER_RETURN: '#f59e0b',
    CUSTOMER_RETURN: '#8b5cf6',
};

function esc(v: unknown): string {
    return String(v ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function signedWithColor(n: number, positive: string, negative: string, zero: string): string {
    if (n === 0) {
        return `<span style="color:${zero};">0</span>`;
    }
    const color = n > 0 ? positive : negative;
    const sign = n > 0 ? '+' : '−';
    return `<span style="color:${color}; font-weight: 600;">${sign}${Math.abs(n).toLocaleString('en-KE')}</span>`;
}

export function buildProductMovementHtml(
    report: ProductMovementReportData,
): string {
    const k = report.kpi;
    const generated = new Date().toLocaleString();

    /* ---- Daily summary rows ---- */
    const dailyRows = report.daily_summary
        .map(
            (d: DailySummaryRow) => `
            <tr>
                <td>${esc(fmtDate(d.date))}</td>
                <td class="num" style="color:${d.in > 0 ? '#10b981' : '#64748b'};">
                    ${d.in > 0 ? `+${num(d.in)}` : '—'}
                </td>
                <td class="num" style="color:${d.out > 0 ? '#f43f5e' : '#64748b'};">
                    ${d.out > 0 ? `−${num(d.out)}` : '—'}
                </td>
                <td class="num">${signedWithColor(d.net, '#10b981', '#f43f5e', '#64748b')}</td>
                <td class="num" style="font-weight:600;">${num(d.balance)}</td>
            </tr>`,
        )
        .join('');

    /* ---- Ledger rows ---- */
    const ledgerRows = report.movements
        .map((m: MovementRow) => {
            const tint = TYPE_HEX[m.type] || '#64748b';
            const isIn = m.direction === 'IN';
            return `
            <tr>
                <td>${esc(fmtDatetime(m.datetime))}</td>
                <td>
                    <span style="display:inline-block; padding:1px 6px; border-radius:8px; background:${tint}20; color:${tint}; font-size:9px; font-weight:600; letter-spacing:0.3px; text-transform:uppercase;">
                        ${esc(typeLabel(m.type))}
                    </span>
                </td>
                <td>${esc(m.reference || '—')}${m.batch
                    ? `<br/><span class="small">batch ${esc(m.batch)}</span>`
                    : ''
                }</td>
                <td class="num" style="color:${isIn ? '#10b981' : '#94a3b8'}; font-weight:${isIn ? '600' : '400'};">
                    ${isIn ? `+${num(m.quantity)}` : '—'}
                </td>
                <td class="num" style="color:${!isIn ? '#f43f5e' : '#94a3b8'}; font-weight:${!isIn ? '600' : '400'};">
                    ${!isIn ? `−${num(m.quantity)}` : '—'}
                </td>
                <td class="num" style="font-weight:600;">${num(m.balance_after)}</td>
            </tr>`;
        })
        .join('');

    /* ---- Batch rows ---- */
    const batchRows = report.receipt_breakdown
        .map(
            (b: ReceiptBreakdownRow) => `
            <tr>
                <td>${esc(b.batch || '(no batch)')}</td>
                <td>${b.expiry_date ? esc(fmtDate(b.expiry_date)) : '—'}</td>
                <td class="num">${num(b.received)}</td>
                <td class="num">${num(b.sold)}</td>
                <td class="num" style="font-weight:600; color:#0ea5e9;">${num(b.current)}</td>
                <td>
                    <span style="display:inline-block; padding:1px 6px; border-radius:8px; background:${b.is_active ? '#10b98120' : '#64748b20'}; color:${b.is_active ? '#10b981' : '#64748b'}; font-size:9px; font-weight:600; letter-spacing:0.3px; text-transform:uppercase;">
                        ${b.is_active ? 'Active' : 'Closed'}
                    </span>
                </td>
            </tr>`,
        )
        .join('');

    return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Product movement — ${esc(report.product.title)}</title>
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
    .small { font-weight: 400; color: #64748b; font-size: 9px; }

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
    .kpi.success .value { color: #10b981; }
    .kpi.danger .value { color: #f43f5e; }
    .kpi.primary .value { color: #0ea5e9; }

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
    tr.opening td {
        background: #f8fafc;
        font-weight: 600;
        color: #64748b;
    }
    .footer {
        margin-top: 24px; font-size: 9px; color: #94a3b8;
        text-align: center;
    }
</style>
</head>
<body>
    <h1>${esc(report.product.title)}</h1>
    <div class="meta">${esc(report.entity.title)}${report.product.category
            ? ` · ${esc(report.product.category)}`
            : ''
        }</div>
    <div class="meta">
        Period: ${esc(report.period.from)} → ${esc(report.period.to)}
        (${report.period.days} day${report.period.days === 1 ? '' : 's'})
        · ${report.product.receipt_count} receipt${report.product.receipt_count === 1 ? '' : 's'}
    </div>

    <h2>Key metrics</h2>
    <div class="kpi-grid">
        <div class="kpi"><div class="label">Opening balance</div><div class="value">${num(k.opening_balance)}</div></div>
        <div class="kpi success"><div class="label">Total in</div><div class="value">+${num(k.total_in)}</div><div class="sub">${num(k.receipts_count)} receipts</div></div>
        <div class="kpi danger"><div class="label">Total out</div><div class="value">−${num(k.total_out)}</div><div class="sub">${num(k.sales_count)} sales · ${num(k.adjustments_count)} adjustments</div></div>
        <div class="kpi primary"><div class="label">Net change</div><div class="value">${signed(k.net_change)}</div></div>
        <div class="kpi"><div class="label">Closing balance</div><div class="value">${num(k.closing_balance)}</div></div>
        <div class="kpi"><div class="label">Movements</div><div class="value">${num(k.movement_count)}</div></div>
    </div>

    ${report.daily_summary.length > 0
            ? `
    <h2>Daily movement</h2>
    <table>
        <thead><tr>
            <th>Date</th>
            <th class="num">In</th>
            <th class="num">Out</th>
            <th class="num">Net</th>
            <th class="num">Closing balance</th>
        </tr></thead>
        <tbody>${dailyRows}</tbody>
    </table>`
            : ''
        }

    <h2>Ledger (${report.movements.length} movements)</h2>
    ${report.movements.length === 0
            ? '<p style="color:#64748b;">No movements in this period.</p>'
            : `
    <table>
        <thead><tr>
            <th>Date</th>
            <th>Type</th>
            <th>Reference</th>
            <th class="num">In</th>
            <th class="num">Out</th>
            <th class="num">Balance</th>
        </tr></thead>
        <tbody>
            <tr class="opening">
                <td colspan="5">Opening balance</td>
                <td class="num">${num(k.opening_balance)}</td>
            </tr>
            ${ledgerRows}
        </tbody>
    </table>`
        }

    ${report.receipt_breakdown.length > 0
            ? `
    <h2>Batches (${report.receipt_breakdown.length})</h2>
    <table>
        <thead><tr>
            <th>Batch</th>
            <th>Expiry</th>
            <th class="num">Received</th>
            <th class="num">Sold</th>
            <th class="num">On hand</th>
            <th>Status</th>
        </tr></thead>
        <tbody>${batchRows}</tbody>
    </table>`
            : ''
        }

    <div class="footer">Generated ${esc(generated)}</div>
</body>
</html>`;
}