// api/departmentsApi.ts
import { DepartmentItem } from "@/databases/types";
import { ApiResponse } from "apisauce";
import client from "./client";

interface DepartmentsResponse {
    count: number;
    next: string | null;
    previous: string | null;
    results: DepartmentItem[];
}

// 🟢 Flat payload matching Postman
interface DepartmentPayload {
    action: "CreateDepartment" | "UpdateDepartment";
    department?: string; // The ID for updates
    title: string;
    department_type?: string;
    description?: string;
}

const getDepartments = (): Promise<ApiResponse<DepartmentsResponse>> => {
    return client.post<DepartmentsResponse>(
        "authentication/departments",
        { action: "GetEntityDepartments" },
        { timeout: 15000 }
    );
};

const createDepartment = (data: DepartmentPayload): Promise<ApiResponse<DepartmentItem>> => {
    return client.post<DepartmentItem>("authentication/departments", data, { timeout: 15000 });
};

const updateDepartment = (data: DepartmentPayload): Promise<ApiResponse<DepartmentItem>> => {
    return client.post<DepartmentItem>("authentication/departments", data, { timeout: 15000 });
};

const departmentsService = {
    getDepartments,
    createDepartment,
    updateDepartment,
};

export default departmentsService;