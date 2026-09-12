import React from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import IndentSummaryFooter from './IndentSummaryFooter';
import ProcurementHeaderDeck from "./ProcurementHeaderDeck";
import ProcurementListMatrix from './ProcurementListMatrix';
import { useProcurementWorkspace } from './useProcurementWorkspace';

export default function ProcurementWorkspaceDashboard() {
    const {
        theme, isDarkMode, isLarge, searchQuery, setSearchQuery, daysToOrder, setDaysToOrder, leadTimeDays, setLeadTimeDays,
        lookbackWindow, setLookbackWindow, budgetCap, setBudgetCap, maxShelfDays, setMaxShelfDays, onlyShowBacklog, setOnlyShowBacklog,
        currentPage, setCurrentPage, itemsPerPage, setItemsPerPage, isHydrating, getPredictionsApi, generateOrdersApi, selectedOffers,
        matrixData, indentDocumentData, isBudgetBreached, isAllSelected, handleFetchParams, handleSelectAll, handleToggleOffer,
        handleCheckoutCommit
    } = useProcurementWorkspace();

    if (isHydrating) {
        return (
            <View style={{ backgroundColor: theme.background }} className="flex-1 items-center justify-center p-6">
                <ActivityIndicator size="large" color={theme.primary} />
                <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.base, color: theme.textDark }} className="mt-4 text-center">Loading Local Cache Workbench...</Text>
            </View>
        );
    }

    return (
        <SafeAreaView className="flex-1 w-full" style={{ backgroundColor: theme.background }}>
            <View className={`px-4 py-2.5 border-b flex-row justify-between items-center border-slate-200 dark:border-slate-800 ${isLarge ? 'px-8' : 'px-4'}`} style={{ backgroundColor: theme.panel }}>
                <View className="flex-row items-center space-x-2">
                    <View>
                        <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.xs, color: theme.textDark }} className="uppercase tracking-wider opacity-60">{getPredictionsApi.data ? (getPredictionsApi.data.entity_title || "Procurement Desk") : "Procurement Desk (Offline Caching)"}</Text>
                        <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.lg, color: theme.text }}>Requisition Matrix</Text>
                    </View>
                    {getPredictionsApi.loading && (
                        <View className="ml-3 px-2 py-0.5 rounded-md bg-sky-500/10 border border-sky-500/20 flex-row items-center space-x-1">
                            <ActivityIndicator size="small" color={theme.primary} />
                            <Text style={{ fontFamily: theme.font.mono, fontSize: theme.fontSize.xs }} className="text-sky-600 dark:text-sky-400 font-bold">Syncing...</Text>
                        </View>
                    )}
                </View>
            </View>

            <View className={`p-3 border-b border-slate-200 dark:border-slate-800 ${isLarge ? 'px-8 shadow-sm' : 'px-4'}`} style={{ backgroundColor: theme.panel }}>
                <ProcurementHeaderDeck
                    theme={theme} isDarkMode={isDarkMode} daysToOrder={daysToOrder} setDaysToOrder={setDaysToOrder} leadTimeDays={leadTimeDays} setLeadTimeDays={setLeadTimeDays}
                    lookbackWindow={lookbackWindow} setLookbackWindow={setLookbackWindow} maxShelfDays={maxShelfDays} setMaxShelfDays={setMaxShelfDays} budgetCap={budgetCap} setBudgetCap={setBudgetCap}
                    onlyShowBacklog={onlyShowBacklog} setOnlyShowBacklog={setOnlyShowBacklog} onApplyParams={handleFetchParams} isBudgetBreached={isBudgetBreached}
                    hasSelections={!!indentDocumentData} onDiscardIndent={handleCheckoutCommit} isLarge={isLarge}
                    itemsPerPage={itemsPerPage} setItemsPerPage={setItemsPerPage}
                />
            </View>

            <View className={`flex-1 w-full ${isLarge ? 'max-w-[1400px] mx-auto px-6' : 'px-0'}`}>
                <ProcurementListMatrix
                    theme={theme} predictionsData={matrixData} selectedOffers={selectedOffers} searchQuery={searchQuery} setSearchQuery={setSearchQuery}
                    onToggleOfferSelection={handleToggleOffer} isAllItemsSelected={isAllSelected} onSelectAllOffers={handleSelectAll} isLoading={getPredictionsApi.loading} onRefresh={handleFetchParams}
                    currentPage={currentPage} setCurrentPage={setCurrentPage} itemsPerPage={itemsPerPage}
                />
            </View>

            <View className={`w-full ${isLarge ? 'max-w-[1400px] mx-auto px-6 pb-2' : 'w-full'}`}>
                <IndentSummaryFooter theme={theme} isDarkMode={isDarkMode} submitting={generateOrdersApi.loading} indentDocument={indentDocumentData} budgetCap={budgetCap} onCommit={handleCheckoutCommit} onPrintPdf={() => console.log("Compiling Print Stream...")} />
            </View>
        </SafeAreaView>
    );
}
