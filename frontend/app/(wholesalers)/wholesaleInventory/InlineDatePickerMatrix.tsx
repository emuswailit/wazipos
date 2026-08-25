// app/(wholesalers)/wholesaleInventory/InlineDatePickerMatrix.tsx
import { useMemo, useState } from "react";
import { Modal, Platform, Pressable, SafeAreaView, ScrollView, Text, TouchableOpacity, View } from "react-native";
interface DatePickerProps {
    label: string;
    field: "manufacture_date" | "expiry_date";
    values: any;
    theme: any;
    isDarkMode: boolean;
    setFieldValue: (field: string, value: any) => void;
    touched: any;
    errors: any;
    isExpiry?: boolean;
}
const MONTHS_LABELS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const YEARS_MFG = Array.from({ length: 6 }, (_, i) => 2023 + i);
const YEARS_EXP = Array.from({ length: 10 }, (_, i) => 2026 + i);
export default function InlineDatePickerMatrix({ label, field, values, theme, isDarkMode, setFieldValue, touched, errors, isExpiry = false }: DatePickerProps) {
    const [isOpen, setIsOpen] = useState(false);
    const parsedDate = useMemo(() => {
        const dateStr = values[field];
        if (!dateStr || !dateStr.includes("-")) {
            const d = new Date();
            return { year: d.getFullYear(), month: d.getMonth(), day: d.getDate() };
        }
        const parts = dateStr.split("-");
        return { year: parseInt(parts[0]) || 2026, month: (parseInt(parts[1]) || 1) - 1, day: parseInt(parts[2]) || 1 };
    }, [values[field], isExpiry]);
    const [viewYear, setViewYear] = useState(parsedDate.year);
    const [viewMonth, setViewMonth] = useState(parsedDate.month);
    const [isYearSelectorOpen, setIsYearSelectorOpen] = useState(false);
    const yearsList = isExpiry ? YEARS_EXP : YEARS_MFG;
    const daysInMonthMatrix = useMemo(() => {
        const date = new Date(viewYear, viewMonth + 1, 0);
        const totalDays = date.getDate();
        const startDayOffset = new Date(viewYear, viewMonth, 1).getDay();
        const grid = [];
        for (let i = 0; i < startDayOffset; i++) { grid.push(null); }
        for (let d = 1; d <= totalDays; d++) { grid.push(d); }
        return grid;
    }, [viewYear, viewMonth]);
    const handleDaySelect = (day: number) => {
        const y = String(viewYear);
        const m = String(viewMonth + 1).padStart(2, "0");
        const d = String(day).padStart(2, "0");
        setFieldValue(field, `${y}-${m}-${d}`);
        setIsOpen(false);
    };
    const changeMonth = (direction: number) => {
        let newMonth = viewMonth + direction;
        let newYear = viewYear;
        if (newMonth > 11) {
            newMonth = 0;
            newYear += 1;
        } else if (newMonth < 0) {
            newMonth = 11;
            newYear -= 1;
        }
        if (yearsList.includes(newYear)) {
            setViewMonth(newMonth);
            setViewYear(newYear);
        }
    };
    const formattedDisplayValue = useMemo(() => {
        if (!values[field]) return "Select Date...";
        const parts = values[field].split("-");
        return `${parts[2]} ${MONTHS_LABELS[parseInt(parts[1]) - 1]?.substring(0, 3) || ""} ${parts[0]}`;
    }, [values[field]]);
    const renderCalendarGrid = () => (
        <View className="p-4 w-full">
            <View className="flex-row justify-between items-center mb-4">
                <TouchableOpacity onPress={() => changeMonth(-1)} className="p-2 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 active:opacity-60">
                    <Text style={{ color: theme.text }} className="font-bold">◀</Text>
                </TouchableOpacity>
                <View className="flex-row items-center">
                    <Text style={{ color: theme.text }} className="text-sm font-black mr-2">{MONTHS_LABELS[viewMonth]}</Text>
                    <TouchableOpacity onPress={() => setIsYearSelectorOpen(!isYearSelectorOpen)} className="bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-lg">
                        <Text style={{ color: theme.primary }} className="text-xs font-black">{viewYear} ▾</Text>
                    </TouchableOpacity>
                </View>
                <TouchableOpacity onPress={() => changeMonth(1)} className="p-2 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 active:opacity-60">
                    <Text style={{ color: theme.text }} className="font-bold">▶</Text>
                </TouchableOpacity>
            </View>
            {isYearSelectorOpen ? (
                <ScrollView className="max-h-[160px] mb-2" keyboardShouldPersistTaps="handled">
                    <View className="flex-row flex-wrap gap-2 justify-center p-1">
                        {yearsList.map((y) => (
                            <TouchableOpacity key={y} onPress={() => { setViewYear(y); setIsYearSelectorOpen(false); }} style={{ backgroundColor: viewYear === y ? theme.primary : "transparent" }} className="px-3 py-2 rounded-xl border border-slate-100 dark:border-slate-800">
                                <Text style={{ color: viewYear === y ? "#ffffff" : theme.text }} className="text-xs font-bold">{y}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </ScrollView>
            ) : (
                <>
                    <View className="flex-row w-full mb-2 border-b border-slate-100 dark:border-slate-800 pb-1">
                        {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((dayName, idx) => (
                            <Text key={idx} style={{ color: theme.textDark }} className="flex-1 text-center text-[10px] font-bold uppercase tracking-wider">{dayName}</Text>
                        ))}
                    </View>
                    <View className="flex-row flex-wrap w-full">
                        {daysInMonthMatrix.map((day, idx) => {
                            const isSelected = day !== null && parsedDate.year === viewYear && parsedDate.month === viewMonth && parsedDate.day === day;
                            return (
                                <View key={idx} className="w-[14.28%] aspect-square p-0.5 justify-center items-center">
                                    {day !== null ? (
                                        <TouchableOpacity onPress={() => handleDaySelect(day)} style={{ backgroundColor: isSelected ? theme.primary : "transparent" }} className="w-full h-full rounded-xl items-center justify-center active:opacity-70">
                                            <Text style={{ color: isSelected ? "#ffffff" : theme.text }} className={`text-xs ${isSelected ? "font-black" : "font-medium"}`}>{day}</Text>
                                        </TouchableOpacity>
                                    ) : (<View className="w-full h-full" />)}
                                </View>
                            );
                        })}
                    </View>
                </>
            )}
        </View>
    );
    return (
        <View className="items-start w-full relative z-40">
            <Text style={{ color: theme.textDark }} className="text-[10px] uppercase font-black tracking-wider mb-1">{label}</Text>
            <TouchableOpacity onPress={() => setIsOpen(true)} style={{ backgroundColor: theme.background, borderColor: isOpen ? theme.primary : theme.border }} className="w-full rounded-xl px-4 h-[42px] border flex-row items-center justify-between active:opacity-80">
                <Text style={{ color: values[field] ? theme.text : "#64748b" }} className="text-sm font-medium">{formattedDisplayValue}</Text>
                <Text className="text-xs">📅</Text>
            </TouchableOpacity>
            {Platform.OS === "web" && isOpen && (
                <View style={{ backgroundColor: isDarkMode ? "#0f172a" : "#ffffff", borderColor: theme.primary }} className="absolute top-[68px] left-0 right-0 border rounded-2xl shadow-xl z-50 bg-white dark:bg-slate-900 w-full">
                    <Pressable className="absolute inset-0 h-screen w-screen fixed" onPress={() => setIsOpen(false)} />
                    {renderCalendarGrid()}
                </View>
            )}
            {Platform.OS !== "web" && isOpen && (
                <Modal visible={isOpen} transparent={true} animationType="slide" onRequestClose={() => setIsOpen(false)}>
                    <SafeAreaView className="flex-1 bg-black/40 justify-end">
                        <Pressable className="absolute inset-0 h-full w-full" onPress={() => setIsOpen(false)} />
                        <View style={{ backgroundColor: theme.panel }} className="w-full rounded-t-3xl overflow-hidden pb-8 shadow-2xl items-center">
                            <View className="w-full border-b border-slate-100 dark:border-slate-800 px-6 py-4 flex-row justify-between items-center bg-slate-50/50 dark:bg-slate-900/50">
                                <Text style={{ color: theme.text }} className="text-sm font-black uppercase tracking-wider">{label}</Text>
                                <TouchableOpacity onPress={() => setIsOpen(false)} className="px-3 py-1 bg-slate-200 dark:bg-slate-800 rounded-lg">
                                    <Text style={{ color: theme.text }} className="text-xs font-bold">Done</Text>
                                </TouchableOpacity>
                            </View>
                            {renderCalendarGrid()}
                        </View>
                    </SafeAreaView>
                </Modal>
            )}
        </View>
    );
}
