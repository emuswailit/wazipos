// components/common/EmployeePicker.tsx

import { useAuth } from "@/context/AuthContext";
import { EmployeeNormalized } from "@/databases/types";
import { CheckCircle2, Search, X } from "lucide-react-native";
import React, { useMemo, useState } from "react";
import {
    ActivityIndicator,
    Pressable,
    ScrollView,
    Text,
    TextInput,
    View,
} from "react-native";

interface Props {
    employees: EmployeeNormalized[];
    isLoading: boolean;
    selectedId: string | null;
    onSelect: (id: string | null) => void;
    disabled?: boolean;
}

export function EmployeePicker({
    employees,
    isLoading,
    selectedId,
    onSelect,
    disabled = false,
}: Props) {
    const { theme, isDarkMode } = useAuth();
    const [search, setSearch] = useState("");
    const [isOpen, setIsOpen] = useState(false);

    const borderColor = isDarkMode ? '#334155' : '#e2e8f0';
    const inputBg = isDarkMode ? '#0f172a' : '#f8fafc';

    const selectedEmployee = employees.find((e) => e.id === selectedId);

    const filteredEmployees = useMemo(() => {
        if (!search.trim()) return employees;
        const q = search.toLowerCase();
        return employees.filter((e) => e.name.toLowerCase().includes(q));
    }, [employees, search]);

    // If an employee is selected, show the selected card
    if (selectedEmployee) {
        return (
            <View
                className="flex-row items-center justify-between p-3.5 rounded-xl border"
                style={{
                    borderColor: theme.primary,
                    backgroundColor: `${theme.primary}15`,
                }}
            >
                <View className="flex-row items-center gap-2">
                    <CheckCircle2 size={16} color={theme.primary} />
                    <View>
                        <Text style={{ fontFamily: theme.font.bold, color: theme.primary, fontSize: 14 }}>
                            {selectedEmployee.name}
                        </Text>
                        {selectedEmployee.phone ? (
                            <Text style={{ fontFamily: theme.font.medium, color: theme.primary, fontSize: 11, opacity: 0.8 }}>
                                {selectedEmployee.phone}
                            </Text>
                        ) : null}
                    </View>
                </View>
                <Pressable
                    onPress={() => onSelect(null)}
                    disabled={disabled}
                    hitSlop={10}
                    style={{ opacity: disabled ? 0.5 : 1 }}
                >
                    <X size={16} color={theme.primary} />
                </Pressable>
            </View>
        );
    }

    // Otherwise, show the search input and dropdown
    return (
        <View style={{ zIndex: 100 }}>
            <View
                className="h-11 rounded-xl border px-3.5 flex-row items-center"
                style={{
                    borderColor,
                    backgroundColor: inputBg,
                    opacity: disabled ? 0.6 : 1,
                }}
            >
                <Search size={16} color={theme.textDark} />
                <TextInput
                    value={search}
                    onChangeText={(t) => {
                        setSearch(t);
                        setIsOpen(true);
                    }}
                    onFocus={() => setIsOpen(true)}
                    editable={!disabled}
                    placeholder="Search store staff by name…"
                    placeholderTextColor="#94a3b8"
                    className="flex-1 h-full ml-2 outline-none"
                    style={{
                        fontFamily: theme.font.medium,
                        color: theme.text,
                        fontSize: 13,
                    }}
                />
            </View>

            {isOpen && (
                <View
                    className="mt-2 rounded-xl border overflow-hidden"
                    style={{
                        borderColor,
                        backgroundColor: inputBg,
                        maxHeight: 220,
                    }}
                >
                    {isLoading ? (
                        <View className="p-4 items-center">
                            <ActivityIndicator size="small" color={theme.primary} />
                            <Text style={{ marginTop: 8, color: theme.textDark, fontSize: 12 }}>
                                Loading staff…
                            </Text>
                        </View>
                    ) : filteredEmployees.length > 0 ? (
                        <ScrollView keyboardShouldPersistTaps="handled">
                            {filteredEmployees.map((emp) => (
                                <Pressable
                                    key={emp.id}
                                    onPress={() => {
                                        onSelect(emp.id);
                                        setSearch("");
                                        setIsOpen(false);
                                    }}
                                    className="px-3 py-3 border-b"
                                    style={{
                                        borderBottomColor: borderColor,
                                        backgroundColor: emp.id === selectedId ? `${theme.primary}15` : 'transparent',
                                    }}
                                >
                                    <Text
                                        style={{
                                            color: theme.text,
                                            fontFamily: emp.id === selectedId ? theme.font.bold : theme.font.medium,
                                            fontSize: 13,
                                        }}
                                    >
                                        {emp.name}
                                    </Text>
                                </Pressable>
                            ))}
                        </ScrollView>
                    ) : (
                        <View className="p-4 items-center">
                            <Text style={{ color: theme.textDark, fontSize: 12 }}>
                                {search ? `No staff found matching "${search}"` : "No active delivery staff found."}
                            </Text>
                        </View>
                    )}
                </View>
            )}
        </View>
    );
}