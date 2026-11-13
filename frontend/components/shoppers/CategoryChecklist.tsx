import React from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";

interface CategoryChecklistProps {
    categories: string[];
    isSelected: (category: string) => boolean;
    onToggle: (category: string) => void;
    onClear: () => void;
    selectedCount: number;
}

export default function CategoryChecklist({
    categories,
    isSelected,
    onToggle,
    onClear,
    selectedCount,
}: CategoryChecklistProps) {
    // Filter out "All" if it exists in the array, since we render it manually
    const displayCategories = categories.filter((c) => c.toLowerCase() !== "all");

    return (
        <View style={{ flex: 1, padding: 16 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <Text style={{ fontSize: 16, fontWeight: "bold", color: "#0f172a" }}>
                    Categories
                </Text>
                {selectedCount > 0 && (
                    <TouchableOpacity onPress={onClear}>
                        <Text style={{ fontSize: 12, color: "#1a73e8", fontWeight: "600" }}>
                            Clear
                        </Text>
                    </TouchableOpacity>
                )}
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
                {/* "All" Option */}
                <TouchableOpacity
                    onPress={onClear}
                    style={{
                        flexDirection: "row",
                        alignItems: "center",
                        paddingVertical: 10,
                        borderBottomWidth: 1,
                        borderBottomColor: "#e2e8f0",
                    }}
                >
                    <View
                        style={{
                            width: 18,
                            height: 18,
                            borderRadius: 4,
                            borderWidth: 2,
                            borderColor: selectedCount === 0 ? "#1a73e8" : "#cbd5e1",
                            backgroundColor: selectedCount === 0 ? "#1a73e8" : "transparent",
                            marginRight: 12,
                            justifyContent: "center",
                            alignItems: "center",
                        }}
                    >
                        {selectedCount === 0 && (
                            <View style={{ width: 8, height: 8, backgroundColor: "#fff", borderRadius: 2 }} />
                        )}
                    </View>
                    <Text style={{ fontSize: 14, color: selectedCount === 0 ? "#1a73e8" : "#334155", fontWeight: selectedCount === 0 ? "600" : "400" }}>
                        All Categories
                    </Text>
                </TouchableOpacity>

                {/* Individual Categories */}
                {displayCategories.map((cat) => {
                    const active = isSelected(cat);
                    return (
                        <TouchableOpacity
                            key={cat}
                            onPress={() => onToggle(cat)}
                            style={{
                                flexDirection: "row",
                                alignItems: "center",
                                paddingVertical: 10,
                                borderBottomWidth: 1,
                                borderBottomColor: "#e2e8f0",
                            }}
                        >
                            <View
                                style={{
                                    width: 18,
                                    height: 18,
                                    borderRadius: 4,
                                    borderWidth: 2,
                                    borderColor: active ? "#1a73e8" : "#cbd5e1",
                                    backgroundColor: active ? "#1a73e8" : "transparent",
                                    marginRight: 12,
                                    justifyContent: "center",
                                    alignItems: "center",
                                }}
                            >
                                {active && (
                                    <View style={{ width: 8, height: 8, backgroundColor: "#fff", borderRadius: 2 }} />
                                )}
                            </View>
                            <Text
                                style={{
                                    fontSize: 14,
                                    color: active ? "#1a73e8" : "#334155",
                                    fontWeight: active ? "600" : "400",
                                }}
                            >
                                {cat}
                            </Text>
                        </TouchableOpacity>
                    );
                })}
            </ScrollView>
        </View>
    );
}