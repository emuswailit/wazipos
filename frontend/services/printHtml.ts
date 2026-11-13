// services/printHtml.ts
//
// Print an HTML document on web and native (the user can "Save as PDF" from the dialog).
//
//   Web:    expo-print ignores the HTML on web and prints the whole app window, so the
//           document is rendered in a hidden iframe and only that iframe is printed.
//   Native: expo-print opens the system print dialog with the HTML. If printing isn't
//           available on the device, a PDF is generated and the share sheet opened.

import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

/** Escape text for safe insertion into HTML. */
export function escapeHtml(value: unknown): string {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function printOnWeb(html: string, title: string): Promise<void> {
    return new Promise((resolve, reject) => {
        try {
            const iframe = document.createElement('iframe');
            iframe.setAttribute('aria-hidden', 'true');
            iframe.title = title;
            Object.assign(iframe.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' });
            document.body.appendChild(iframe);

            const cleanup = () => setTimeout(() => iframe.remove(), 1000);
            const doc = iframe.contentWindow?.document;
            if (!doc || !iframe.contentWindow) {
                iframe.remove();
                reject(new Error('Printing is not available in this browser.'));
                return;
            }

            doc.open();
            doc.write(html);
            doc.close();

            // Wait for the document (and any images) to load before printing.
            const go = () => {
                try {
                    iframe.contentWindow!.focus();
                    iframe.contentWindow!.print();
                    resolve();
                } catch (e) {
                    reject(e);
                } finally {
                    cleanup();
                }
            };
            if (doc.readyState === 'complete') setTimeout(go, 50);
            else iframe.onload = () => setTimeout(go, 50);
        } catch (e) {
            reject(e);
        }
    });
}

/**
 * Open a print dialog for `html`. Resolves when the dialog has been shown (or the PDF
 * shared on native when printing isn't available); rejects with a readable error.
 */
export async function printHtmlDocument(html: string, options: { title?: string } = {}): Promise<void> {
    const title = options.title || 'Document';

    if (Platform.OS === 'web') {
        await printOnWeb(html, title);
        return;
    }

    try {
        await Print.printAsync({ html });
    } catch (printError: any) {
        // The user closing the dialog is not an error.
        const msg = String(printError?.message ?? printError ?? '').toLowerCase();
        if (msg.includes('did not complete') || msg.includes('cancel')) return;

        // No print service (or it failed): fall back to a PDF file and the share sheet.
        const { uri } = await Print.printToFileAsync({ html });
        if (await Sharing.isAvailableAsync()) {
            await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: title, UTI: 'com.adobe.pdf' });
        } else {
            throw printError;
        }
    }
}
