import { ScrollView, Text, TouchableOpacity, View } from "react-native";

export const entityTypes = [
    { id: 1, value: "BAR", label: "Bar" },
    { id: 2, value: "BANK", label: "Bank" },
    { id: 3, value: "CLINIC", label: "Clinic" },
    { id: 5, value: "DISPENSARY", label: "Dispensary" },
    { id: 6, value: "GENERAL_DISTRIBUTOR", label: "General Distributor" },
    { id: 7, value: "PHARMACEUTICAL_DISTRIBUTOR", label: "Pharmaceutical Distributor" },
    { id: 8, value: "FARM", label: "Farm" },
    { id: 9, value: "GROCERY", label: "Grocery" },
    { id: 10, value: "HOSPITAL", label: "Hospital" },
    { id: 11, value: "HOTEL", label: "Hotel" },
    { id: 12, value: "INTERNET_SERVICE_PROVIDER", label: "Internet Service Provider" },
    { id: 13, value: "INSURANCE", label: "Insurance" },
    { id: 14, value: "GENERAL_MANUFACTURER", label: "General Manufacturer" },
    { id: 15, value: "PHARMACEUTICAL_MANUFACTURER", label: "Pharmaceutical Manufacturer" },
    { id: 16, value: "PARK", label: "Park" },
    { id: 17, value: "PARKING", label: "Parking" },
    { id: 18, value: "GENERAL_RETAILER", label: "General Retailer" },
    { id: 19, value: "PHARMACEUTICAL_RETAILER", label: "Pharmaceutical Retailer" },
    { id: 20, value: "REALTY", label: "Realty" },
    { id: 21, value: "RESTAURANT", label: "Restaurant" },
    { id: 22, value: "SACCO", label: "Sacco" },
    { id: 23, value: "TRANSPORT_COMPANY", label: "Transport Company" },
    { id: 24, value: "TELCO", label: "Telco" },
    { id: 25, value: "GENERAL_WHOLESALER", label: "General Wholesaler" },
    { id: 26, value: "PHARMACEUTICAL_WHOLESALER", label: "Pharmaceutical Wholesaler" }
];


interface AllowedEntitiesPickerProps {
    theme: any;
    selectedValues: string[];
    onSelectionChange: (values: string[]) => void;
}

export default function AllowedEntitiesPicker({ theme, selectedValues = [], onSelectionChange }: AllowedEntitiesPickerProps) {
    const handleToggle = (value: string) => {
        if (selectedValues.includes(value)) {
            onSelectionChange(selectedValues.filter((v) => v !== value));
        } else {
            onSelectionChange([...selectedValues, value]);
        }
    };

    console.log("AllowedEntitiesPicker - selectedValues:", selectedValues);

    return (
        <View className="items-start w-full gap-y-2 mt-1">
            <Text style={{ color: theme.textDark }} className="text-[10px] uppercase font-black tracking-wider">Allowed Distribution Entities Node Selection</Text>
            <View style={{ borderColor: theme.primary }} className="w-full border rounded-xl p-3 max-h-[160px] overflow-hidden">
                <ScrollView nestedScrollEnabled={true} keyboardShouldPersistTaps="handled" contentContainerClassName="flex-row flex-wrap gap-2" className="w-full">
                    {entityTypes.map((entity) => {
                        const isSelected = selectedValues.includes(entity.label);
                        return (
                            <TouchableOpacity
                                key={entity.label}
                                onPress={() => handleToggle(entity.label)}
                                activeOpacity={0.7}
                                style={{
                                    backgroundColor: isSelected ? theme.primary : "transparent",
                                    borderColor: isSelected ? theme.primary : theme.border
                                }}
                                className="px-3 py-1.5 rounded-lg border flex-row items-center transition-all"
                            >
                                <Text
                                    style={{ color: isSelected ? "#ffffff" : theme.text }}
                                    className={`text-[11px] uppercase tracking-wide ${isSelected ? "font-black" : "font-semibold"}`}
                                >
                                    {isSelected ? "✓ " : ""}{entity.label}
                                </Text>
                            </TouchableOpacity>
                        );
                    })}
                </ScrollView>
            </View>
        </View>
    );
}
