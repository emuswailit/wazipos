import retailerReceiptsApi from "@/api/retailersApi";
import { useFormik } from "formik";
import moment from "moment";
import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Modal, ScrollView, Text, TouchableOpacity, View } from "react-native";
import * as Yup from "yup";
import useApi from "../../../hooks/useApi";
import FormFields from "./FormFields";
import FormModalHeader from "./FormModalHeader";

interface InventoryAddModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    isDarkMode: boolean;
    theme: {
        panel: string;
        background: string;
        text: string;
        textDark: string;
        primary: string;
        font: {
            regular: string;
            medium: string;
            bold: string;
            mono: string;
        };
    };
}

export default function InventoryAddModal({ isOpen, onClose, onSuccess, isDarkMode, theme }: InventoryAddModalProps) {
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const retailerReceiptsActionsApi = useApi(retailerReceiptsApi.retailerReceiptsAction);

    const formik = useFormik({
        initialValues: {
            manufacture_date: moment(new Date()).format("YYYY-MM-DD"),
            expiry_date: moment(new Date()).format("YYYY-MM-DD"),
            batch: "",
            bar_code: "",
            unit_quantity: "",
            pack_buying_price: "",
            unit_of_receipt: "PIECE",
            is_bulky: false,
            unit_selling_price: "",
            unit_price_discount: "",
            received_from: "",
            product: "",
        },
        validationSchema: Yup.object({
            product: Yup.string().required("Target product node reference is required"),
            unit_quantity: Yup.number().typeError("Must be numeric").min(0, "Cannot be negative").required("Quantity is required"),
            unit_selling_price: Yup.number().typeError("Must be numeric").min(0).required("Selling price is required"),
        }),
        onSubmit: async (values) => {
            setErrorMessage(null);
            const payloadDetails = {
                product: values.product,
                unit_quantity: values.unit_quantity ? parseInt(values.unit_quantity) : 0,
                unit_of_receipt: values.unit_of_receipt,
                is_bulky: String(values.is_bulky),
                pack_buying_price: values.pack_buying_price || 0,
                unit_selling_price: values.unit_selling_price || 0,
                unit_price_discount: values.unit_price_discount || 0,
                received_from: values.received_from || "",
                manufacture_date: values.manufacture_date,
                expiry_date: values.expiry_date,
                batch: values.batch,
                bar_code: values.bar_code,
                quantity_discount: null,
                price_discount: null,
            };

            await retailerReceiptsActionsApi.request({
                action: "CreateRetailerReceipt",
                retailer_receipt_details: payloadDetails,
            });
        },
    });

    useEffect(() => {
        if (retailerReceiptsActionsApi.data) {
            if (retailerReceiptsActionsApi.data.retailer_receipt) {
                formik.resetForm();
                onSuccess();
                onClose();
            }
            if (retailerReceiptsActionsApi.data.errors) {
                setErrorMessage(retailerReceiptsActionsApi.data.errors.join(", "));
            }
        }
    }, [retailerReceiptsActionsApi.data]);

    const marginMetrics = useMemo(() => {
        const costPrice = parseFloat(formik.values.pack_buying_price) || 0;
        const sellingPrice = parseFloat(formik.values.unit_selling_price) || 0;
        const discount = parseFloat(formik.values.unit_price_discount) || 0;

        const finalSellingPrice = sellingPrice - discount;
        const netProfit = finalSellingPrice - costPrice;
        const marginPercentage = finalSellingPrice > 0 ? (netProfit / finalSellingPrice) * 100 : 0;

        return { netProfit, marginPercentage, isLoss: netProfit <= 0 };
    }, [formik.values.pack_buying_price, formik.values.unit_selling_price, formik.values.unit_price_discount]);

    return (
        <Modal visible={isOpen} animationType="slide" transparent={true} onRequestClose={onClose}>
            <View className="flex-1 justify-center items-center bg-black/50 p-4">
                <View
                    className="w-full max-w-2xl rounded-2xl shadow-xl overflow-hidden max-h-[90%]"
                    style={{ backgroundColor: theme.panel }}
                >
                    <FormModalHeader onClose={onClose} isDarkMode={isDarkMode} theme={theme} />

                    <ScrollView className="p-4" contentContainerStyle={{ paddingBottom: 24 }}>
                        {errorMessage && (
                            <View className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl mb-4">
                                <Text className="text-xs text-red-500 font-semibold" style={{ fontFamily: theme.font.bold }}>
                                    {errorMessage}
                                </Text>
                            </View>
                        )}

                        <FormFields formik={formik} marginMetrics={marginMetrics} isDarkMode={isDarkMode} theme={theme} />
                    </ScrollView>

                    <View className="p-4 border-t flex-row gap-3" style={{ borderColor: isDarkMode ? '#334155' : '#e2e8f0' }}>
                        <TouchableOpacity
                            onPress={() => formik.resetForm()}
                            className="flex-1 py-3 bg-gray-100 dark:bg-slate-800 rounded-xl items-center"
                        >
                            <Text className="text-xs font-bold" style={{ color: theme.text, fontFamily: theme.font.bold }}>Reset</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            disabled={retailerReceiptsActionsApi.loading}
                            onPress={() => formik.handleSubmit()}
                            className="flex-1 py-3 rounded-xl items-center flex-row justify-center gap-2"
                            style={{ backgroundColor: theme.primary }}
                        >
                            {retailerReceiptsActionsApi.loading && <ActivityIndicator size="small" color="#ffffff" />}
                            <Text className="text-xs font-bold text-white" style={{ fontFamily: theme.font.bold }}>Save Inventory Node</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    );
}
