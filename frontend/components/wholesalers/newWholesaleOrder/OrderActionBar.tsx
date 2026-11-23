// components/wholesalers/newWholesaleOrder/OrderActionBar.tsx

import { AddRowButton, SoftButton } from '@/components/ui/pos';
import { ScanLine } from 'lucide-react-native';
import { View } from 'react-native';

interface OrderActionBarProps {
    theme: any;
    onScanTrigger: () => void;
    onAddRowTrigger: () => void;
}

export default function OrderActionBar({ onScanTrigger, onAddRowTrigger }: OrderActionBarProps) {
    return (
        <View style={{ width: '100%', marginVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <AddRowButton label="Add item" onPress={onAddRowTrigger} />
            <SoftButton label="Scan" icon={ScanLine} tone="navy" onPress={onScanTrigger} />
        </View>
    );
}
