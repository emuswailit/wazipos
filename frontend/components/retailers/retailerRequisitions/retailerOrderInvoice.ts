// components/retailers/retailerRequisitions/retailerOrderInvoice.ts
//
// Printable invoice (HTML -> PDF) for a paid retailer order: the wholesaler
// is the seller, the retailer the buyer. Printed / shared with exportToPdf
// (components/common/Exportable): print dialog on web, PDF share sheet on phones.

import type { RetailerOrder } from '@/databases/types';

import { formatKES, orderRef } from './primitives';

const esc = (v: unknown) =>
    String(v ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

const num = (v: unknown) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
};

const kes = (n: number) => `KES ${formatKES(n)}`;

const fmtDate = (raw?: string | null) => {
    if (!raw) return '';
    const d = new Date(String(raw).replace(' ', 'T'));
    return Number.isNaN(d.getTime()) ? String(raw) : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' });
};

/** "Name\nP.O. Box 1 - 00100 Town\nphone · email" (whatever the order carries). */
function party(o: any, side: 'wholesaler' | 'retailer'): string {
    const title = o[`${side}_title`];
    const box = o[`${side}_postal_address`];
    const code = o[`${side}_postal_code`];
    const town = o[`${side}_postal_town`];
    const postal = [box ? `P.O. Box ${box}` : '', code, town].filter(Boolean).join(box && code ? ' - ' : ' ');
    const contact = [o[`${side}_phone`], o[`${side}_email`]].filter(Boolean).join(' · ');
    return [
        `<div class="party-name">${esc(title || (side === 'wholesaler' ? 'Wholesaler' : 'Retailer'))}</div>`,
        postal ? `<div>${esc(postal)}</div>` : '',
        contact ? `<div>${esc(contact)}</div>` : '',
    ].join('');
}

export function invoiceFilename(order: RetailerOrder): string {
    return `Invoice-${orderRef(order).replace(/[^\w.-]+/g, '_')}.pdf`;
}

export function buildRetailerOrderInvoiceHtml(order: RetailerOrder): string {
    const o = order as any;
    const items = order.order_items ?? [];
    const total = num(order.final_price_total); // goods; shipping is added below
    const gross = num(order.order_gross_price_total) || total;
    const discount = num(order.order_discount_total);
    const shipping = num(order.shipping_amount);
    const paidTotal = num(o.payment_summary?.paid_total) || total + shipping;
    const method = order.payment_method_title && order.payment_method_title !== 'N/A' ? order.payment_method_title : '';
    const psp = order.psp_reference_number && order.psp_reference_number !== 'N/A' ? order.psp_reference_number : '';
    const provider = order.provider_reference_number && order.provider_reference_number !== 'N/A' ? order.provider_reference_number : '';

    const rows = items
        .map((it, i) => {
            const qty = num(it.purchased_quantity);
            const bonus = num(it.discount_quantity);
            const line = num(it.item_final_price_total ?? it.item_price_total);
            const unit = num(it.item_final_price) || (qty ? line / qty : 0);
            const meta = [it.batch ? `Batch ${it.batch}` : '', it.expiry_date ? `Exp ${it.expiry_date}` : '', bonus > 0 ? `+${bonus} free` : '']
                .filter(Boolean)
                .join(' · ');
            return `<tr>
  <td class="c">${i + 1}</td>
  <td><div class="item">${esc(it.product_title || 'Item')}</div>${meta ? `<div class="muted">${esc(meta)}</div>` : ''}</td>
  <td class="r">${qty.toLocaleString()}</td>
  <td class="r">${esc(formatKES(unit))}</td>
  <td class="r">${esc(formatKES(line))}</td>
</tr>`;
        })
        .join('');

    return `<!doctype html>
<html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Invoice ${esc(orderRef(order))}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; color: #0f172a; margin: 0; padding: 32px; font-size: 12px; }
  .top { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; }
  h1 { font-size: 26px; margin: 0 0 4px; letter-spacing: 1px; }
  .muted { color: #64748b; font-size: 11px; }
  .stamp { border: 2px solid #10b981; color: #10b981; font-weight: 800; letter-spacing: 2px; padding: 6px 14px; border-radius: 8px; font-size: 16px; transform: rotate(-4deg); }
  .meta { margin-top: 18px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
  .meta div span { display: block; color: #64748b; font-size: 10px; text-transform: uppercase; letter-spacing: .6px; }
  .parties { margin-top: 22px; display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .box { border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px; line-height: 1.5; }
  .box .label { color: #64748b; font-size: 10px; text-transform: uppercase; letter-spacing: .6px; margin-bottom: 4px; }
  .party-name { font-weight: 700; font-size: 13px; }
  table { width: 100%; border-collapse: collapse; margin-top: 22px; }
  th { background: #f1f5f9; text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: .6px; color: #475569; padding: 8px; }
  td { padding: 8px; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
  .item { font-weight: 600; }
  .r { text-align: right; white-space: nowrap; } .c { text-align: center; width: 28px; }
  .totals { margin-top: 14px; margin-left: auto; width: 280px; }
  .totals div { display: flex; justify-content: space-between; padding: 4px 0; }
  .totals .grand { border-top: 2px solid #0f172a; margin-top: 4px; padding-top: 8px; font-size: 15px; font-weight: 800; }
  .paid { margin-top: 18px; border-radius: 10px; background: #ecfdf5; color: #065f46; padding: 12px; line-height: 1.6; }
  .foot { margin-top: 28px; text-align: center; }
  @media print { body { padding: 16px; } }
</style></head>
<body>
  <div class="top">
    <div>
      <h1>INVOICE</h1>
      <div class="muted">Order ${esc(orderRef(order))}</div>
    </div>
    <div class="stamp">PAID</div>
  </div>

  <div class="meta">
    <div><span>Invoice no.</span>${esc(order.document_number_display && order.document_number_display !== 'N/A' ? order.document_number_display : orderRef(order))}</div>
    <div><span>Order date</span>${esc(fmtDate(order.created))}</div>
    <div><span>Paid on</span>${esc(fmtDate(o.paid_at || order.updated) || '—')}</div>
  </div>

  <div class="parties">
    <div class="box"><div class="label">From (supplier)</div>${party(o, 'wholesaler')}</div>
    <div class="box"><div class="label">Bill to</div>${party(o, 'retailer')}${order.owner_title ? `<div class="muted">Ordered by ${esc(order.owner_title)}</div>` : ''}</div>
  </div>

  <table>
    <thead><tr><th class="c">#</th><th>Item</th><th class="r">Qty</th><th class="r">Unit (KES)</th><th class="r">Amount (KES)</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="5" class="muted">No items.</td></tr>'}</tbody>
  </table>

  <div class="totals">
    <div><span>Subtotal</span><span>${esc(kes(gross))}</span></div>
    ${discount > 0 ? `<div><span>Discounts</span><span>− ${esc(kes(discount))}</span></div>` : ''}
    ${shipping > 0 ? `<div><span>Shipping</span><span>${esc(kes(shipping))}</span></div>` : ''}
    <div class="grand"><span>Total</span><span>${esc(kes(total + shipping))}</span></div>
  </div>

  <div class="paid">
    <strong>Paid ${esc(kes(paidTotal))}</strong>${method ? ` by ${esc(method)}` : ''}<br/>
    ${psp ? `Payment ref: ${esc(psp)}` : ''}${psp && provider ? ' · ' : ''}${provider ? `Provider ref: ${esc(provider)}` : ''}
  </div>

  <div class="foot muted">Generated by WaziPOS · ${esc(new Date().toLocaleString())}</div>
</body></html>`;
}
