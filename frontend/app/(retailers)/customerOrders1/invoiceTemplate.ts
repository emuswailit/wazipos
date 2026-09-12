import { OrderRecord } from './types';

/**
 * Compiles absolute order transaction datasets into a high-utility HTML structural template sheet.
 */
export const generateInvoiceHtml = (order: OrderRecord): string => {
    const itemsHtml = (order.order_items || [])
        .map(
            (item) => `
      <tr style="border-bottom: 1px solid #f1f5f9;">
        <td style="padding: 12px 0; font-size: 14px; color: #0f172a; font-weight: 600;">${item.title || 'Generic Product Item'}</td>
        <td style="padding: 12px 0; font-size: 14px; color: #475569; text-align: center;">${item.purchased_quantity}</td>
        <td style="padding: 12px 0; font-size: 14px; color: #475569; text-align: right;">KES ${Number(item.item_price || 0).toFixed(2)}</td>
        <td style="padding: 12px 0; font-size: 14px; color: #0f172a; text-align: right; font-weight: 700;">KES ${Number(item.item_price_total || 0).toFixed(2)}</td>
      </tr>
    `
        )
        .join('');

    return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Invoice ${order.order_number}</title>
      <style>
        body { font-family: system-ui, -apple-system, sans-serif; padding: 40px; color: #334155; background-color: #ffffff; }
        .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; border-b: 2px solid #f1f5f9; padding-bottom: 20px; }
        .title { font-size: 28px; font-weight: 900; color: #0f172a; margin: 0; }
        .meta-section { display: flex; justify-content: space-between; margin-bottom: 40px; background: #f8fafc; padding: 20px; border-radius: 12px; }
        .meta-block h3 { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; margin: 0 0 8px 0; }
        .meta-block p { font-size: 14px; font-weight: 700; color: #0f172a; margin: 0; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 40px; }
        th { text-transform: uppercase; font-size: 11px; letter-spacing: 0.05em; color: #64748b; padding-bottom: 12px; border-bottom: 2px solid #e2e8f0; }
        .totals-table { width: 300px; margin-left: auto; margin-right: 0; }
        .totals-row { display: flex; justify-content: justify; justify-content: space-between; padding: 8px 0; font-size: 14px; }
        .grand-total { display: flex; justify-content: space-between; padding: 12px 0; font-size: 18px; font-weight: 900; color: #0f172a; margin-top: 8px; border-top: 1px solid #cbd5e1; padding-top: 12px; }
      </style>
    </head>
    <body>
      <div class="header">
        <div>
          <h1 class="title">INVOICE</h1>
          <p style="font-size: 14px; color: #64748b; margin: 4px 0 0 0;">Reference: <b>${order.order_number}</b></p>
        </div>
        <div style="text-align: right;">
          <p style="font-size: 14px; font-weight: 700; color: #0f172a; margin: 0;">${order.entity_title || 'WAZIPOS RETAILER'}</p>
          <p style="font-size: 12px; color: #64748b; margin: 4px 0 0 0;">Date: ${order.created}</p>
        </div>
      </div>

      <div class="meta-section">
        <div class="meta-block">
          <h3>Billed To</h3>
          <p>${order.customer_name}</p>
          <p style="font-weight: 500; color: #475569; font-size: 13px; margin-top: 2px;">${order.phone || ''}</p>
        </div>
        <div class="meta-block" style="text-align: right;">
          <h3>Payment Status</h3>
          <p style="color: ${order.payment_status === 'SUCCESS' ? '#10b981' : '#f43f5e'}; text-transform: uppercase;">${order.payment_status || 'PENDING'}</p>
          <p style="font-weight: 500; color: #475569; font-size: 12px; margin-top: 2px;">Via ${order.selected_payment_method_title || 'CASH'}</p>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th style="text-align: left;">Item Description</th>
            <th style="text-align: center; width: 60px;">Qty</th>
            <th style="text-align: right; width: 120px;">Unit Price</th>
            <th style="text-align: right; width: 120px;">Total</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHtml}
        </tbody>
      </table>

      <div class="totals-table">
        <div class="totals-row" style="display: flex; justify-content: space-between;">
          <span style="color: #64748b;">Subtotal</span>
          <span style="font-weight: 600; color: #0f172a;">KES ${Number(order.order_net_price_total || 0).toFixed(2)}</span>
        </div>
        <div class="totals-row" style="display: flex; justify-content: space-between; margin-top: 4px;">
          <span style="color: #64748b;">Tax / VAT</span>
          <span style="font-weight: 600; color: #0f172a;">KES ${Number(order.order_tax_total || 0).toFixed(2)}</span>
        </div>
        <div class="grand-total">
          <span>Grand Total</span>
          <span>KES ${Number(order.order_price_total || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
        </div>
      </div>
    </body>
    </html>
  `;
};
