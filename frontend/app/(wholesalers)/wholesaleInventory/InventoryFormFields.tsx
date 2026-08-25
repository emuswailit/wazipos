// app/(wholesalers)/wholesaleInventory/InventoryFormFields.tsx
import { ActivityIndicator, Text, TextInput, TouchableOpacity, View } from "react-native";
import InlineDatePickerMatrix from "./InlineDatePickerMatrix";
import ProductAutocomplete from "./ProductAutocomplete";
import ReceivedFromAutocomplete from "./ReceivedFromAutocomplete";
import UnitOfReceiptPicker from "./UnitOfReceiptPicker";

interface InventoryFormFieldsProps {
    theme: any;
    isDarkMode: boolean;
    isSubmittingRemote: boolean;
    handleChange: any;
    handleBlur: any;
    handleSubmit: any;
    setFieldValue: any;
    setFieldTouched: any;
    values: any;
    errors: any;
    touched: any;
    initialData?: any;
    onCancel: () => void;
}

export default function InventoryFormFields({
    theme, isDarkMode, isSubmittingRemote, handleChange, handleBlur, handleSubmit, setFieldValue, setFieldTouched, values, errors, touched, initialData, onCancel
}: InventoryFormFieldsProps) {
    return (
        <View style={{ backgroundColor: theme.panel, borderColor: theme.primary }} className="p-6 rounded-2xl border shadow-sm flex-col w-full gap-y-4">
            <View style={{ zIndex: 160 }} className="items-start w-full">
                <ProductAutocomplete theme={theme} isDarkMode={isDarkMode} selectedValue={values.product} initialTitle={initialData?.title || values.title} hasError={!!(touched.product && errors.product)} zIndexValue={160} onSelect={(id, title) => { setFieldValue("product", id); setFieldValue("title", title); }} />
                {touched.product && errors.product && <Text className="text-red-500 text-[11px] font-semibold mt-1">{errors.product}</Text>}
            </View>

            <View style={{ zIndex: 150 }} className="items-start w-full">
                <ReceivedFromAutocomplete theme={theme} isDarkMode={isDarkMode} selectedValue={values.received_from} initialTitle={initialData?.received_from_details?.title || values.received_from_title} hasError={!!(touched.received_from && errors.received_from)} zIndexValue={150} onSelect={(id, title) => { setFieldValue("received_from", id); setFieldValue("received_from_title", title); }} />
                {touched.received_from && errors.received_from && <Text className="text-red-500 text-[11px] font-semibold mt-1">{errors.received_from}</Text>}
            </View>

            <View style={{ zIndex: 1 }} className="items-start w-full">
                <Text style={{ color: theme.textDark }} className="text-[10px] uppercase font-black tracking-wider mb-1">Batch Code</Text>
                <TextInput onChangeText={handleChange("batch")} onBlur={handleBlur("batch")} value={values.batch} placeholder="e.g. 123wwsrs" placeholderTextColor="#64748b" style={{ backgroundColor: theme.background, borderColor: touched.batch && errors.batch ? "#ef4444" : theme.primary, color: theme.text }} className="w-full rounded-xl px-4 h-[42px] border text-sm font-medium outline-none" />
                {touched.batch && errors.batch && <Text className="text-red-500 text-[11px] font-semibold mt-1">{errors.batch}</Text>}
            </View>

            <View style={{ zIndex: 1 }} className="items-start w-full">
                <Text style={{ color: theme.textDark }} className="text-[10px] uppercase font-black tracking-wider mb-1">Quantity *</Text>
                <TextInput keyboardType="numeric" onChangeText={handleChange("current_unit_quantity")} onBlur={handleBlur("current_unit_quantity")} value={values.current_unit_quantity} placeholder="100" placeholderTextColor="#64748b" style={{ backgroundColor: theme.background, borderColor: touched.current_unit_quantity && errors.current_unit_quantity ? "#ef4444" : theme.primary, color: theme.text }} className="w-full rounded-xl px-4 h-[42px] border text-sm font-medium outline-none" />
                {touched.current_unit_quantity && errors.current_unit_quantity && <Text className="text-red-500 text-[11px] font-semibold mt-1">{errors.current_unit_quantity}</Text>}
            </View>

            {/* 🌟 INTEGRATED SELECTION GRID */}
            <View style={{ zIndex: 1 }} className="w-full">
                <UnitOfReceiptPicker
                    theme={theme}
                    selectedValue={values.unit_of_receipt}
                    hasError={!!(touched.unit_of_receipt && errors.unit_of_receipt)}
                    onSelect={(val) => {
                        setFieldValue("unit_of_receipt", val);
                        setFieldTouched("unit_of_receipt", true, true);
                    }}
                />
                {touched.unit_of_receipt && errors.unit_of_receipt && <Text className="text-red-500 text-[11px] font-semibold mt-1">{errors.unit_of_receipt}</Text>}
            </View>

            <View style={{ zIndex: 130 }} className="w-full">
                <InlineDatePickerMatrix label="Manufacture Date *" field="manufacture_date" values={values} theme={theme} isDarkMode={isDarkMode} setFieldValue={setFieldValue} touched={touched} errors={errors} isExpiry={false} />
            </View>

            <View style={{ zIndex: 120 }} className="w-full">
                <InlineDatePickerMatrix label="Expiry Date *" field="expiry_date" values={values} theme={theme} isDarkMode={isDarkMode} setFieldValue={setFieldValue} touched={touched} errors={errors} isExpiry={true} />
            </View>

            <View style={{ zIndex: 1 }} className="w-full flex-row gap-x-4">
                <View className="flex-1 items-start">
                    <Text style={{ color: theme.textDark }} className="text-[10px] uppercase font-black tracking-wider mb-1">Unit Buying Price *</Text>
                    <TextInput keyboardType="numeric" onChangeText={handleChange("unit_buying_price")} onBlur={handleBlur("unit_buying_price")} value={values.unit_buying_price} placeholder="1.00" placeholderTextColor="#64748b" style={{ backgroundColor: theme.background, borderColor: touched.unit_buying_price && errors.unit_buying_price ? "#ef4444" : theme.primary, color: theme.text }} className="w-full rounded-xl px-4 h-[42px] border text-sm font-medium outline-none" />
                    {touched.unit_buying_price && errors.unit_buying_price && <Text className="text-red-500 text-[11px] font-semibold mt-1">{errors.unit_buying_price}</Text>}
                </View>
                <View className="flex-1 items-start">
                    <Text style={{ color: theme.textDark }} className="text-[10px] uppercase font-black tracking-wider mb-1">Unit Selling Price *</Text>
                    <TextInput keyboardType="numeric" onChangeText={handleChange("unit_selling_price")} onBlur={handleBlur("unit_selling_price")} value={values.unit_selling_price} placeholder="2.00" placeholderTextColor="#64748b" style={{ backgroundColor: theme.background, borderColor: touched.unit_selling_price && errors.unit_selling_price ? "#ef4444" : theme.primary, color: theme.text }} className="w-full rounded-xl px-4 h-[42px] border text-sm font-medium outline-none" />
                    {touched.unit_selling_price && errors.unit_selling_price && <Text className="text-red-500 text-[11px] font-semibold mt-1">{errors.unit_selling_price}</Text>}
                </View>
            </View>

            <View style={{ zIndex: 1 }} className="flex-row items-center gap-x-3 mt-4 w-full">
                <TouchableOpacity onPress={onCancel} disabled={isSubmittingRemote} className="flex-1 h-12 rounded-xl items-center justify-center border border-slate-200 dark:border-slate-800 active:bg-slate-50">
                    <Text className="text-slate-500 font-bold text-sm uppercase tracking-wider">Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleSubmit()} disabled={isSubmittingRemote} style={{ backgroundColor: theme.primary }} className="flex-1 h-12 rounded-xl items-center justify-center shadow-md active:opacity-90">
                    {isSubmittingRemote ? <ActivityIndicator color="#ffffff" size="small" /> : <Text className="text-white font-bold text-sm uppercase tracking-wider">{initialData ? "Update Ledger" : "Create Entry"}</Text>}
                </TouchableOpacity>
            </View>
        </View>
    );
}
