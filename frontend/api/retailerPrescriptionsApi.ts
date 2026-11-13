// api/retailerPrescriptionsApi.ts

import { ApiResponse } from "apisauce";
import { Platform } from "react-native";
import client from "./client";

const LOG = (...args: any[]) => {
    if (__DEV__) {
        console.log("[retailerPrescriptionsApi]", ...args);
    }
};

const LOG_CREATE = (...args: any[]) => {
    if (__DEV__) {
        console.log("[retailerPrescriptionsApi:create]", ...args);
    }
};

const RETAIL_PRESCRIPTIONS_ENDPOINT = "/retailers/prescriptions";

/**
 * The prescriptions handlers (backend retail_prescriptions_utils) read plain
 * field names — `prescription`, `prescription_item`, `product`, … — while the
 * payload types here use `*_id`. Sending only `prescription_id` made lookups fail
 * with "Prescription ID is required". Copy each `<name>_id` to `<name>` (unless the
 * caller already set it) so both spellings reach the server.
 */
const WIRE_ID_FIELDS = ['prescription', 'prescription_item', 'product', 'preparation', 'route', 'frequency', 'payment_method', 'retailer_receipt'] as const;

function toWire<T extends object>(data: T): T & Record<string, unknown> {
    const out: Record<string, unknown> = { ...(data as any) };
    for (const name of WIRE_ID_FIELDS) {
        const v = out[`${name}_id`];
        if (v !== undefined && v !== null && v !== '' && (out[name] === undefined || out[name] === '')) out[name] = v;
    }
    return out as T & Record<string, unknown>;
}

const RETAIL_PRESCRIPTIONS_CREATE_ENDPOINT = "/retailers/prescriptions/create";

/* =========================================================
 * Shared enums (mirror Django model choices)
 * ======================================================= */

export type PrescriptionStatus = "CANCELLED" | "CLOSED" | "DISPENSED" | "QUEUING";
export type PrescriptionNature = "ACUTE" | "REPEAT";
export type PrescriptionGender = "FEMALE" | "MALE" | "OTHER";
export type PrescriptionRelationship = "CHILD" | "SELF" | "SIBLING" | "SPOUSE" | "PARENT" | "OTHER";
type AiExtractionStatus = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";
type UnitOfIssue = "Gram" | "Kilogram" | "Litre" | "Millilitre" | "Piece" | "Pack";
type TrueFalseString = "true" | "false";

/* =========================================================
 * Payload Types — action-dispatch endpoint
 * ======================================================= */

interface UpdateRetailPrescriptionPayload {
    action: "UpdateRetailPrescription";
    prescription_id?: string; // 🌟 Changed to string
    patient_name: string;
    patient_gender: PrescriptionGender;
    patient_date_of_birth: string;
    relationship: PrescriptionRelationship;
    nature: PrescriptionNature;
    comment?: string;
    status?: PrescriptionStatus;
    items?: CreateRetailPrescriptionItemPayload[];
}

interface GetRetailPrescriptionDetailsPayload {
    action: "GetRetailPrescriptionDetails";
    prescription_id: string; // 🌟 Changed to string
}

interface MakePrescriptionOrderPaymentPayload {
    action: "MakePrescriptionOrderPayment";
    prescription_id: string; // 🌟 Changed to string
    payment_method_id: string; // 🌟 Changed to string (UUID)
    amount?: number;
    phone_number?: string;
    reference_number?: string;
}

interface UpdateRetailPrescriptionItemPayload {
    action: "UpdateRetailPrescriptionItem";
    prescription_item_id: string; // 🌟 Changed to string
    product_id?: string; // 🌟 Changed to string
    preparation_id?: string; // 🌟 Changed to string
    route_id?: string; // 🌟 Changed to string
    frequency_id?: string; // 🌟 Changed to string
    dose?: string;
    days?: number;
    is_divisible?: TrueFalseString;
    required_unit_quantity?: number;
    issued_unit_quantity?: number;
    instruction?: string;
    unit_of_issue?: UnitOfIssue;
    retailer_receipt_id?: string;
    is_verified?: TrueFalseString;
}

interface RemoveRetailPrescriptionItemPayload {
    action: "RemoveRetailPrescriptionItem";
    prescription_item_id: string; // 🌟 Changed to string
}

interface CreateOrUpdatePrescriptionOrderItemPayload {
    action: "CreateOrUpdatePrescriptionOrderItem";
    prescription_id: string; // 🌟 Changed to string
    prescription_item_id?: string; // 🌟 Changed to string
    product_id: string; // 🌟 Changed to string
    retailer_receipt_id: string; // 🌟 Changed to string
    quantity: number;
    unit_of_issue?: UnitOfIssue;
}

interface RetrieveEntityRetailPrescriptionsPayload {
    action: "RetrieveEntityRetailPrescriptions";
    page?: number;
    page_size?: number;
    search?: string;
    status?: PrescriptionStatus;
}

interface RetrieveUserRetailPrescriptionsPayload {
    action: "RetrieveUserRetailPrescriptions";
    page?: number;
    page_size?: number;
    search?: string;
    status?: PrescriptionStatus;
}

interface GetRelatedEntityInventoryForProductPayload {
    action: "GetRelatedEntityInventoryForProduct";
    product_id: string; // 🌟 Changed to string
    page?: number;
    page_size?: number;
}

interface CreateRetailPrescriptionItemPayload {
    action: "CreateRetailPrescriptionItem";
    prescription_id: string; // 🌟 Changed to string
    product_id?: string; // 🌟 Changed to string
    preparation_id?: string; // 🌟 Changed to string
    route_id?: string; // 🌟 Changed to string
    frequency_id?: string; // 🌟 Changed to string
    dose?: string;
    days?: number;
    is_divisible?: TrueFalseString;
    required_unit_quantity?: number;
    instruction?: string;
    unit_of_issue?: UnitOfIssue;
    retailer_receipt_id?: string;
}

interface GetAdjacentPharmaciesPayload {
    action: "GetAdjacentPharmacies";
    latitude: number;
    longitude: number;
}

/* =========================================================
 * Payload Type — create endpoint
 * ======================================================= */

/**
 * React Native image file for FormData uploads. On web, pass a File or
 * Blob directly instead.
 */

export interface CreateRetailPrescriptionPayload {
    entity: string;
    images: any[];
    patient_name: string;
    patient_gender: PrescriptionGender;
    patient_date_of_birth: string;
    relationship: PrescriptionRelationship;
    nature: PrescriptionNature;
    comment?: string;
    status?: PrescriptionStatus;
    origin_latitude?: number;
    origin_longitude?: number;
    destination_latitude?: number;
    destination_longitude?: number;
}

/* =========================================================
 * Response envelopes
 * ======================================================= */

interface AiExtractedMedication {
    name?: string;
    dose?: string;
    frequency?: string;
    duration?: string;
    [key: string]: any;
}

interface AiExtractionResult {
    medications?: AiExtractedMedication[];
    patient?: Record<string, any>;
    [key: string]: any;
}

interface RetailPrescriptionData {
    id: string; // 🌟 Prescription ID is a UUID string
    patient_name: string;
    patient_gender: PrescriptionGender;
    patient_date_of_birth: string;
    relationship: PrescriptionRelationship;
    nature: PrescriptionNature;
    status: PrescriptionStatus;
    is_closed: TrueFalseString;
    is_dispensed: TrueFalseString;
    ai_extraction_status: AiExtractionStatus;
    prescription_items?: Array<Record<string, any>>;
    prescription_images?: Array<Record<string, any>>;
    [key: string]: any;
}

interface CreateRetailPrescriptionResponse {
    response_code: 0 | 1;
    response_message: string;
    prescription?: RetailPrescriptionData;
    ai_extracted_data?: AiExtractionResult | null;
    errors?: string[];
    status?: number;
}

interface AdjacentPharmacyData {
    remote_id: string;
    title: string;
    entity_type: string;
    town?: string;
    phone?: string;
    distance_km?: number;
    rating?: number;
    [key: string]: any;
}

interface GetAdjacentPharmaciesResponse {
    response_code: 0 | 1;
    response_message: string;
    pharmacies?: AdjacentPharmacyData[];
    errors?: string[];
}

/* =========================================================
 * API Actions — action-dispatch endpoint
 * ======================================================= */

const updateRetailPrescriptionAction = (data: UpdateRetailPrescriptionPayload): Promise<ApiResponse<any>> => {
    LOG("updateRetailPrescriptionAction →", { action: data.action, prescription_id: data.prescription_id });
    return client.post<any>(RETAIL_PRESCRIPTIONS_ENDPOINT, toWire(data)).then((res) => {
        LOG("updateRetailPrescriptionAction ←", { ok: res.ok, status: res.status, prescription_id: res.data?.prescription?.id });
        return res;
    });
};

const getRetailPrescriptionDetailsAction = (data: GetRetailPrescriptionDetailsPayload): Promise<ApiResponse<any>> => {
    LOG("getRetailPrescriptionDetailsAction →", data);
    return client.post<any>(RETAIL_PRESCRIPTIONS_ENDPOINT, toWire(data)).then((res) => {
        LOG("getRetailPrescriptionDetailsAction ←", { ok: res.ok, status: res.status, prescription_id: res.data?.prescription?.id });
        return res;
    });
};

const makePrescriptionOrderPaymentAction = (data: MakePrescriptionOrderPaymentPayload): Promise<ApiResponse<any>> => {
    LOG("makePrescriptionOrderPaymentAction →", { action: data.action, prescription_id: data.prescription_id });
    return client.post<any>(RETAIL_PRESCRIPTIONS_ENDPOINT, toWire(data)).then((res) => {
        LOG("makePrescriptionOrderPaymentAction ←", { ok: res.ok, status: res.status, order_id: res.data?.customer_order?.id });
        return res;
    });
};

const updateRetailPrescriptionItemAction = (data: UpdateRetailPrescriptionItemPayload): Promise<ApiResponse<any>> => {
    LOG("updateRetailPrescriptionItemAction →", { action: data.action, prescription_item_id: data.prescription_item_id });
    return client.post<any>(RETAIL_PRESCRIPTIONS_ENDPOINT, toWire(data)).then((res) => {
        LOG("updateRetailPrescriptionItemAction ←", { ok: res.ok, status: res.status });
        return res;
    });
};

const removeRetailPrescriptionItemAction = (data: RemoveRetailPrescriptionItemPayload): Promise<ApiResponse<any>> => {
    LOG("removeRetailPrescriptionItemAction →", data);
    return client.post<any>(RETAIL_PRESCRIPTIONS_ENDPOINT, toWire(data)).then((res) => {
        LOG("removeRetailPrescriptionItemAction ←", { ok: res.ok, status: res.status });
        return res;
    });
};

const createOrUpdatePrescriptionOrderItemAction = (data: CreateOrUpdatePrescriptionOrderItemPayload): Promise<ApiResponse<any>> => {
    LOG("createOrUpdatePrescriptionOrderItemAction →", { action: data.action, prescription_id: data.prescription_id });
    return client.post<any>(RETAIL_PRESCRIPTIONS_ENDPOINT, toWire(data)).then((res) => {
        LOG("createOrUpdatePrescriptionOrderItemAction ←", { ok: res.ok, status: res.status });
        return res;
    });
};

const retrieveEntityRetailPrescriptionsAction = (data: RetrieveEntityRetailPrescriptionsPayload): Promise<ApiResponse<any>> => {
    LOG("retrieveEntityRetailPrescriptionsAction →", data);
    return client.post<any>(RETAIL_PRESCRIPTIONS_ENDPOINT, toWire(data)).then((res) => {
        LOG("retrieveEntityRetailPrescriptionsAction ←", { ok: res.ok, status: res.status, count: res.data?.count ?? 0 });
        return res;
    });
};

const retrieveUserRetailPrescriptionsAction = (data: RetrieveUserRetailPrescriptionsPayload): Promise<ApiResponse<any>> => {
    LOG("retrieveUserRetailPrescriptionsAction →", data);
    return client.post<any>(RETAIL_PRESCRIPTIONS_ENDPOINT, toWire(data)).then((res) => {
        LOG("retrieveUserRetailPrescriptionsAction ←", { ok: res.ok, status: res.status, count: res.data?.count ?? 0 });
        return res;
    });
};

const getRelatedEntityInventoryForProductAction = (data: GetRelatedEntityInventoryForProductPayload): Promise<ApiResponse<any>> => {
    LOG("getRelatedEntityInventoryForProductAction →", data);
    return client.post<any>(RETAIL_PRESCRIPTIONS_ENDPOINT, toWire(data)).then((res) => {
        LOG("getRelatedEntityInventoryForProductAction ←", { ok: res.ok, status: res.status });
        return res;
    });
};

const createRetailPrescriptionItemAction = (data: CreateRetailPrescriptionItemPayload): Promise<ApiResponse<any>> => {
    LOG("createRetailPrescriptionItemAction →", { action: data.action, prescription_id: data.prescription_id });
    return client.post<any>(RETAIL_PRESCRIPTIONS_ENDPOINT, toWire(data)).then((res) => {
        LOG("createRetailPrescriptionItemAction ←", { ok: res.ok, status: res.status });
        return res;
    });
};

const getAdjacentPharmaciesAction = (
    data: GetAdjacentPharmaciesPayload
): Promise<ApiResponse<GetAdjacentPharmaciesResponse>> => {
    LOG("getAdjacentPharmaciesAction →", data);
    return client.post<any>(RETAIL_PRESCRIPTIONS_ENDPOINT, toWire(data)).then((res) => {
        LOG("getAdjacentPharmaciesAction ←", {
            ok: res.ok,
            status: res.status,
            count: res.data?.pharmacies?.length ?? 0
        });
        return res;
    });
};

/* =========================================================
 * Quotation flow clients
 *
 * The same screens serve three audiences, so they post through a client:
 *   pharmacyRxClient / customerRxClient → /retailers/prescriptions (remote API)
 *   adminRxClient                       → /retailers/prescriptions/admin/ (IsAdminUser)
 * Actions: GetRetailPrescriptionDetails, Create/Update/RemoveRetailPrescriptionItem,
 * MarkPrescriptionDigitized, SubmitPrescriptionQuotation, RemovePrescriptionQuoteLine,
 * ForwardPrescriptionForQuotation (owner → one pharmacy), PayPrescriptionQuotation,
 * SearchPharmacies, GetPrescriptionWholesaleSources,
 * GetRelatedEntityInventoryForProduct, RetrieveAllPrescriptions (admin).
 * ======================================================= */

const RETAIL_PRESCRIPTIONS_ADMIN_ENDPOINT = "/retailers/prescriptions/admin/";

export type PrescriptionsScope = "pharmacy" | "admin" | "customer";

export interface PrescriptionsClient {
    scope: PrescriptionsScope;
    post: (payload: Record<string, any> & { action: string }) => Promise<ApiResponse<any>>;
}

const postTo = (endpoint: string) => (payload: Record<string, any>) => client.post<any>(endpoint, toWire(payload));

export const pharmacyRxClient: PrescriptionsClient = { scope: "pharmacy", post: postTo(RETAIL_PRESCRIPTIONS_ENDPOINT) };
export const customerRxClient: PrescriptionsClient = { scope: "customer", post: postTo(RETAIL_PRESCRIPTIONS_ENDPOINT) };
export const adminRxClient: PrescriptionsClient = { scope: "admin", post: postTo(RETAIL_PRESCRIPTIONS_ADMIN_ENDPOINT) };

/* =========================================================
 * API Action — create endpoint (MULTIPART)
 * ======================================================= */

const createRetailPrescriptionAction = (
    data: CreateRetailPrescriptionPayload
): Promise<ApiResponse<CreateRetailPrescriptionResponse>> => {
    LOG_CREATE("createRetailPrescriptionAction →", {
        entity: data.entity,
        patient_name: data.patient_name,
        image_count: data.images.length,
    });

    const formData = new FormData();

    formData.append("entity", String(data.entity));
    formData.append("patient_name", data.patient_name);
    formData.append("patient_gender", data.patient_gender);
    formData.append("patient_date_of_birth", data.patient_date_of_birth);
    formData.append("relationship", data.relationship);
    formData.append("nature", data.nature);

    if (data.comment != null) formData.append("comment", data.comment);
    if (data.status != null) formData.append("status", data.status);

    if (data.origin_latitude != null && data.origin_longitude != null) {
        formData.append("origin_latitude", String(data.origin_latitude));
        formData.append("origin_longitude", String(data.origin_longitude));
    }
    if (data.destination_latitude != null && data.destination_longitude != null) {
        formData.append("destination_latitude", String(data.destination_latitude));
        formData.append("destination_longitude", String(data.destination_longitude));
    }

    data.images.forEach((file: any) => {
        if (Platform.OS === 'web' && file.file) {
            formData.append("images", file.file);
        } else if (file instanceof Blob) {
            formData.append("images", file);
        } else {
            formData.append("images", {
                uri: file.uri,
                name: file.fileName || file.name || `prescription_${Date.now()}.jpg`,
                type: file.mimeType || file.type || "image/jpeg",
            } as any);
        }
    });

    return client
        .post<CreateRetailPrescriptionResponse>(
            RETAIL_PRESCRIPTIONS_CREATE_ENDPOINT,
            formData,
            {
                headers: {
                    "Content-Type": "multipart/form-data",
                },
            }
        )
        .then((res) => {
            LOG_CREATE("createRetailPrescriptionAction ←", {
                ok: res.ok,
                status: res.status,
                response_code: res.data?.response_code,
                prescription_id: res.data?.prescription?.id,
                errors: res.data?.errors,
            });
            return res;
        });
};

/* =========================================================
 * Contract & Export
 * ======================================================= */

interface RetailerPrescriptionsApiContract {
    updateRetailPrescriptionAction: (data: UpdateRetailPrescriptionPayload) => Promise<ApiResponse<any>>;
    getRetailPrescriptionDetailsAction: (data: GetRetailPrescriptionDetailsPayload) => Promise<ApiResponse<any>>;
    makePrescriptionOrderPaymentAction: (data: MakePrescriptionOrderPaymentPayload) => Promise<ApiResponse<any>>;
    updateRetailPrescriptionItemAction: (data: UpdateRetailPrescriptionItemPayload) => Promise<ApiResponse<any>>;
    removeRetailPrescriptionItemAction: (data: RemoveRetailPrescriptionItemPayload) => Promise<ApiResponse<any>>;
    createOrUpdatePrescriptionOrderItemAction: (data: CreateOrUpdatePrescriptionOrderItemPayload) => Promise<ApiResponse<any>>;
    retrieveEntityRetailPrescriptionsAction: (data: RetrieveEntityRetailPrescriptionsPayload) => Promise<ApiResponse<any>>;
    retrieveUserRetailPrescriptionsAction: (data: RetrieveUserRetailPrescriptionsPayload) => Promise<ApiResponse<any>>;
    getRelatedEntityInventoryForProductAction: (data: GetRelatedEntityInventoryForProductPayload) => Promise<ApiResponse<any>>;
    createRetailPrescriptionItemAction: (data: CreateRetailPrescriptionItemPayload) => Promise<ApiResponse<any>>;
    getAdjacentPharmaciesAction: (data: GetAdjacentPharmaciesPayload) => Promise<ApiResponse<GetAdjacentPharmaciesResponse>>;
    createRetailPrescriptionAction: (data: CreateRetailPrescriptionPayload) => Promise<ApiResponse<CreateRetailPrescriptionResponse>>;
}

const apiExportInstance: RetailerPrescriptionsApiContract = {
    updateRetailPrescriptionAction,
    getRetailPrescriptionDetailsAction,
    makePrescriptionOrderPaymentAction,
    updateRetailPrescriptionItemAction,
    removeRetailPrescriptionItemAction,
    createOrUpdatePrescriptionOrderItemAction,
    retrieveEntityRetailPrescriptionsAction,
    retrieveUserRetailPrescriptionsAction,
    getRelatedEntityInventoryForProductAction,
    createRetailPrescriptionItemAction,
    getAdjacentPharmaciesAction,
    createRetailPrescriptionAction,
};

export default apiExportInstance;