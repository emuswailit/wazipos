// components/wholesalers/newWholesaleOrder/ProductManifestTable.tsx

import { SectionTitle } from '@/components/ui/pos';
import { View } from 'react-native';
import WholesaleItemRowItem from './WholesaleItemRowItem';
import type { WholesaleItemRow } from './useWholesaleOrderForm';

interface ProductManifestTableProps {
    theme: any;
    formRows: WholesaleItemRow[];
    onRemoveRow: (id: string) => void;
    onUpdateRow: (id: string, updatedFields: Partial<WholesaleItemRow>) => void;
    onTriggerScanner: () => void;
}

export default function ProductManifestTable({ formRows, onUpdateRow, onRemoveRow, onTriggerScanner }: ProductManifestTableProps) {
    const picked = formRows.filter((r) => !!r.selectedReceipt).length;
    return (
        <View style={{ marginTop: 18 }}>
            <SectionTitle step={2} title="Items" hint={picked ? `${picked} ${picked === 1 ? 'product' : 'products'} on this order` : 'Pick from your stock or scan barcodes'} />
            <View style={{ gap: 10 }}>
                {formRows.map((row, index) => (
                    <WholesaleItemRowItem key={row.id} row={row} index={index} onUpdateRow={onUpdateRow} onRemoveRow={onRemoveRow} onScanTrigger={onTriggerScanner} />
                ))}
            </View>
        </View>
    );
}
