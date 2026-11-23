// components/wholesalers/newWholesaleOrder/UnifiedBarcodeScanner.tsx
//
// Wholesale order scanner — the app-wide BarcodeScanner, accepting only codes in
// the catalogue passed in (wholesaler receipts / products expose `bar_code`).

import { BarcodeScanner } from '@/components/common/scanner/BarcodeScanner';

/** Anything with a barcode (wholesaler receipts, products). */
type ScannableItem = { bar_code?: string | null; title?: string | null; product_title?: string | null };

interface UnifiedBarcodeScannerProps {
    theme?: any;
    isOpen: boolean;
    productsCatalog: ScannableItem[];
    onScanSuccess: (scannedBarcode: string) => void;
    onCloseScanner: () => void;
}

export default function UnifiedBarcodeScanner({ isOpen, productsCatalog, onScanSuccess, onCloseScanner }: UnifiedBarcodeScannerProps) {
    return (
        <BarcodeScanner
            visible={isOpen}
            onClose={onCloseScanner}
            mode="continuous"
            title="Scan wholesale items"
            onScan={(code) => {
                const hit = productsCatalog.find((p) => p.bar_code === code);
                if (!hit) return { ok: false, message: `${code} isn't in your stock` };
                onScanSuccess(code);
                return { ok: true, label: hit.title ?? hit.product_title ?? undefined };
            }}
        />
    );
}
