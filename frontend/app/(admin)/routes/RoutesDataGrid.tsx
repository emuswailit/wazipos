import { useAuth } from '@/context/AuthContext';
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import CreateRouteForm from './CreateRouteForm';
import { CustomModal } from './CustomModal'; // Use your standard app Modal component
import RoutesDataGrid, { DataPayload } from './RoutesDataGrid';

export default function RoutesScreen() {
    const { theme } = useAuth();
    const [searchQuery, setSearchQuery] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [isCreateOpen, setIsCreateOpen] = useState(false);

    // 🌟 Simulated API Data Hook Layer (Plug your actual useApi or react-query layer here)
    const [itemsList, setItemsList] = useState<DataPayload[]>([
        {
            id: "16b7c961-7f85-468b-852c-b24f29ed9287",
            title: "DRUGS ACTING AGAINST INFECTIONS",
            description: "Pharmacology, antimicrobial agents, and antiparasitic metrics.",
            owner: "2f890514-2ea6-418f-ac2d-06b281579d4e",
            images: [],
            entity: "165f2dd8-f092-42c9-afa1-f32260bc11f7",
            created: "2026-08-01 09:51:29",
            updated: "2026-08-01 09:51:29"
        }
    ]);
    const [isLoading, setIsLoading] = useState(false);

    // Real-time Text Filtering Pipeline
    const filteredItems = useMemo(() => {
        return itemsList.filter(item =>
            item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
            item.description.toLowerCase().includes(searchQuery.toLowerCase())
        );
    }, [itemsList, searchQuery]);

    // Reset page layout frame position safely on new text queries
    React.useEffect(() => { setCurrentPage(1); }, [searchQuery]);

    const handleCreateSuccess = (newRoute: DataPayload) => {
        setItemsList(prev => [newRoute, ...prev]);
        setIsCreateOpen(false);
    };

    if (isLoading) {
        return (
            <View className="flex-1 items-center justify-center" style={{ backgroundColor: theme.background }}>
                <ActivityIndicator color={theme.primary} size="large" />
            </View>
        );
    }

    return (
        <View className="flex-1 mt-12 md:mt-0 p-4 md:p-6 w-full max-w-[1200px] mx-auto">

            {/* Search Input Bar & Add Actions Row */}
            <View className="flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
                <View className="flex-1 flex-col md:flex-row gap-3">
                    <TextInput
                        className="flex-1 px-4 h-[50px] md:h-[40px] rounded-xl border text-sm font-medium"
                        style={{ backgroundColor: theme.surface, borderColor: theme.border, color: theme.primary }}
                        placeholder="Search by title or description..."
                        placeholderTextColor="#94A3B8"
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                    />
                    <Pressable
                        onPress={() => setIsCreateOpen(true)}
                        className="px-5 h-[50px] md:h-[40px] rounded-xl flex-row justify-center items-center active:opacity-80"
                        style={{ backgroundColor: theme.primary }}
                    >
                        <Text className="text-white font-bold text-sm tracking-wide">+ ADD NEW ROUTE</Text>
                    </Pressable>
                </View>

                {/* Dynamic Items Counter Badge */}
                <View className="self-start md:self-auto px-4 py-2 rounded-full border" style={{ borderColor: theme.border }}>
                    <Text className="text-xs font-bold text-slate-500">
                        SHOWING <Text style={{ color: theme.primary }}>{filteredItems.length}</Text> OF {itemsList.length} ENTRIES
                    </Text>
                </View>
            </View>

            {/* 🌟 Layout Data Grid Component Injection */}
            <RoutesDataGrid
                items={filteredItems}
                currentPage={currentPage}
                onPageChange={setCurrentPage}
            />

            {/* Add Route Form Modal Wrapper */}
            <CustomModal visible={isCreateOpen} onClose={() => setIsCreateOpen(false)}>
                <View className="mb-4">
                    <Text className="text-lg font-black tracking-tight mb-1" style={{ color: theme.primary }}>Create Asset Route</Text>
                    <Text className="text-xs text-slate-400">Populate structural telemetry metrics cleanly.</Text>
                </View>
                <CreateRouteForm
                    onSuccess={handleCreateSuccess}
                    onCancel={() => setIsCreateOpen(false)}
                />
            </CustomModal>
        </View>
    );
}
