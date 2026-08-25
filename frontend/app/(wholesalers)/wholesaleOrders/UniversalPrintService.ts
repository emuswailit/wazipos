import * as FileSystem from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

export async function generateAndPrintInvoice(order: any, currentTheme: any) {
    if (!order || !currentTheme) return;
    const isPaid = order.is_paid === 'true';
    const orderItems = order.order_items || [];
    const itemsRowsHtml = orderItems.map((item: any) => `
    <tr class="border-b" style="border-bottom-color: ${currentTheme.border || '#e2e8f0'};">
      <td class="py-2.5 px-1.5 text-[11px]" style="color: ${currentTheme.text || '#0f172a'};">
        <strong class="block">${item.product_title || item.title || 'N/A'}</strong>
        ${item.batch ? `<span class="text-[9px] font-mono" style="color: ${currentTheme.textDark || '#475569'};">Batch: ${item.batch}</span>` : ''}
      </td>
      <td class="py-2.5 px-1.5 text-[11px] text-center" style="color: ${currentTheme.text || '#0f172a'};">${item.purchased_quantity || item.unit_quantity || 0}</td>
      <td class="py-2.5 px-1.5 text-[11px] text-right font-mono" style="color: ${currentTheme.textDark || '#475569'};">KES ${parseFloat(item.item_net_price || item.item_price || 0).toFixed(2)}</td>
      <td class="py-2.5 px-1.5 text-[11px] text-right font-bold" style="color: ${currentTheme.text || '#0f172a'};">KES ${parseFloat(item.item_price_total || 0).toFixed(2)}</td>
    </tr>
  `).join('');
    const htmlInvoiceTemplate = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Invoice Statement</title>
      <script src="https://jsdelivr.net"></script>
      <style>
        @media print {
          body { background-color: #ffffff !important; color: #000000 !important; padding: 0; }
          .no-print { display: none; }
        }
      </style>
    </head>
    <body class="p-5" style="font-family: system-ui, sans-serif; color: ${currentTheme.text || '#0f172a'}; background-color: ${currentTheme.panel || '#ffffff'};">
      <div class="flex justify-between items-start border-b-2 pb-4 mb-5" style="border-bottom-color: ${currentTheme.primary || '#0056b3'};">
        <div>
          <h1 class="text-xl font-black m-0" style="color: ${currentTheme.primary || '#0056b3'};">${order.wholesaler_title || 'N/A'}</h1>
          <p class="text-[11px] mt-1 m-0" style="color: ${currentTheme.textDark || '#475569'};">Origin: ${order.order_origin || 'STAFF'}</p>
          ${order.wholesaler_postal_address ? `<p class="text-[11px] my-0.5">${order.wholesaler_postal_address}</p>` : ''}
          ${order.wholesaler_phone ? `<p class="text-[11px] my-0.5">Tel: ${order.wholesaler_phone}</p>` : ''}
        </div>
        <div class="text-right">
          <h2 class="text-xl font-black m-0 tracking-wide" style="color: ${currentTheme.textDark || '#475569'};">INVOICE</h2>
          <p class="text-[11px] font-bold mt-1 m-0">ID: ${order.reference_number || 'N/A'}</p>
          <div class="mt-1.5">
            <span class="inline-block px-2 py-0.5 text-[10px] font-black uppercase rounded ${isPaid ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'}">
              ${isPaid ? 'PAID' : 'PENDING'}
            </span>
          </div>
        </div>
      </div>
      <div class="flex justify-between items-start mb-8 gap-x-4">
        <div class="w-1/2">
          <div class="text-[11px] font-black uppercase tracking-wider pb-1 mb-1.5 border-b" style="color: ${currentTheme.textDark || '#475569'}; border-b-color: ${currentTheme.border || '#e2e8f0'};">Bill To</div>
          <h3 class="text-sm font-black m-0" style="color: ${currentTheme.text || '#0f172a'};">${order.retailer_title || 'Unknown Retailer'}</h3>
          ${order.retailer_postal_address ? `<p class="text-[11px] mt-1 mb-0" style="color: ${currentTheme.textDark || '#475569'};">${order.retailer_postal_address}</p>` : ''}
          ${order.retailer_phone ? `<p class="text-[11px] my-0.5">Tel: ${order.retailer_phone}</p>` : ''}
          ${order.retailer_email ? `<p class="text-[11px] my-0.5">Email: ${order.retailer_email}</p>` : ''}
        </div>
        <div class="w-1/2 text-right">
          <div class="text-[11px] font-black uppercase tracking-wider pb-1 mb-1.5 border-b text-right" style="color: ${currentTheme.textDark || '#475569'}; border-b-color: ${currentTheme.border || '#e2e8f0'};">Invoice Details</div>
          <p class="text-[11px] my-0.5"><span class="font-bold">Date:</span> ${order.created || 'N/A'}</p>
          <p class="text-[11px] my-0.5"><span class="font-bold">Payment:</span> ${order.payment_method_title || 'CASH'} (${order.order_terms || 'CASH'})</p>
          <p class="text-[11px] my-0.5"><span class="font-bold">Status:</span> ${order.status || 'SUBMITTED'}</p>
        </div>
      </div>
      <table class="w-full border-collapse mb-6">
        <thead>
          <tr class="border-b-2" style="background-color: ${currentTheme.background || '#f8fafc'}; border-b-color: ${currentTheme.border || '#e2e8f0'};">
            <th class="py-2 px-1.5 text-[11px] font-black uppercase text-left" style={{ color: currentTheme.textDark || '#475569' }}>Product Specification</th>
            <th class="py-2 px-1.5 text-[11px] font-black uppercase text-center w-[10%]" style={{ color: currentTheme.textDark || '#475569' }}>Qty</th>
            <th class="py-2 px-1.5 text-[11px] font-black uppercase text-right w-[15%]" style={{ color: currentTheme.textDark || '#475569' }}>Unit Price</th>
            <th class="py-2 px-1.5 text-[11px] font-black uppercase text-right w-[15%]" style={{ color: currentTheme.textDark || '#475569' }}>Total</th>
          </tr>
        </thead>
        <tbody>
          ${itemsRowsHtml}
        </tbody>
      </table>
      <div class="flex justify-end mt-4">
        <div class="w-[40%] flex flex-col gap-y-1">
          <div class="flex justify-between text-[11px]" style="color: ${currentTheme.textDark || '#475569'};"><span>Subtotal:</span> <span class="font-mono">KES ${parseFloat(order.order_price_total || 0).toFixed(2)}</span></div>
          <div class="flex justify-between text-[11px] text-rose-700"><span>Discount:</span> <span class="font-mono">-KES ${parseFloat(order.order_discount_total || 0).toFixed(2)}</span></div>
          <div class="flex justify-between text-[11px]" style="color: ${currentTheme.textDark || '#475569'};"><span>Tax Total:</span> <span class="font-mono">KES ${parseFloat(order.order_tax_total || 0).toFixed(2)}</span></div>
          <div class="flex justify-between text-[11px]" style="color: ${currentTheme.textDark || '#475569'};"><span>Shipping:</span> <span class="font-mono">KES ${parseFloat(order.shipping_amount || 0).toFixed(2)}</span></div>
          <div class="flex justify-between border-t-2 pt-2 mt-1.5 text-sm font-black" style="border-t-color: ${currentTheme.primary || '#0056b3'}; color: ${currentTheme.primary || '#0056b3'};">
            <span>Total Paid:</span> <span class="font-mono">KES ${parseFloat(order.final_price_total || order.order_price_total || 0).toFixed(2)}</span>
          </div>
        </div>
      </div>
      <p class="text-center text-[9px] border-t pt-2.5 mt-8" style="color: ${currentTheme.textDark || '#475569'}; border-t-color: ${currentTheme.border || '#e2e8f0'};">
        Thank you for your business. Generated securely via Wazipos Core Ledger Engine.
      </p>
    </body>
    </html>
  `;
    try {
        if (Platform.OS === 'web') {
            const windowPrintReference = window.open('', '_blank');
            if (windowPrintReference) {
                windowPrintReference.document.write(htmlInvoiceTemplate);
                windowPrintReference.document.close();
                windowPrintReference.focus();
                windowPrintReference.print();
            }
        } else {
            const { uri } = await Print.printToFileAsync({ html: htmlInvoiceTemplate });
            if (Platform.OS === 'ios') {
                await Print.printAsync({ uri });
            } else {
                const cleanRef = String(order.reference_number || 'Statement').replace(/[^a-zA-Z0-9-_]/g, '_');
                const secureCacheDirectoryUri = `${FileSystem.cacheDirectory}Invoice_${cleanRef}.pdf`;
                let sharePath = uri;
                try {
                    await FileSystem.copyAsync({
                        from: uri,
                        to: secureCacheDirectoryUri
                    });
                    sharePath = secureCacheDirectoryUri;
                } catch (moveError) {
                    console.warn('Fallback sharing route activated:', moveError);
                }
                const isAvailable = await Sharing.isAvailableAsync();
                if (isAvailable) {
                    await Sharing.shareAsync(sharePath, {
                        mimeType: 'application/pdf',
                        dialogTitle: 'Print/Share Invoice Statement'
                    });
                } else {
                    await Print.printAsync({ uri: sharePath });
                }
            }
        }
    } catch (error) {
        console.error('Invoice system printer routing failure:', error);
    }
}
