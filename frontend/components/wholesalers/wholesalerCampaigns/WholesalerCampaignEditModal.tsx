// Campaign meta-form (title, description, dates, budget, banner).
//
// Two server endpoints back this form:
//   POST /wholesalers/campaigns/create              (multipart, CBV)
//   POST /wholesalers/campaigns/<uuid>/update       (multipart, CBV)
//
// Both use MultiPartParser + FormParser only, so the payload is always
// FormData — even when no banner is attached. There is no JSON path.
//
// Banner is single-image in the UI. The backend stores a list under
// `campaign_banners`; we append a single file under that field name and
// hydrate the picker from the first banner of the returned array.
//
// Populate behaviour:
//   - The list screen passes a `Campaign` object. `campaign_banners` is
//     part of the list serializer, so its presence (even an empty array)
//     is trusted — no detail fetch happens.
//   - If the key is missing entirely (older callers, trimmed payloads),
//     this modal fetches the full record from GetCampaignDetails so the
//     picker can render the current banner.

import campaignsApi from "@/api/campaignsApi";
import type { Campaign } from "@/campaigns/types";
import {
    FormikImagePicker,
    appendToFormData,
    isPendingUpload,
    type ImageFieldValue,
} from "@/components/common";
import { useAlert } from "@/components/common/AlertProvider";
import { Button } from "@/components/common/Button";
import { CustomTextField } from "@/components/common/CustomTextField";
import { DateField } from "@/components/common/DateField";
import { Modal } from "@/components/common/Modal";
import { useAuth } from "@/context/AuthContext";
import { useCampaignMutations } from "@/hooks/useCampaigns";
import { Formik, FormikHelpers } from "formik";
import { useEffect, useState } from "react";
import {
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    View,
} from "react-native";
import * as Yup from "yup";

/* =========================================================
 * Types
 * ======================================================= */

interface Props {
    visible: boolean;
    onClose: () => void;
    onSaved: (campaign?: Campaign) => void;
    campaign?: Campaign | null;
}

interface FormValues {
    title: string;
    description: string;
    start: string;
    end: string;
    budget_cap: string;
    /**
     * Single-image form field. Maps to the backend's plural
     * `campaign_banners` list on submit — we append one file under
     * that name. Hydrated from `campaign_banners[0]?.campaign_banner`
     * on edit.
     */
    banner: ImageFieldValue;
}

const EMPTY: FormValues = {
    title: "",
    description: "",
    start: "",
    end: "",
    budget_cap: "",
    banner: null,
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const schema = Yup.object({
    title: Yup.string()
        .trim()
        .required("Title is required.")
        .max(200, "Title is too long."),
    description: Yup.string().max(500, "Description is too long."),
    start: Yup.string()
        .required("Start date is required.")
        .matches(DATE_RE, "Use YYYY-MM-DD format."),
    end: Yup.string()
        .required("End date is required.")
        .matches(DATE_RE, "Use YYYY-MM-DD format.")
        .test(
            "after-start",
            "End must be on or after start.",
            function (value) {
                const { start } = this.parent as FormValues;
                if (!value || !start) return true;
                return value >= start;
            }
        ),
    budget_cap: Yup.string().test(
        "positive",
        "Budget must be a positive number.",
        (v) => {
            if (!v) return true;
            const n = Number(v);
            return Number.isFinite(n) && n >= 0;
        }
    ),
    banner: Yup.mixed<ImageFieldValue>()
        .nullable()
        .test("banner-shape", "Invalid image value.", (v) => {
            if (v === null || v === undefined) return true;
            if (typeof v === "string") return true;
            return typeof v === "object" && "kind" in v;
        }),
});

function flattenErrors(errors: Record<string, string | string[]>): string {
    return Object.entries(errors)
        .map(([k, v]) => {
            const msg = Array.isArray(v) ? v.join(", ") : String(v);
            return k === "detail" ? msg : `${k}: ${msg}`;
        })
        .join("\n");
}

/* =========================================================
 * Payload builder
 * ======================================================= */

/**
 * Build the multipart body for the CBV endpoints.
 *
 * Rules:
 *   - Never include `campaign_id` — the id lives in the URL path for
 *     updates, and does not exist for creates.
 *   - Never include `action` — CBV endpoints are dedicated routes,
 *     not dispatcher actions.
 *   - Always FormData — both CBVs are parsed with
 *     (MultiPartParser, FormParser) only.
 *   - The banner field name is `campaign_banners` (plural), matching
 *     the backend's `_extract_banners` helper. A singular `banner`
 *     would be silently ignored.
 *   - Skip the banner entirely when nothing was uploaded. If we
 *     appended the existing URL string, `isPendingUpload` would be
 *     false and nothing would be attached anyway, but omitting it
 *     avoids a stray scalar in the payload.
 */
function buildPayload(values: FormValues): FormData {
    const fd = new FormData();

    fd.append("title", values.title.trim());

    const description = values.description.trim();
    if (description) {
        fd.append("description", description);
    }

    fd.append("start", values.start);
    fd.append("end", values.end);

    if (values.budget_cap) {
        fd.append("budget_cap", values.budget_cap);
    }

    if (isPendingUpload(values.banner)) {
        appendToFormData(fd, "campaign_banners", values.banner as any);
    }

    return fd;
}

/* =========================================================
 * Component
 * ======================================================= */

export default function WholesalerCampaignEditModal({
    visible,
    onClose,
    onSaved,
    campaign,
}: Props) {
    const { theme } = useAuth();
    const alert = useAlert();
    const mut = useCampaignMutations();
    const isEdit = !!campaign;

    /* ---------- Hydration ----------
     * The list screen passes a Campaign whose `campaign_banners` array
     * is part of the list serializer — its presence (even when empty)
     * means we already have everything the picker needs. If the key is
     * absent (older caller, trimmed payload), fetch the details so the
     * picker can render the current banner.
     */
    const [hydrated, setHydrated] = useState<Campaign | null>(
        campaign ?? null
    );
    const [hydrating, setHydrating] = useState(false);

    useEffect(() => {
        if (!visible) return;

        if (!campaign) {
            setHydrated(null);
            setHydrating(false);
            return;
        }

        // `campaign_banners` is a non-optional array on Campaign, but
        // at runtime an older caller may not have set it. `in` tells
        // us whether the key exists at all, regardless of emptiness.
        if ("campaign_banners" in (campaign as any)) {
            setHydrated(campaign);
            setHydrating(false);
            return;
        }

        let cancelled = false;
        (async () => {
            setHydrating(true);
            try {
                const res = await campaignsApi.getCampaignDetailsAction({
                    campaign_id: campaign.id,
                });
                const env = (res?.data ?? {}) as any;
                // Dispatcher returns `{ campaign: {...} }`.
                const full = env.campaign ?? campaign;
                if (!cancelled) setHydrated(full);
            } catch {
                // Fall back to whatever the caller passed.
                if (!cancelled) setHydrated(campaign);
            } finally {
                if (!cancelled) setHydrating(false);
            }
        })();

        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visible, campaign?.id]);

    /* ---------- Initial values ----------
     * Hydrate the single-image picker from the first banner in the
     * campaign's banner list. Additional banners are left untouched
     * on the server; this modal only manages the meta fields.
     */
    const initialValues: FormValues = hydrated
        ? {
            title: hydrated.title ?? "",
            description: hydrated.description ?? "",
            start: hydrated.start ?? "",
            end: hydrated.end ?? "",
            budget_cap: hydrated.budget_cap ?? "",
            banner:
                hydrated.campaign_banners?.[0]?.campaign_banner ?? null,
        }
        : EMPTY;

    /* ---------- Submit ---------- */

    const handleSubmit = async (
        values: FormValues,
        helpers: FormikHelpers<FormValues>
    ) => {
        try {
            const payload = buildPayload(values);

            // The update CBV takes the campaign id in the URL path,
            // so the mutation signature is (id, formData). The create
            // CBV takes just the form data.
            const res = isEdit
                ? await mut.updateCampaign(hydrated!.id, payload)
                : await mut.createCampaign(payload);

            const env = (res?.data ?? {}) as any;

            if (env?.response_code !== 0) {
                const flat: Record<string, string> = {};
                Object.entries(env.errors ?? {}).forEach(([k, v]) => {
                    flat[k] = Array.isArray(v) ? v[0] : String(v);
                });
                helpers.setErrors(flat);
                alert(
                    env.response_message ?? "Request failed",
                    flattenErrors(env.errors ?? {}) || undefined,
                    undefined,
                    "danger"
                );
                return;
            }

            // CBV responses carry the object under `wholesaler_campaign`.
            // Fall back through the other shapes for safety when the
            // caller re-uses this modal against the dispatcher path.
            const saved: Campaign | undefined =
                env.wholesaler_campaign ??
                env.campaign ??
                hydrated ??
                undefined;

            alert(
                "Success",
                env.response_message ??
                (isEdit ? "Campaign updated." : "Campaign created."),
                [
                    {
                        text: "OK",
                        onPress: () => onSaved(saved),
                    },
                ],
                "success"
            );
        } catch (e: any) {
            alert(
                isEdit ? "Could not update" : "Could not create",
                e?.message ?? "Unknown error",
                undefined,
                "danger"
            );
        } finally {
            helpers.setSubmitting(false);
        }
    };

    /* ---------- Render ---------- */

    return (
        <Modal
            visible={visible}
            onClose={onClose}
            title={isEdit ? "Edit campaign" : "New campaign"}
            maxHeightRatio={0.94}
        >
            {hydrating ? (
                <View
                    style={{
                        flex: 1,
                        alignItems: "center",
                        justifyContent: "center",
                        paddingVertical: 80,
                    }}
                >
                    <ActivityIndicator />
                </View>
            ) : (
                <Formik
                    key={`${hydrated?.id ?? "new"}-${visible}`}
                    enableReinitialize
                    initialValues={initialValues}
                    validationSchema={schema}
                    onSubmit={handleSubmit}
                >
                    {(formik) => {
                        const requiredFilled =
                            formik.values.title.trim().length > 0 &&
                            formik.values.start.length > 0 &&
                            formik.values.end.length > 0;

                        return (
                            <KeyboardAvoidingView
                                behavior={
                                    Platform.OS === "ios"
                                        ? "padding"
                                        : undefined
                                }
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
                                        name="title"
                                        label="TITLE"
                                        placeholder="e.g. Ramadan Essentials 2026"
                                    />

                                    <CustomTextField
                                        name="description"
                                        label="DESCRIPTION"
                                        placeholder="Optional summary"
                                        multiline
                                    />

                                    <FormikImagePicker
                                        name="banner"
                                        label="Banner"
                                        helpText="Optional. Shown at the top of the campaign card in the retailer's inbox."
                                        aspect={[16, 9]}
                                        disabled={formik.isSubmitting}
                                    />

                                    {/* ---- Window ---- */}
                                    <View
                                        style={{
                                            flexDirection: "row",
                                            gap: 12,
                                        }}
                                    >
                                        <View style={{ flex: 1 }}>
                                            <DateField
                                                name="start"
                                                label="STARTS"
                                            />
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <DateField
                                                name="end"
                                                label="ENDS"
                                            />
                                        </View>
                                    </View>

                                    <CustomTextField
                                        name="budget_cap"
                                        label="BUDGET CAP (OPTIONAL)"
                                        placeholder="e.g. 500000.00"
                                        keyboardType="decimal-pad"
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
                                        onPress={formik.handleSubmit}
                                        disabled={
                                            !requiredFilled ||
                                            formik.isSubmitting
                                        }
                                        loading={formik.isSubmitting}
                                        size="lg"
                                    >
                                        {isEdit
                                            ? "Save changes"
                                            : "Create campaign"}
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        onPress={onClose}
                                        disabled={formik.isSubmitting}
                                    >
                                        Cancel
                                    </Button>
                                </View>
                            </KeyboardAvoidingView>
                        );
                    }}
                </Formik>
            )}
        </Modal>
    );
}