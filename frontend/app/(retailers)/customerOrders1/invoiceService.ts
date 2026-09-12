import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import { generateInvoiceHtml } from './invoiceTemplate';
import { OrderRecord } from './types';

// Conditionally load native filesystem arrays to stop compilation breaks on Web targets
let FileSystem: any = null;
if (Platform.OS !== 'web') {
    FileSystem = require('expo-file-system');
}

export const invoiceService = {
    /**
     * Compiles HTML and triggers the system share manager sheets dialog
     */
    async shareReceipt(order: OrderRecord): Promise<void> {
        const htmlContent = generateInvoiceHtml(order);

        if (Platform.OS === 'web') {
            const targetWindow = window.open('', '_blank');
            if (targetWindow) {
                targetWindow.document.write(htmlContent);
                targetWindow.document.close();
                targetWindow.print();
            }
        } else {
            const { uri } = await Print.printToFileAsync({ html: htmlContent });
            await Sharing.shareAsync(uri, {
                mimeType: 'application/pdf',
                dialogTitle: `Share Invoice ${order.order_number}`,
                UTI: 'com.adobe.pdf'
            });
        }
    },

    /**
     * Generates document file blobs or native storage file paths to execute direct disk writes
     */
    async downloadPdf(order: OrderRecord): Promise<string | null> {
        const htmlContent = generateInvoiceHtml(order);
        const filename = `Invoice_${order.order_number || 'Order'}.pdf`;

        if (Platform.OS === 'web') {
            const { uri } = await Print.printToFileAsync({ html: htmlContent });
            const response = await fetch(uri);
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', filename);
            document.body.appendChild(link);
            link.click();
            link.parentNode?.removeChild(link);
            return 'web_success';
        }

        if (!FileSystem) return null;

        const { uri: tempUri } = await Print.printToFileAsync({ html: htmlContent });

        if (Platform.OS === 'android') {
            const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
            if (permissions.granted) {
                const base64Data = await FileSystem.readAsStringAsync(tempUri, { encoding: FileSystem.EncodingType.Base64 });
                const newFileUri = await FileSystem.StorageAccessFramework.createFileAsync(
                    permissions.directoryUri,
                    filename,
                    'application/pdf'
                );
                await FileSystem.writeAsStringAsync(newFileUri, base64Data, { encoding: FileSystem.EncodingType.Base64 });
                return 'android_success';
            }
            throw new Error('Storage write permission denied');
        } else {
            const targetUri = `${FileSystem.documentDirectory}${filename}`;
            await FileSystem.copyAsync({ from: tempUri, to: targetUri });
            return targetUri;
        }
    }
};
