import { ActivityIndicator, Text, TextInput, TouchableOpacity, View } from "react-native";
import AllowedEntitiesPicker from "./AllowedEntitiesPicker";
import BarcodeScannerTrigger from "./BarcodeScannerTrigger";
import ManufacturerAutocomplete from "./ManufacturerAutocomplete";
import PreparationAutocomplete from "./PreparationAutocomplete";
import ProductImagesPicker from "./ProductImagesPicker";

interface ProductFormFieldsProps {
    theme: any;
    isDarkMode: boolean;
    isSubmittingRemote: boolean;
    handleChange: any;
    handleBlur: any;
    handleSubmit: any;
    setFieldValue: any;
    values: any;
    errors: any;
    touched: any;
    initialData?: any;
    onCancel: () => void;
}

export default function ProductFormFields({
    theme,
    isDarkMode,
    isSubmittingRemote,
    handleChange,
    handleBlur,
    handleSubmit,
    setFieldValue,
    values,
    errors,
    touched,
    initialData,
    onCancel
}: ProductFormFieldsProps) {
    return (
        <View style={{ backgroundColor: theme.panel, borderColor: theme.primary }} className="p-6 rounded-2xl border shadow-sm flex-col w-full gap-y-4">

            <View style={{ zIndex: 120 }} className="items-start w-full">
                <Text style={{ color: theme.textDark }} className="text-[10px] uppercase font-black tracking-wider mb-1">Commercial Product Brand Name</Text>
                <TextInput onChangeText={handleChange("title")} onBlur={handleBlur("title")} value={values.title} placeholder="e.g. AMPIMOX" placeholderTextColor="#64748b" style={{ backgroundColor: theme.background, borderColor: touched.title && errors.title ? "#ef4444" : theme.primary, color: theme.text }} className="w-full rounded-xl px-4 h-[42px] border text-sm font-medium outline-none" />
                {touched.title && errors.title && <Text className="text-red-500 text-[11px] font-semibold mt-1">{errors.title}</Text>}
            </View>

            <PreparationAutocomplete theme={theme} isDarkMode={isDarkMode} selectedValue={values.preparation} initialTitle={initialData?.long_preparation_title || initialData?.preparation_title} hasError={!!(touched.preparation && errors.preparation)} onSelect={(id) => setFieldValue("preparation", id)} zIndexValue={110} />
            {touched.preparation && errors.preparation && <Text className="text-red-500 text-[11px] font-semibold mt-1">{errors.preparation}</Text>}

            <ManufacturerAutocomplete theme={theme} isDarkMode={isDarkMode} selectedValue={values.manufacturer} initialTitle={initialData?.manufacturer_title} hasError={!!(touched.manufacturer && errors.manufacturer)} onSelect={(id) => setFieldValue("manufacturer", id)} zIndexValue={100} />
            {touched.manufacturer && errors.manufacturer && <Text className="text-red-500 text-[11px] font-semibold mt-1">{errors.manufacturer}</Text>}

            <View style={{ zIndex: 1 }} className="w-full flex-row gap-x-4">
                <View className="flex-1 items-start">
                    <Text style={{ color: theme.textDark }} className="text-[10px] uppercase font-black tracking-wider mb-1">Units Quantity per Pack</Text>
                    <TextInput keyboardType="numeric" onChangeText={handleChange("units_per_pack")} onBlur={handleBlur("units_per_pack")} value={values.units_per_pack} placeholder="100" placeholderTextColor="#64748b" style={{ backgroundColor: theme.background, borderColor: touched.units_per_pack && errors.units_per_pack ? "#ef4444" : theme.primary, color: theme.text }} className="w-full rounded-xl px-4 h-[42px] border text-sm font-medium outline-none" />
                    {touched.units_per_pack && errors.units_per_pack && <Text className="text-red-500 text-[11px] font-semibold mt-1">{errors.units_per_pack}</Text>}
                </View>
                <View className="flex-1 items-start">
                    <Text style={{ color: theme.textDark }} className="text-[10px] uppercase font-black tracking-wider mb-1">Packaging Display Tag</Text>
                    <TextInput onChangeText={handleChange("pack_tag")} onBlur={handleBlur("pack_tag")} value={values.pack_tag} placeholder="100'S" placeholderTextColor="#64748b" style={{ backgroundColor: theme.background, borderColor: touched.pack_tag && errors.pack_tag ? "#ef4444" : theme.primary, color: theme.text }} className="w-full rounded-xl px-4 h-[42px] border text-sm font-medium outline-none" />
                    {touched.pack_tag && errors.pack_tag && <Text className="text-red-500 text-[11px] font-semibold mt-1">{errors.pack_tag}</Text>}
                </View>
            </View>

            <View style={{ zIndex: 1 }} className="items-start w-full">
                <Text style={{ color: theme.textDark }} className="text-[10px] uppercase font-black tracking-wider mb-1">Product Barcode SKU / GTIN Number</Text>
                <BarcodeScannerTrigger theme={theme} onScanSuccess={(scannedSku) => setFieldValue("bar_code", scannedSku)} />
                <TextInput onChangeText={handleChange("bar_code")} onBlur={handleBlur("bar_code")} value={values.bar_code} placeholder="Scanned data string mounts here natively" placeholderTextColor="#64748b" style={{ backgroundColor: theme.background, borderColor: theme.primary, color: theme.text }} className="w-full rounded-xl px-4 h-[42px] border text-sm font-medium outline-none" />
            </View>

            <View style={{ zIndex: 1 }} className="items-start w-full">
                <Text style={{ color: theme.textDark }} className="text-[10px] uppercase font-black tracking-wider mb-1">Is Vatable Supply Node Parameter</Text>
                <View className="flex-row items-center gap-x-4 mt-1">
                    {["true", "false"].map((opt) => (
                        <TouchableOpacity key={opt} onPress={() => setFieldValue("is_vatable", opt)} className="flex-row items-center gap-x-2">
                            <View style={{ borderColor: theme.primary }} className="w-4 h-4 rounded-full border items-center justify-center">
                                {values.is_vatable === opt && <View style={{ backgroundColor: theme.primary }} className="w-2.5 h-2.5 rounded-full" />}
                            </View>
                            <Text style={{ color: theme.text }} className="text-xs uppercase font-bold">{opt === "true" ? "Standard VAT Tax Rate" : "Zero Rated / Exempt"}</Text>
                        </TouchableOpacity>
                    ))}
                </View>
            </View>

            <View style={{ zIndex: 1 }} className="items-start w-full">
                <AllowedEntitiesPicker theme={theme} selectedValues={values.allowed_entities} onSelectionChange={(vals) => setFieldValue("allowed_entities", vals)} />
                {touched.allowed_entities && errors.allowed_entities && <Text className="text-red-500 text-[11px] font-semibold mt-1">{errors.allowed_entities}</Text>}
            </View>

            <View style={{ zIndex: 1 }} className="items-start w-full">
                <ProductImagesPicker theme={theme} isDarkMode={isDarkMode} images={values.images} onImagesChange={(updatedUris) => setFieldValue("images", updatedUris)} />
                {touched.images && errors.images && <Text className="text-red-500 text-[11px] font-semibold mt-1">{errors.images}</Text>}
            </View>

            <View style={{ zIndex: 1 }} className="flex-row items-center gap-x-3 mt-4 w-full">
                <TouchableOpacity onPress={onCancel} disabled={isSubmittingRemote} className="flex-1 h-12 rounded-xl items-center justify-center border border-slate-200 dark:border-slate-800 active:bg-slate-50">
                    <Text className="text-slate-500 font-bold text-sm uppercase tracking-wider">Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleSubmit()} disabled={isSubmittingRemote} style={{ backgroundColor: theme.primary }} className="flex-1 h-12 rounded-xl items-center justify-center shadow-md active:opacity-90">
                    {isSubmittingRemote ? <ActivityIndicator color="#ffffff" size="small" /> : <Text className="text-white font-bold text-sm uppercase tracking-wider">{initialData ? "Update Product" : "Commit Brand"}</Text>}
                </TouchableOpacity>
            </View>

        </View>
    );
}
