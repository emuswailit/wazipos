import type { Campaign } from "@/campaigns/types";
import { Button } from "@/components/common/Button";
import { CustomTextField } from "@/components/common/CustomTextField";
import { Modal } from "@/components/common/Modal";
import { useAuth } from "@/context/AuthContext";
import { useCampaignMutations } from "@/hooks/useCampaigns";
import { useEffect, useState } from "react";
import {
    Alert,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    View,
} from "react-native";

interface Props {
    visible: boolean;
    onClose: () => void;
    onSaved: (campaign?: Campaign) => void;
    campaign?: Campaign | null;
}

const EMPTY = {
    title: "",
    description: "",
    start: "",
    end: "",
    budget_cap: "",
};

/* Flatten the backend `errors` map into a single Alert body. */
function flattenErrors(errors: Record<string, string | string[]>): string {
    return Object.entries(errors)
        .map(([k, v]) => {
            const msg = Array.isArray(v) ? v.join(", ") : String(v);
            return k === "detail" ? msg : `${k}: ${msg}`;
        })
        .join("\n");
}

export default function WholesalerCampaignEditModal({
    visible,
    onClose,
    onSaved,
    campaign,
}: Props) {
    const { theme } = useAuth();
    const mut = useCampaignMutations();
    const isEdit = !!campaign;

    const [form, setForm] = useState(EMPTY);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (!visible) return;
        setErrors({});
        setForm(
            campaign
                ? {
                    title: campaign.title ?? "",
                    description: campaign.description ?? "",
                    start: campaign.start ?? "",
                    end: campaign.end ?? "",
                    budget_cap: campaign.budget_cap ?? "",
                }
                : EMPTY
        );
    }, [visible, campaign]);

    const onChange = <K extends keyof typeof EMPTY>(k: K, v: string) =>
        setForm((f) => ({ ...f, [k]: v }));

    const handleSubmit = async () => {
        setErrors({});
        setSubmitting(true);
        try {
            const payload = {
                title: form.title.trim(),
                description: form.description.trim() || undefined,
                start: form.start,
                end: form.end,
                budget_cap: form.budget_cap || undefined,
            };
            const res = isEdit
                ? await mut.updateCampaign({ campaign_id: campaign!.id, ...payload })
                : await mut.createCampaign(payload);

            const env = res?.data ?? {};

            /* -------- Backend returned an error envelope -------- */
            if (env.response_code !== 0) {
                const flat: Record<string, string> = {};
                Object.entries(env.errors ?? {}).forEach(([k, v]) => {
                    flat[k] = Array.isArray(v) ? v[0] : String(v);
                });
                setErrors(flat);
                Alert.alert(
                    env.response_message ?? "Request failed",
                    flattenErrors(env.errors ?? {}) || undefined
                );
                return;
            }

            /* -------- Success -------- */
            Alert.alert(
                "Success",
                env.response_message ??
                (isEdit ? "Campaign updated." : "Campaign created."),
                [
                    {
                        text: "OK",
                        onPress: () => onSaved(env.campaign ?? campaign ?? undefined),
                    },
                ]
            );
        } catch (e: any) {
            Alert.alert(
                isEdit ? "Could not update" : "Could not create",
                e?.message ?? "Unknown error"
            );
        } finally {
            setSubmitting(false);
        }
    };

    const canSubmit =
        form.title.trim().length > 0 &&
        form.start.length > 0 &&
        form.end.length > 0 &&
        !submitting;

    return (
        <Modal
            visible={visible}
            onClose={onClose}
            title={isEdit ? "Edit campaign" : "New campaign"}
            maxHeightRatio={0.94}
        >
            <KeyboardAvoidingView
                behavior={Platform.OS === "ios" ? "padding" : undefined}
                style={{ flex: 1 }}
            >
                <ScrollView
                    contentContainerStyle={{
                        paddingHorizontal: 16,
                        paddingTop: 16,
                        paddingBottom: 24,
                        gap: 16,
                    }}
                    keyboardShouldPersistTaps="handled"
                >
                    <CustomTextField
                        label="TITLE"
                        placeholder="e.g. Ramadan Essentials 2026"
                        value={form.title}
                        onChangeText={(v) => onChange("title", v)}
                        error={errors.title}
                    />

                    <CustomTextField
                        label="DESCRIPTION"
                        placeholder="Optional summary"
                        value={form.description}
                        onChangeText={(v) => onChange("description", v)}
                        multiline
                        error={errors.description}
                    />

                    <View style={{ flexDirection: "row", gap: 12 }}>
                        <View style={{ flex: 1 }}>
                            <CustomTextField
                                label="STARTS"
                                placeholder="YYYY-MM-DD"
                                value={form.start}
                                onChangeText={(v) => onChange("start", v)}
                                error={errors.start}
                                autoCapitalize="none"
                            />
                        </View>
                        <View style={{ flex: 1 }}>
                            <CustomTextField
                                label="ENDS"
                                placeholder="YYYY-MM-DD"
                                value={form.end}
                                onChangeText={(v) => onChange("end", v)}
                                error={errors.end}
                                autoCapitalize="none"
                            />
                        </View>
                    </View>

                    <CustomTextField
                        label="BUDGET CAP (OPTIONAL)"
                        placeholder="e.g. 500000.00"
                        value={form.budget_cap}
                        onChangeText={(v) => onChange("budget_cap", v)}
                        keyboardType="decimal-pad"
                        error={errors.budget_cap}
                    />
                </ScrollView>

                <View
                    style={{
                        paddingHorizontal: 16,
                        paddingVertical: 12,
                        borderTopColor: theme.border,
                        borderTopWidth: 1,
                        gap: 8,
                    }}
                >
                    <Button
                        onPress={handleSubmit}
                        disabled={!canSubmit}
                        loading={submitting}
                        size="lg"
                    >
                        {isEdit ? "Save changes" : "Create campaign"}
                    </Button>
                    <Button variant="ghost" onPress={onClose} disabled={submitting}>
                        Cancel
                    </Button>
                </View>
            </KeyboardAvoidingView>
        </Modal>
    );
}