import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Text, TextInput, TouchableOpacity, View } from 'react-native';
import AutocompleteProductSelect from './AutocompleteProductSelect ';

export default function OutOfStockFormModal({ theme, isDarkMode, visible, productOptions, editItem, submitting, onClose, onSubmit }: any) {
    const [p, setP] = useState<any>(null);
    const [q, setQ] = useState('');
    const [n, setN] = useState('');
    const [ph, setPh] = useState('');
    const [errs, setErrs] = useState<any>({});
    const [tch, setTch] = useState<any>({});

    useEffect(() => {
        if (editItem) {
            setP(productOptions.find(i => i.id === editItem.product) || { id: editItem.product, title: editItem.product_title });
            setQ(String(editItem.required_quantity || '')); setN(editItem.customer_name || ''); setPh(editItem.customer_phone || '');
        } else { setP(null); setQ(''); setN(''); setPh(''); }
        setErrs({}); setTch({});
    }, [editItem, visible]);

    const val = () => {
        const e: any = {};
        if (!p) e.p = 'Product selection is mandatory.';
        if (!q.trim() || isNaN(Number(q)) || Number(q) <= 0) e.q = 'Quantity must be a positive number.';
        setErrs(e); return !Object.keys(e).length;
    };

    const sub = () => { setTch({ p: 1, q: 1 }); if (val()) onSubmit({ product: p, required_quantity: q, customer_name: n.trim(), customer_phone: ph.trim() }); };
    const bColor = (k: string) => tch[k] && errs[k] ? '#ef4444' : (isDarkMode ? '#334155' : '#cbd5e1');

    return (
        <Modal animationType="fade" transparent visible={visible} onRequestClose={onClose}>
            <View className="flex-1 justify-center items-center bg-slate-900/60 p-4 backdrop-blur-xs">
                <View className="w-full max-w-xl border rounded-3xl p-6 shadow-2xl flex-col" style={{ backgroundColor: theme.panel, borderColor: isDarkMode ? '#334155' : '#e2e8f0' }}>
                    <View className="w-full flex-row justify-between items-center pb-3 border-b border-slate-100 dark:border-slate-800 mb-4">
                        <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: theme.fontSize.lg }} className="font-black tracking-tight">{editItem ? 'Modify Shortage Entry Log' : 'Register Pipeline Stockout'}</Text>
                        <TouchableOpacity disabled={submitting} onPress={onClose} className="p-1"><Text style={{ color: theme.textDark, fontFamily: theme.font.bold }} className="text-sm font-bold">✕</Text></TouchableOpacity>
                    </View>
                    <View className="w-full flex-col gap-y-3.5">
                        <AutocompleteProductSelect theme={theme} isDarkMode={isDarkMode} options={productOptions} selectedValue={p} error={errs.p} touched={tch.p} onChange={(v: any) => { setP(v); setTch((o: any) => ({ ...o, p: 1 })); setErrs((e: any) => { const { p, ...r } = e; return v ? r : { ...r, p: 'Required.' }; }); }} />
                        <View className="flex-col w-full">
                            <Text style={{ color: theme.textDark, fontFamily: theme.font.bold, fontSize: theme.fontSize.xs }} className="mb-1.5 uppercase tracking-wider font-bold">Quantity (Packs) <Text className="text-rose-500">*</Text></Text>
                            <TextInput style={{ backgroundColor: isDarkMode ? '#0f172a' : '#ffffff', color: theme.text, borderColor: bColor('q'), fontFamily: theme.font.medium, fontSize: theme.fontSize.base }} className="w-full px-3.5 py-2.5 border rounded-xl shadow-xs" placeholder="e.g. 10" placeholderTextColor={isDarkMode ? '#475569' : '#94a3b8'} keyboardType="numeric" value={q} editable={!submitting} onChangeText={t => { setQ(t); setTch((o: any) => ({ ...o, q: 1 })); }} onBlur={val} />
                            {tch.q && errs.q && <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.xs }} className="text-rose-500 mt-1 pl-1 font-bold">{errs.q}</Text>}
                        </View>
                        <View className="flex-col w-full">
                            <Text style={{ color: theme.textDark, fontFamily: theme.font.bold, fontSize: theme.fontSize.xs }} className="mb-1.5 uppercase tracking-wider font-bold">Client Reference Name</Text>
                            <TextInput style={{ backgroundColor: isDarkMode ? '#0f172a' : '#ffffff', color: theme.text, borderColor: isDarkMode ? '#334155' : '#cbd5e1', fontFamily: theme.font.medium, fontSize: theme.fontSize.base }} className="w-full px-3.5 py-2.5 border rounded-xl shadow-xs" placeholder="e.g. Walk-in Customer" placeholderTextColor={isDarkMode ? '#475569' : '#94a3b8'} value={n} editable={!submitting} onChangeText={setN} />
                        </View>
                        <View className="flex-col w-full mb-2">
                            <Text style={{ color: theme.textDark, fontFamily: theme.font.bold, fontSize: theme.fontSize.xs }} className="mb-1.5 uppercase tracking-wider font-bold">Callback Phone Line</Text>
                            <TextInput style={{ backgroundColor: isDarkMode ? '#0f172a' : '#ffffff', color: theme.text, borderColor: isDarkMode ? '#334155' : '#cbd5e1', fontFamily: theme.font.medium, fontSize: theme.fontSize.base }} className="w-full px-3.5 py-2.5 border rounded-xl shadow-xs" placeholder="e.g. 0712345678" placeholderTextColor={isDarkMode ? '#475569' : '#94a3b8'} keyboardType="phone-pad" value={ph} editable={!submitting} onChangeText={setPh} />
                        </View>
                    </View>
                    <View className="w-full flex-row justify-end items-center gap-x-3 pt-4 border-t border-slate-100 dark:border-slate-800 mt-4">
                        <TouchableOpacity disabled={submitting} onPress={onClose} style={{ borderColor: isDarkMode ? '#334155' : '#cbd5e1' }} className="px-4 h-10 border rounded-xl items-center justify-center bg-transparent"><Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: theme.fontSize.xs }} className="font-bold uppercase tracking-wider">Cancel</Text></TouchableOpacity>
                        <TouchableOpacity disabled={submitting} onPress={sub} style={{ backgroundColor: theme.primary }} className="px-5 h-10 rounded-xl items-center justify-center shadow-md">{submitting ? <ActivityIndicator color="#fff" size="small" /> : <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.xs, color: '#fff' }} className="font-bold uppercase tracking-wider">{editItem ? 'Save Updates' : 'Commit Log'}</Text>}</TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    );
}
