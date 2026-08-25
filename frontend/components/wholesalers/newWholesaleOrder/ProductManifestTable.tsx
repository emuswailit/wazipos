import { Text, View } from 'react-native';
import { ProductCatalogItem, WholesaleItemRow } from '../../../app/(wholesalers)/newWholesaleOrder/types';
import WholesaleItemRowItem from './WholesaleItemRowItem';

interface ProductManifestTableProps {
    theme: any;
    formRows: WholesaleItemRow[];
    productsCatalog: ProductCatalogItem[];
    onAddRow: () => void;
    onRemoveRow: (id: string) => void;
    onUpdateRow: (id: string, updatedFields: Partial<WholesaleItemRow>) => void;
    onPopulateRow: (id: string, product: ProductCatalogItem, overrideQty?: string) => void;
    onTriggerScanner: () => void;
}
export default function ProductManifestTable({ theme, formRows, productsCatalog, onUpdateRow, onPopulateRow, onRemoveRow, onTriggerScanner }: ProductManifestTableProps) {
    return (
        <View className="mb-4 mt-2">
            <View className="mb-3 flex-none">
                <Text className="text-lg font-bold" style={{ color: theme.text }}>Product Entry Manifest</Text>
            </View>
            {formRows.map((row, index) => (
                <WholesaleItemRowItem key={row.id} row={row} index={index} productsCatalog={productsCatalog} onUpdateRow={onUpdateRow} onPopulateRow={(rowId, prod, overrideQty) => onPopulateRow(row.id, prod, overrideQty)} onRemoveRow={onRemoveRow} onScanTrigger={onTriggerScanner} />
            ))}
        </View>
    );
}
