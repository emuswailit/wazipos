// components/jobs/cv/cvExport.ts
//
// Getting a CV out of the app:
//   · Phones: a real PDF is made on the device (expo-print → app cache) and shared
//     through the system sheet — WhatsApp, Gmail / email, Drive, Bluetooth, "Print"…
//     Printing goes straight to the system print dialog.
//   · Web: browsers can't hand a generated file to WhatsApp, so the CV opens in a
//     print dialog ("Save as PDF" / print), and sharing uses the CV's link.

import { toast } from '@/components/common/Toast';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Linking, Platform } from 'react-native';

const isWeb = Platform.OS === 'web';
// A4 at 72 PPI.
const A4 = { width: 595, height: 842 };

/** Web: print exactly this HTML (not the app page) through a hidden iframe. */
function printHtmlOnWeb(html: string, title: string) {
    if (typeof document === 'undefined') return;
    const frame = document.createElement('iframe');
    Object.assign(frame.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' });
    document.body.appendChild(frame);
    const doc = frame.contentWindow?.document;
    if (!doc || !frame.contentWindow) {
        frame.remove();
        return;
    }
    doc.open();
    doc.write(html);
    doc.close();
    doc.title = title;
    const go = () => {
        try {
            frame.contentWindow?.focus();
            frame.contentWindow?.print();
        } finally {
            setTimeout(() => frame.remove(), 1500);
        }
    };
    // Let fonts load before printing.
    setTimeout(go, 600);
}

/** A PDF file of the CV on this phone (cache). */
export async function makePdf(html: string): Promise<string> {
    const { uri } = await Print.printToFileAsync({ html, ...A4 });
    return uri;
}

/** Save / share as PDF. Phones: share sheet with the PDF. Web: print dialog → Save as PDF. */
export async function sharePdf(html: string, fileTitle: string) {
    if (isWeb) {
        printHtmlOnWeb(html, fileTitle);
        toast.info('Save as PDF', 'In the print window choose “Save as PDF” as the printer.');
        return;
    }
    try {
        const uri = await makePdf(html);
        if (!(await Sharing.isAvailableAsync())) {
            toast.warning('Sharing not available', 'This phone can’t open the share sheet.');
            return;
        }
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: `Share ${fileTitle}` });
    } catch (e: any) {
        toast.error('Couldn’t make the PDF', String(e?.message ?? 'Try again.'));
    }
}

export async function printCv(html: string, fileTitle: string) {
    if (isWeb) {
        printHtmlOnWeb(html, fileTitle);
        return;
    }
    try {
        await Print.printAsync({ html, ...A4 });
    } catch (e: any) {
        if (!/cancel/i.test(String(e?.message))) toast.error('Couldn’t print', String(e?.message ?? 'Try again.'));
    }
}

/** Share the CV's link (needs sharing switched on): system share, WhatsApp or email. */
export async function shareLink(url: string, name: string, via: 'any' | 'whatsapp' | 'email' = 'any') {
    const text = `${name ? `${name}'s CV` : 'My CV'}: ${url}`;
    if (via === 'whatsapp') return Linking.openURL(`https://wa.me/?text=${encodeURIComponent(text)}`);
    if (via === 'email') return Linking.openURL(`mailto:?subject=${encodeURIComponent(name ? `${name} — CV` : 'My CV')}&body=${encodeURIComponent(text)}`);
    const nav: any = isWeb && typeof navigator !== 'undefined' ? navigator : null;
    try {
        if (isWeb) {
            if (nav?.share) return await nav.share({ title: 'CV', text, url });
            await nav?.clipboard?.writeText(url);
            toast.success('Link copied', 'Paste it into WhatsApp, email or anywhere.');
            return;
        }
        const { Share } = require('react-native');
        await Share.share({ message: text, url });
    } catch (e: any) {
        if (String(e?.name) !== 'AbortError') toast.warning('Couldn’t share', url);
    }
}

/** A PDF file the job application can upload (phones only). */
export async function pdfForUpload(html: string, fileName: string): Promise<{ uri: string; name: string; type: string } | null> {
    if (isWeb) return null;
    const uri = await makePdf(html);
    return { uri, name: fileName, type: 'application/pdf' };
}
