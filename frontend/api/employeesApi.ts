// api/employeesApi.ts
import { ApiResponse } from "apisauce";
import client from "./client";

type EmployeesActionType = 'CreateEmployee' | 'UpdateEmployee' | 'DeleteEmployee';

interface EmployeeDetailsPayload {
    id?: string;
    user_id: string;
    designation: string;
    department?: string;
    hire_date: string;
    terminal_date?: string;
    roles: string[];
    advert?: string;
    [key: string]: any;
}

interface EmployeesActionRequest {
    action: EmployeesActionType;
    employee_details: EmployeeDetailsPayload;
}

interface EmployeesActionResponse {
    ok: boolean;
    response_code: number | string;
    response_message?: string;
    errors?: any;
    [key: string]: any;
}

/**
 * Fetches the list of ALL employees for the Admin list page.
 */
const getAllEmployees = (): Promise<ApiResponse<any>> => {
    return client.post<any>(
        "/employees/admin",
        { action: "GetAllEmployees" },
        { timeout: 15000 }
    );
};

/**
 * Fetches delivery persons for a specific entity (Used in POS/Orders).
 */
const getDeliveryStaffAction = (payload: any): Promise<ApiResponse<any>> => {
    return client.post("/employees/admin", payload, { timeout: 15000 });
};

/**
 * Handles creating, updating, or deleting employee records.
 */
const employeesAction = (
    data: EmployeesActionRequest
): Promise<ApiResponse<EmployeesActionResponse>> => {
    return client.post<EmployeesActionResponse>("/employees/admin", data, { timeout: 15000 });
};

const employeesService = {
    getAllEmployees,
    getDeliveryStaffAction,
    employeesAction,
};

export default employeesService;