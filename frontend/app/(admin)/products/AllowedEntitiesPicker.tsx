import { useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";

export const entityTypes = [
    { id: 1, value: "Bar", label: "Bar" },
    { id: 2, value: "Bank", label: "Bank" },
    { id: 3, value: "Clinic", label: "Clinic" },
    { id: 5, value: "Dispensary", label: "Dispensary" },
    { id: 6, value: "GeneralDistributor", label: "General Distributor" },
    { id: 7, value: "PharmaceuticalDistributor", label: "Pharmaceutical Distributor" },
    { id: 8, value: "Farm", label: "Farm" },
    { id: 9, value: "Grocery", label: "Grocery" },
    { id: 10, value: "Hospital", label: "Hospital" },
    { id: 11, value: "Hotel", label: "Hotel" },
    { id: 12, value: "InternetServiceProvider", label: "Internet Service Provider" },
    { id: 13, value: "Insurance", label: "Insurance" },
    { id: 14, value: "GeneralManufacturer", label: "General Manufacturer" },
    { id: 15, value: "PharmaceuticalManufacturer", label: "Pharmaceutical Manufacturer" },
    { id: 16, value: "Park", label: "Park" },
    { id: 17, value: "Parking", label: "Parking" },
    { id: 18, value: "GeneralRetailer", label: "General Retailer" },
    { id: 19, value: "PharmaceuticalRetailer", label: "Pharmaceutical Retailer" },
    { id: 20, value: "Realty", label: "Realty" },
    { id: 21, value: "Restaurant", label: "Restaurant" },
    { id: 22, value: "Sacco", label: "Sacco" },
    { id: 23, value: "TransportCompany", label: "Transport Company" },
    { id: 24, value: "Telco", label: "Telco" },
    { id: 25, value: "GeneralWholesaler", label: "General Wholesaler" },
    { id: 26, value: "PharmaceuticalWholesaler", label: "Pharmaceutical Wholesaler" }
];

interface AllowedEntitiesPickerProps {
    theme: any;
    selectedValues: string[];
    onSelectionChange: (values: string[]) => void;
}

export default function AllowedEntitiesPicker({ theme, selectedValues, onSelectionChange }: AllowedEntitiesPickerProps) {
    const [query, setQuery] = useState("");
    const [isOpen, setIsOpen] = useState(false);
    const activeSelections = Array.isArray(selectedValues) ? selectedValues : [];

    const handleRemove = (value: string) => {
        onSelectionChange(activeSelections.filter((v) => v !== value));
    };

    const handleSelectOption = (value: string) => {
        if (!activeSelections.includes(value)) {
            onSelectionChange([...activeSelections, value]);
        }
        setQuery("");
    };

    const filteredOptions = entityTypes.filter(option =>
        option.label.toLowerCase().includes(query.toLowerCase()) &&
        !activeSelections.includes(option.value)
    );

    const shouldShowDropdown = isOpen && (query.length > 0 || filteredOptions.length > 0);
    const isThemePanelTransparent = !theme.panel || theme.panel === "transparent" || theme.panel === "rgba(0,0,0,0)";
    const fallbackSolidBackground = isThemePanelTransparent ? "#FFFFFF" : theme.panel;

    return (
        <View style={{ zIndex: isOpen ? 99999 : 50 }} className="w-full mt-1 gap-y-1.5 items-start relative">
            {isOpen && (
                <Pressable
                    className="absolute top-[-5000px] bottom-[-5000px] left-[-5000px] right-[-5000px]"
                    style={{ zIndex: 9999, backgroundColor: "transparent" }}
                    onPress={() => setIsOpen(false)}
                >
                    <View className="flex-1 w-full h-full" />
                </Pressable>
            )}
            <Text style={{ color: theme.textDark }} className="text-[10px] uppercase font-black tracking-wider">
                Allowed Distribution Entities Node Selection
            </Text>
            <View style={{ zIndex: 10001 }} className="w-full relative">
                <View
                    style={{
                        borderColor: isOpen ? theme.primary : theme.border,
                        backgroundColor: fallbackSolidBackground,
                        flexDirection: "row",
                        flexWrap: "wrap",
                        alignItems: "center",
                        paddingHorizontal: 10,
                        paddingVertical: 8,
                        gap: 6,
                        minHeight: 44
                    }}
                    className="w-full border rounded-xl"
                >
                    {activeSelections.map((value) => {
                        const entity = entityTypes.find(e => e.value === value);
                        return (
                            <View
                                key={`inline-pill-${value}`}
                                style={{
                                    backgroundColor: theme.primary || "#000000",
                                    flexDirection: "row",
                                    alignItems: "center",
                                    paddingLeft: 10,
                                    paddingRight: 6,
                                    paddingVertical: 4,
                                    borderRadius: 8,
                                    gap: 6
                                }}
                            >
                                <Text style={{ color: "#FFFFFF", fontSize: 11, fontWeight: "700" }}>
                                    {entity?.label || value}
                                </Text>
                                <Pressable
                                    onPress={() => handleRemove(value)}
                                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                    style={({ pressed }) => [{ opacity: pressed ? 0.5 : 1 }]}
                                >
                                    <View style={{ backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 10, width: 16, height: 16, itemsCenter: "center", justifycontent: "center" }} className="items-center justify-center">
                                        <Text style={{ color: "#FFFFFF", fontSize: 10, fontWeight: "900", marginTop: -1 }}>×</Text>
                                    </View>
                                </Pressable>
                            </View>
                        );
                    })}
                    <TextInput
                        value={query}
                        onChangeText={(text) => {
                            setQuery(text);
                            setIsOpen(true);
                        }}
                        onFocus={() => setIsOpen(true)}
                        placeholder={activeSelections.length === 0 ? "Search and filter nodes..." : "+ Add..."}
                        placeholderTextColor={theme.textDark || "#64748b"}
                        style={{ color: theme.text, flex: 1, minWidth: 80, height: 28, padding: 0, fontSize: 12 }}
                        className="font-semibold outline-none"
                    />
                </View>
                {shouldShowDropdown && (
                    <View
                        style={{
                            borderColor: theme.primary || "#E2E8F0",
                            backgroundColor: fallbackSolidBackground,
                            position: "absolute",
                            top: "100%",
                            marginTop: 4,
                            left: 0,
                            right: 0,
                            maxHeight: 200,
                            zIndex: 999999,
                            elevation: 12,
                            shadowColor: "#000000",
                            shadowOffset: { width: 0, height: 6 },
                            shadowOpacity: 0.15,
                            shadowRadius: 8
                        }}
                        className="border rounded-xl overflow-hidden"
                    >
                        <ScrollView nestedScrollEnabled={true} keyboardShouldPersistTaps="handled" style={{ backgroundColor: fallbackSolidBackground }} className="w-full">
                            {filteredOptions.length === 0 ? (
                                <View style={{ backgroundColor: fallbackSolidBackground }} className="p-4 items-center justify-center">
                                    <Text style={{ color: theme.textDark }} className="text-xs italic">No matching entities found</Text>
                                </View>
                            ) : (
                                filteredOptions.map((entity, index) => (<Pressable onPress={() =>
                                    handleSelectOption(entity.value)}
                                    style={({ pressed }) => [
                                        {
                                            borderBottomWidth: index === filteredOptions.length - 1 ? 0 : 1,
                                            borderBottomColor: theme.border ? `${theme.border}40` : "rgba(226,232,240,0.4)",
                                            backgroundColor: pressed ? `${theme.primary || "#000000"}15` : fallbackSolidBackground
                                        }
                                    ]}
                                    className="w-full px-4 py-3 flex-row items-center"
                                >
                                    <Text style={{ color: theme.text }} className="text-xs font-bold">{entity.label}</Text>
                                </Pressable>
                                ))
                            )}
                        </ScrollView>
                    </View>
                )}
            </View>
        </View>
    );
}
