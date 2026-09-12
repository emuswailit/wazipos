import React, { useMemo, useState } from 'react';
import { Modal, Text, TouchableOpacity, TouchableWithoutFeedback, View } from 'react-native';
interface FulfillmentCalendarModalProps {
    visible: boolean;
    onClose: () => void;
    dueDate: string;
    onSelectDate: (dateVal: string) => void;
    theme: any;
}
export const FulfillmentCalendarModal: React.FC<FulfillmentCalendarModalProps> = ({ visible, onClose, dueDate, onSelectDate, theme }) => {
    const [viewDate, setViewDate] = useState(() => new Date());
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const currentMonthLabel = viewDate.toLocaleDateString([], { month: 'long', year: 'numeric' });
    const calendarDays = useMemo(() => {
        const firstDayIndex = new Date(year, month, 1).getDay();
        const totalDays = new Date(year, month + 1, 0).getDate();
        const todayZero = new Date(new Date().setHours(0, 0, 0, 0));
        const daysArray: Array<{ dayNum: number | null; value: string; isPast: boolean }> = [];
        for (let i = 0; i < firstDayIndex; i++) {
            daysArray.push({ dayNum: null, value: '', isPast: true });
        }
        for (let d = 1; d <= totalDays; d++) {
            const dateObj = new Date(year, month, d);
            daysArray.push({
                dayNum: d,
                value: `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
                isPast: dateObj < todayZero
            });
        }
        return daysArray;
    }, [year, month]);
    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            <TouchableWithoutFeedback onPress={onClose}>
                <View className="flex-1 bg-black/50 justify-center items-center p-4">
                    <TouchableWithoutFeedback onPress={() => { }}>
                        <View style={{ backgroundColor: theme.panel }} className="w-full max-w-sm rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-2xl">
                            <View className="flex-row justify-between items-center mb-4">
                                <TouchableOpacity onPress={() => setViewDate(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))} className="p-2 bg-slate-100 dark:bg-slate-800 rounded-lg active:scale-95">
                                    <Text style={{ fontFamily: theme.font.bold, color: theme.text }}>‹</Text>
                                </TouchableOpacity>
                                <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.base, color: theme.text }}>{currentMonthLabel}</Text>
                                <TouchableOpacity onPress={() => setViewDate(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))} className="p-2 bg-slate-100 dark:bg-slate-800 rounded-lg active:scale-95">
                                    <Text style={{ fontFamily: theme.font.bold, color: theme.text }}>›</Text>
                                </TouchableOpacity>
                            </View>
                            <View className="flex-row mb-2">
                                {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((day) => (
                                    <View key={day} className="flex-1 items-center">
                                        <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.xs }} className="text-slate-400">{day}</Text>
                                    </View>
                                ))}
                            </View>
                            <View className="flex-row flex-wrap">
                                {calendarDays.map((day, index) => {
                                    const isSelected = dueDate === day.value;
                                    return (
                                        <View key={index} className="w-[14.28%] aspect-square p-0.5 justify-center items-center">
                                            {day.dayNum !== null ? (
                                                <TouchableOpacity disabled={day.isPast} onPress={() => onSelectDate(day.value)} style={{ backgroundColor: isSelected ? theme.primary : 'transparent' }} className={`w-full h-full rounded-xl justify-center items-center ${day.isPast ? 'opacity-20' : 'active:bg-slate-100 dark:active:bg-slate-800'}`}>
                                                    <Text style={{ fontFamily: isSelected ? theme.font.bold : theme.font.medium, fontSize: theme.fontSize.sm, color: isSelected ? '#ffffff' : theme.text }}>
                                                        {day.dayNum}
                                                    </Text>
                                                </TouchableOpacity>
                                            ) : null}
                                        </View>
                                    );
                                })}
                            </View>
                            <TouchableOpacity onPress={onClose} className="mt-4 w-full bg-slate-100 dark:bg-slate-800 py-2.5 rounded-xl items-center justify-center active:opacity-90">
                                <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.sm, color: theme.textDark }}>Close Calendar</Text>
                            </TouchableOpacity>
                        </View>
                    </TouchableWithoutFeedback>
                </View>
            </TouchableWithoutFeedback>
        </Modal>
    );
};
