import { useAuth } from '@/context/AuthContext';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Text, TouchableOpacity, View } from 'react-native';
interface PollingModalProps {
    isOpen: boolean; orderRef: string; mobileNumber: string; serverError: string | null; onClose: () => void; onSuccess: () => void;
}
export default function PaymentPollingModal({ isOpen, orderRef, mobileNumber, serverError, onClose, onSuccess }: PollingModalProps) {
    const { theme, isDarkMode } = useAuth();
    const [statusStage, setStatusStyle] = useState<'SENDING' | 'WAITING' | 'SUCCESS' | 'FAILED'>('SENDING');
    const [secondsElapsed, setSecondsElapsed] = useState(0);
    const pollingIntervalRef = useRef<any>(null);
    useEffect(() => {
        if (!isOpen) return;
        setStatusStyle('SENDING');
        setSecondsElapsed(0);
        let ticks = 0;
        pollingIntervalRef.current = setInterval(() => {
            ticks += 3;
            setSecondsElapsed(ticks);
            if (ticks === 3) { setStatusStyle('WAITING'); }
            else if (serverError) { clearInterval(pollingIntervalRef.current); setStatusStyle('FAILED'); }
            else if (ticks >= 15) { clearInterval(pollingIntervalRef.current); setStatusStyle('SUCCESS'); setTimeout(() => { onSuccess(); }, 1500); }
        }, 3000);
        return () => { if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current); };
    }, [isOpen, serverError]);
    useEffect(() => { if (serverError && isOpen) { if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current); setStatusStyle('FAILED'); } }, [serverError, isOpen]);
    if (!isOpen) return null;
    return (
        <Modal visible={isOpen} animationType="slide" transparent>
            <View className="flex-1 justify-center items-center p-4 bg-black/60 backdrop-blur-sm">
                <View style={{ backgroundColor: theme.panel, borderColor: theme.isDarkMode ? '#334155' : '#cbd5e1' }} className="w-full max-w-sm rounded-2xl p-6 shadow-2xl items-center flex-col border">
                    {(statusStage === 'SENDING' || statusStage === 'WAITING') && (
                        <View className="w-14 h-14 bg-sky-500/10 rounded-full items-center justify-center mb-4">
                            <ActivityIndicator size="large" color={theme.primary} />
                        </View>
                    )}
                    {statusStage === 'SUCCESS' && (
                        <View className="w-14 h-14 bg-emerald-500/10 rounded-full items-center justify-center mb-4 border border-emerald-500/20">
                            <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.xl }} className="text-emerald-600 text-center">✓</Text>
                        </View>
                    )}
                    {statusStage === 'FAILED' && (
                        <View className="w-14 h-14 bg-rose-500/10 rounded-full items-center justify-center mb-4 border border-rose-500/20">
                            <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.xl }} className="text-rose-600 text-center">✕</Text>
                        </View>
                    )}
                    <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.lg, color: theme.text }} className="uppercase text-center tracking-wide font-bold">
                        {statusStage === 'SENDING' && "Initiating STK Push"}
                        {statusStage === 'WAITING' && "Awaiting Customer PIN"}
                        {statusStage === 'SUCCESS' && "Payment Confirmed"}
                        {statusStage === 'FAILED' && "Transaction Failed"}
                    </Text>
                    <Text style={{ fontFamily: theme.font.regular, fontSize: theme.fontSize.sm, color: theme.textDark }} className="text-center mt-1 font-semibold px-2">
                        {statusStage === 'SENDING' && `Dispatching interactive network handshake rules request down to phone stream node: ${mobileNumber}...`}
                        {statusStage === 'WAITING' && "A prompt request was broadcasted successfully. Please type your M-Pesa Pin secure key code on your handset device screen."}
                        {statusStage === 'SUCCESS' && "Verification complete. Order ledger funds accounted for."}
                        {statusStage === 'FAILED' && "The mobile monetary payment confirmation check failed to finalize smoothly with the network hub aggregator."}
                    </Text>
                    {(statusStage === 'SENDING' || statusStage === 'WAITING') && (
                        <Text style={{ fontFamily: theme.font.mono, fontSize: theme.fontSize.xs, color: theme.textDark }} className="mt-3 uppercase tracking-wider opacity-60">
                            Polling Telemetry Node... ({secondsElapsed}s)
                        </Text>
                    )}
                    {statusStage === 'FAILED' && serverError && (
                        <View className="w-full p-2.5 rounded-xl bg-rose-500/5 border border-rose-500/10 mt-3.5">
                            <Text style={{ fontFamily: theme.font.mono, fontSize: theme.fontSize.xs }} className="font-medium text-rose-600 dark:text-rose-400 text-center">{serverError}</Text>
                        </View>
                    )}
                    {(statusStage === 'FAILED' || statusStage === 'SUCCESS') && (
                        <TouchableOpacity onPress={onClose} style={{ backgroundColor: statusStage === 'SUCCESS' ? '#10b981' : theme.primary }} className="w-full h-10 rounded-xl items-center justify-center mt-5 active:scale-95 shadow-sm">
                            <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.xs }} className="text-white font-black uppercase tracking-wide">
                                {statusStage === 'SUCCESS' ? "Dismiss" : "Return to Safe Screen"}
                            </Text>
                        </TouchableOpacity>
                    )}
                </View>
            </View>
        </Modal>
    );
}
