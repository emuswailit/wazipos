import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';

interface OrderManifestHeaderProps {
    theme: any;
    user: any;
    syncStatus: 'DRAFT' | 'SYNCED';
    isNetworkLoading: boolean;
    onResetWorkspaceTrigger: () => void;
}

export default function OrderManifestHeader({
    theme,
    user,
    syncStatus,
    isNetworkLoading,
    onResetWorkspaceTrigger
}: OrderManifestHeaderProps) {
    return (
        <View className="w-full">
            <View
                style={{
                    position: 'absolute', top: -12, right: 0, zIndex: 50,
                    backgroundColor: syncStatus === 'SYNCED' ? '#22c55e15' : '#f59e0b15',
                    borderColor: syncStatus === 'SYNCED' ? '#22c55e40' : '#f59e0b40'
                }}
                className="border px-3 py-1 rounded-full flex-row items-center gap-x-1.5 shadow-sm"
            >
                <View style={{ backgroundColor: syncStatus === 'SYNCED' ? '#22c55e' : '#f59e0b' }} className="w-2 h-2 rounded-full animate-ping" />
                <Text style={{ color: syncStatus === 'SYNCED' ? '#22c55e' : '#f59e0b' }} className="text-[10px] font-black tracking-widest uppercase">
                    {syncStatus === 'SYNCED' ? '✓ SYSTEM SYNCED' : '📝 LOCAL DRAFT'}
                </Text>
            </View>
            <View className="flex-row justify-between items-center mb-1">
                <Text className="text-2xl font-bold" style={{ color: theme.text }}>New Wholesale Order Form</Text>
                {isNetworkLoading && <ActivityIndicator size="small" color={theme.primary} />}
            </View>
            <View className="flex-row justify-between items-center mb-4">
                {user?.name ? (
                    <Text className="text-xs font-medium" style={{ color: theme.textDark }}>
                        Creating order as manager: <Text className="font-bold">{user.name}</Text>
                    </Text>
                ) : (
                    <View />
                )}
                <TouchableOpacity onPress={onResetWorkspaceTrigger} activeOpacity={0.6}>
                    <Text style={{ color: theme.primary }} className="text-xs font-black uppercase tracking-wide">
                        🔄 Reset Form / Start New
                    </Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}
