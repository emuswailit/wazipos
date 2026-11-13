// api/designationsApi.ts
import { DesignationItem } from "@/databases/types";
import { ApiResponse } from "apisauce";
import client from "./client";

interface DesignationsResponse {
    count: number;
    next: string | null;
    previous: string | null;
    results: DesignationItem[];
}

// 🟢 Exact shape matching your Postman payloads
interface DesignationPayload {
    action: "CreateDesignation" | "UpdateDesignation";
    designation_details: {
        id?: string; // Only present on Update
        title: string;
        cadre: string;
        tenure: string;
        total_slots: string | number;
        duration_in_months: string | number;
        description?: string;
    };
}

const getDesignations = (): Promise<ApiResponse<DesignationsResponse>> => {
    return client.post<DesignationsResponse>(
        "employees/designations",
        { action: "EntityDesignations" },
        { timeout: 15000 }
    );
};

const createDesignation = (data: DesignationPayload): Promise<ApiResponse<DesignationItem>> => {
    return client.post<DesignationItem>("employees/designations", data, { timeout: 15000 });
};

const updateDesignation = (data: DesignationPayload): Promise<ApiResponse<DesignationItem>> => {
    return client.post<DesignationItem>("employees/designations", data, { timeout: 15000 });
};

const designationsService = {
    getDesignations,
    createDesignation,
    updateDesignation,
};

export default designationsService;