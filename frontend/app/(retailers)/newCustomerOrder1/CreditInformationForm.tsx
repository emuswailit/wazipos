import DateTimePicker from '@react-native-community/datetimepicker';
import React, { useMemo, useState } from 'react';
import { Platform, Text, TextInput, TouchableOpacity, View } from 'react-native';

interface CreditInformationFormProps {
    customerName: string;
    setCustomerName: (val: string) => void;
    customerPhone: string;
    setCustomerPhone: (val: string) => void;
    dueDate: string;
    setDueDate: (val: string) => void;
    theme: any;
}

export default function CreditInformationForm({
    customerName,
    setCustomerName,
    customerPhone,
    setCustomerPhone,
    dueDate,
    setDueDate,
    theme,
}: CreditInformationFormProps) {
    const [showPicker, setShowPicker] = useState(false);

    const { minDateStr, maxDateStr, maxDateObj, minDateObj } = useMemo(() => {
        const today = new Date();
        today.setHours(0, 0, 0, 0); // Normalize time to midnight for clean calendar checking

        const maxDate = new Date();
        maxDate.setDate(today.getDate() + 90);
        maxDate.setHours(23, 59, 59, 999);

        return {
            minDateStr: today.toISOString().split('T')[0],
            maxDateStr: maxDate.toISOString().split('T')[0],
            minDateObj: today,
            maxDateObj: maxDate
        };
    }, []);

    const handleDateChange = (event: any, selectedDate?: Date) => {
        setShowPicker(false);
        if (selectedDate) {
            selectedDate.setHours(0, 0, 0, 0);

            if (selectedDate < minDateObj) {
                alert("❌ Invalid Date: Credit due date cannot be a past date.");
                setDueDate(minDateStr);
                return;
            }
            if (selectedDate > maxDateObj) {
                alert("⚠️ Maximum restriction ceiling rule violated. Credit terms are strictly capped at 90 days out.");
                setDueDate(maxDateStr);
                return;
            }
            setDueDate(selectedDate.toISOString().split('T')[0]);
        }
    };

    const currentPickerDate = useMemo(() => {
        if (!dueDate) return new Date();
        const d = new Date(dueDate);
        return isNaN(d.getTime()) ? new Date() : d;
    }, [dueDate]);

    return (
        <View className="mb-6 w-full flex-col border-b border-black/5 pb-6 animate-fade-in">
            <Text className="text-xs font-extrabold uppercase tracking-wider mb-3 text-amber-600">
                Credit Account Information Required
            </Text>
            <View className="flex-col md:flex-row gap-4 w-full">
                <View className="flex-1">
                    <Text className="text-[10px] font-bold uppercase mb-1" style={{ color: theme.textDark }}>Customer Name</Text>
                    <TextInput
                        placeholder="John Doe"
                        placeholderTextColor={`${theme.textDark}50`}
                        value={customerName}
                        onChangeText={setCustomerName}
                        className="border rounded-xl px-3.5 h-11 text-xs w-full"
                        style={{ color: theme.text, backgroundColor: theme.background, borderColor: `${theme.textDark}30` }}
                    />
                </View>
                <View className="flex-1">
                    <Text className="text-[10px] font-bold uppercase mb-1" style={{ color: theme.textDark }}>Customer Phone</Text>
                    <TextInput
                        keyboardType="phone-pad"
                        placeholder="0700000000"
                        placeholderTextColor={`${theme.textDark}50`}
                        value={customerPhone}
                        onChangeText={setCustomerPhone}
                        className="border rounded-xl px-3.5 h-11 text-xs w-full"
                        style={{ color: theme.text, backgroundColor: theme.background, borderColor: `${theme.textDark}30` }}
                    />
                </View>
                <View className="w-full md:w-44">
                    <Text className="text-[10px] font-bold uppercase mb-1" style={{ color: theme.textDark }}>Order Due Date (Max 90 Days)</Text>
                    {Platform.OS === 'web' ? (
                        <input
                            type="date"
                            min={minDateStr}
                            max={maxDateStr}
                            value={dueDate}
                            onChange={(e) => {
                                const picked = new Date(e.target.value);
                                picked.setHours(0, 0, 0, 0);
                                if (picked < minDateObj) {
                                    alert("❌ Invalid Date: Credit due date cannot be a past date.");
                                    setDueDate(minDateStr);
                                } else if (picked > maxDateObj) {
                                    alert("⚠️ Due date exceeds maximum 90-day credit window.");
                                    setDueDate(maxDateStr);
                                } else {
                                    setDueDate(e.target.value);
                                }
                            }}
                            className="border rounded-xl px-3.5 h-11 text-xs text-center w-full outline-none font-medium"
                            style={{ color: theme.text, backgroundColor: theme.background, borderColor: `${theme.textDark}30`, fontFamily: 'inherit' }}
                        />
                    ) : (
                        <View className="w-full">
                            <TouchableOpacity
                                activeOpacity={0.8}
                                onPress={() => setShowPicker(true)}
                                className="border rounded-xl px-3.5 h-11 justify-center w-full"
                                style={{ backgroundColor: theme.background, borderColor: `${theme.textDark}30` }}
                            >
                                <Text className="text-xs text-center font-medium" style={{ color: dueDate ? theme.text : `${theme.textDark}50` }}>
                                    {dueDate || "Select Date..."}
                                </Text>
                            </TouchableOpacity>
                            {showPicker && (
                                <DateTimePicker
                                    value={currentPickerDate}
                                    mode="date"
                                    display="calendar"
                                    minimumDate={minDateObj}
                                    maximumDate={maxDateObj}
                                    onChange={handleDateChange}
                                />
                            )}
                        </View>
                    )}
                </View>
            </View>
        </View>
    );
}
