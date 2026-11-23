// components/common/UniversalScannerModal.tsx
//
// Continuous product scanner for tills (kept for existing screens) — a thin wrapper
// over the app-wide BarcodeScanner. Pass `lookup` to show the product name on each
// scan and flag codes that aren't in stock; the code is still handed to
// onBarcodeScanned either way (unknown scans are logged by the caller).

import React from 'react';

import { BarcodeScanner } from './scanner/BarcodeScanner';

interface UniversalScannerModalProps {
    visible: boolean;
    onClose: () => void;
    onBarcodeScanned: (barcode: string) => void;
    /** Find the product for a code: its title, or null when it isn't stocked here. */
    lookup?: (barcode: string) => { title: string } | null | undefined;
    title?: string;
    subtitle?: string;
}

export const UniversalScannerModal: React.FC<UniversalScannerModalProps> = ({ visible, onClose, onBarcodeScanned, lookup, title, subtitle }) => (
    <BarcodeScanner
        visible={visible}
        onClose={onClose}
        mode="continuous"
        title={title}
        subtitle={subtitle}
        onScan={(code) => {
            onBarcodeScanned(code);
            if (!lookup) return true;
            const hit = lookup(code);
            return hit ? { ok: true, label: hit.title } : { ok: false, message: `${code} isn't in this shop's stock` };
        }}
    />
);

export default UniversalScannerModal;
