import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Text, View } from 'react-native';

interface MomoPollerModalProps { visible: boolean; draftId: string; theme: any; submitOrderApi: any; onVerificationComplete: (success: boolean, msg: string) => void; }

export const MomoPollerModal: React.FC<MomoPollerModalProps> = ({ visible, draftId, theme, submitOrderApi, onVerificationComplete }) => {
    const [dots, setDots] = useState('.');
    const timerRef = useRef<any>(null); // ✅ Tracks execution identifiers across all macro tasks safely

    // 1. Loading Text Indicator Animation Dots
    useEffect(() => {
        if (visible) {
            const id = setInterval(() => setDots(p => p.length >= 3 ? '.' : p + '.'), 500);
            return () => clearInterval(id);
        }
    }, [visible]);

    // 2. Safe Recursive Telemetry Polling Layer Loop
    useEffect(() => {
        let count = 0;
        let isUnmounted = false;

        const pollStatus = async () => {
            if (isUnmounted) return;

            // ✅ Clean structural exit when 1-minute timeout limit is satisfied (12 polls × 5s)
            if (count >= 12) {
                onVerificationComplete(false, "Payment verification timed out. Please verify on your handset device and try again.");
                return;
            }

            try {
                const res = await submitOrderApi.request({ action: "VerifyMobileMoneyPayment", draft_id: draftId });
                const serverStatus = res?.data?.status || res?.data?.data?.status;
                const errorMessage = res?.data?.message || res?.data?.data?.message;

                if (res?.ok && serverStatus === 'SUCCESS') {
                    onVerificationComplete(true, "Mobile money payment received successfully!");
                    return;
                }

                if (serverStatus === 'FAILED') {
                    onVerificationComplete(false, errorMessage || "Transaction was cancelled or failed.");
                    return;
                }
            } catch (e) {
                console.warn("Momo verification poll pipeline request failed:", e);
            }

            count++;
            // ✅ Always overwrite the active reference identifier to clean up background drift leaks
            timerRef.current = setTimeout(pollStatus, 5000);
        };

        if (visible && draftId) {
            pollStatus();
        }

        return () => {
            isUnmounted = true;
            if (timerRef.current) clearTimeout(timerRef.current); // ✅ Kills all leaking macro timers instantly on close
        };
    }, [visible, draftId]);

    if (!visible) return null;

    return (
        <Modal visible={visible} transparent={true} animationType="fade">
            <View className="flex-1 bg-black/50 justify-center items-center p-6">
                <View style={{ backgroundColor: theme.panel }} className="w-full max-w-sm p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl items-center">
                    <ActivityIndicator size="large" color={theme.primary} />
                    <Text style={{ fontFamily: theme.font.bold, fontSize: theme.fontSize.base, color: theme.text }} className="mt-4 font-black text-center">Verifying Mobile Money Payment{dots}</Text>
                    <Text style={{ fontFamily: theme.font.regular, fontSize: theme.fontSize.xs }} className="text-slate-400 mt-1 text-center">Please approve the prompt on your handset terminal</Text>
                </View>
            </View>
        </Modal>
    );
};
