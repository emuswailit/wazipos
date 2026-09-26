// components/wholesalers/newWholesaleOrder/ProductManifestTable.tsx

import { Text, View } from 'react-native';
import WholesaleItemRowItem from './WholesaleItemRowItem';
import type { WholesaleItemRow } from './useWholesaleOrderForm';

interface ProductManifestTableProps {
    theme: any;
    formRows: WholesaleItemRow[];
    onRemoveRow: (id: string) => void;
    onUpdateRow: (
        id: string,
        updatedFields: Partial<WholesaleItemRow>
    ) => void;
    onTriggerScanner: () => void;
}

export default function ProductManifestTable({
    theme,
    formRows,
    onUpdateRow,
    onRemoveRow,
    onTriggerScanner,
}: ProductManifestTableProps) {
    return (
        <View className="mb-4 mt-2">
            <View className="mb-3 flex-none">
                <Text
                    className="text-lg font-bold"
                    style={{
                        color: theme.text,
                        fontFamily: theme.font?.bold,
                    }}
                >
                    Product Entry Manifest
                </Text>
            </View>

            {formRows.map((row, index) => (
                <WholesaleItemRowItem
                    key={row.id}
                    row={row}
                    index={index}
                    onUpdateRow={onUpdateRow}
                    onRemoveRow={onRemoveRow}
                    onScanTrigger={onTriggerScanner}
                />
            ))}
        </View>
    );
}