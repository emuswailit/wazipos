// api/rolesApi.ts
import { RoleItem } from "@/databases/types";
import { ApiResponse } from "apisauce";
import client from "./client";

interface RoleMutationResponse {
    response_code?: number | string;
    response_message?: string;
    message?: string;
    errors?: unknown;
    data?: RoleItem;
}

interface RolesResponse {
    count: number;
    next: string | null;
    previous: string | null;
    results: RoleItem[];
}

// Payload for creating a role (requires cluster)
interface CreateRoleDetails {
    title: string;
    cluster: string;
    description?: string;
}

// 🟢 Payload for updating a role (matches your Postman exactly)
interface UpdateRoleDetails {
    id: string;
    title: string;
    description?: string;
    cluster?: string; // Made optional, in case you still want to send it
}

const getRoles = (): Promise<ApiResponse<RolesResponse>> => {
    return client.post<RolesResponse>(
        "authentication/roles",
        { action: "GetEntityRoles" },
        { timeout: 15000 }
    );
};

const createRole = (details: CreateRoleDetails): Promise<ApiResponse<RoleMutationResponse>> => {
    return client.post<RoleMutationResponse>(
        "authentication/roles",
        {
            action: "CreateRole",
            role_details: details
        },
        { timeout: 15000 }
    );
};

const updateRole = (details: UpdateRoleDetails): Promise<ApiResponse<RoleMutationResponse>> => {
    return client.post<RoleMutationResponse>(
        "authentication/roles",
        {
            action: "UpdateRole",
            role_details: details
        },
        { timeout: 15000 }
    );
};

const rolesService = {
    getRoles,
    createRole,
    updateRole,
};

export default rolesService;