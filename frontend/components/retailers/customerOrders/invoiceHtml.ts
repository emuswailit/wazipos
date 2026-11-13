// components/retailers/customerOrders/invoiceHtml.ts
//
// Printable HTML invoice for a customer order (used by InvoiceModal's "Print PDF").

import type { CustomerOrder } from '@/databases/types';
import { escapeHtml } from '@/services/printHtml';
import { isTrueFlag } from '@/utils/flags';

const num = (v: unknown): number => {
    const n = parseFloat(String(v ?? ''));
    return Number.isFinite(n) ? n : 0;
};

const money = (v: unknown): string =>
    `KES ${num(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const date = (raw: unknown): string => {
    if (!raw) return '';
    const d = new Date(String(raw).replace(' ', 'T'));
    return Number.isNaN(d.getTime())
        ? String(raw)
        : d.toLocaleString(undefined, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

export function buildCustomerOrderInvoiceHtml(order: CustomerOrder, opts: { customerName?: string } = {}): string {
    const o: any = order;
    const paid = isTrueFlag(o.is_paid);
    const items: any[] = Array.isArray(o.order_items) ? o.order_items : [];
    const total = num(o.total_amount || o.order_price_total || o.order_net_price_total);
    const discount = num(o.order_price_discount_total);
    const shipping = num(o.shipping_cost);
    const method = String(o.selected_payment_method_title || '').toUpperCase();
    const ref = o.order_number || '—';

    const rows = items
        .map((it, i) => {
            const qty = num(it.purchased_quantity) || 1;
            const lineTotal = num(it.item_price_total) || num(it.final_unit_selling_price ?? it.unit_selling_price) * qty;
            return `<tr>
                <td class="n">${i + 1}</td>
                <td>${escapeHtml(it.title || it.receipt_details?.product_title || 'Product')}</td>
                <td class="r">${qty}</td>
                <td class="r">${escapeHtml(money(qty ? lineTotal / qty : 0))}</td>
                <td class="r">${escapeHtml(money(lineTotal))}</td>
            </tr>`;
        })
        .join('');

    const detail = (label: string, value: unknown) =>
        value ? `<div class="kv"><span>${escapeHtml(label)}</span><b>${escapeHtml(value)}</b></div>` : '';

    return `<!doctype html>
<html><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Invoice ${escapeHtml(ref)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; color: #0f172a; margin: 0; padding: 24px; font-size: 12px; }
  h1 { font-size: 20px; margin: 0; letter-spacing: .5px; }
  .muted { color: #64748b; }
  .top { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; border-bottom: 2px solid #0f172a; padding-bottom: 12px; }
  .badge { display: inline-block; padding: 3px 10px; border-radius: 999px; font-weight: 700; font-size: 11px; letter-spacing: .5px;
           background: ${paid ? '#d1fae5' : '#ffe4e6'}; color: ${paid ? '#047857' : '#be123c'}; }
  .grid { display: flex; flex-wrap: wrap; gap: 8px 32px; margin: 16px 0; }
  .kv { min-width: 200px; } .kv span { display: block; color: #64748b; font-size: 11px; } .kv b { font-size: 13px; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: .4px; color: #475569; background: #f1f5f9; padding: 8px; }
  td { padding: 8px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
  .r { text-align: right; } .n { width: 28px; color: #94a3b8; }
  .totals { margin-left: auto; width: 280px; margin-top: 12px; }
  .totals div { display: flex; justify-content: space-between; padding: 4px 0; }
  .totals .grand { border-top: 2px solid #0f172a; margin-top: 4px; padding-top: 8px; font-size: 15px; font-weight: 800; }
  .foot { margin-top: 28px; text-align: center; color: #94a3b8; font-size: 11px; }
  @media print { body { padding: 12mm; } }
</style></head>
<body>
  <div class="top">
    <div>
      <h1>${escapeHtml(o.entity_title || 'Invoice')}</h1>
      <div class="muted">Customer invoice</div>
    </div>
    <div style="text-align:right">
      <div style="font-size:16px;font-weight:800">#${escapeHtml(ref)}</div>
      <div class="muted">${escapeHtml(date(o.created))}</div>
      <div style="margin-top:6px"><span class="badge">${paid ? 'PAID' : 'UNPAID'}</span></div>
    </div>
  </div>

  <div class="grid">
    ${detail('Customer', opts.customerName || o.customer_name || 'Walk-in Customer')}
    ${detail('Phone', o.customer_phone)}
    ${detail('Payment method', method)}
    ${detail('Delivery', o.delivery_method)}
    ${!paid && method === 'CREDIT' ? detail('Due date', o.due_date ? date(o.due_date).split(',')[0] : '') : ''}
    ${detail('Payment reference', o.provider_reference_number || o.psp_reference_number)}
  </div>

  <table>
    <thead><tr><th class="n">#</th><th>Item</th><th class="r">Qty</th><th class="r">Unit price</th><th class="r">Amount</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="5" class="muted">No items</td></tr>'}</tbody>
  </table>

  <div class="totals">
    ${discount > 0 ? `<div><span>Discount</span><span>- ${escapeHtml(money(discount))}</span></div>` : ''}
    ${shipping > 0 ? `<div><span>Shipping</span><span>${escapeHtml(money(shipping))}</span></div>` : ''}
    <div class="grand"><span>${paid ? 'Total paid' : 'Total due'}</span><span>${escapeHtml(money(total))}</span></div>
  </div>

  <div class="foot">Thank you for your business · Printed ${escapeHtml(date(new Date().toISOString()))}</div>
</body></html>`;
}
