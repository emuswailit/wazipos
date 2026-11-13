// api/cadresApi.ts
import { CadreItem } from "@/databases/types";
import { ApiResponse } from "apisauce";
import client from "./client";

interface CadresResponse {
    count: number;
    next: string | null;
    previous: string | null;
    results: CadreItem[];
}

interface CadrePayload {
    action: "CreateCadre" | "UpdateCadre";
    cadre_details: {
        id?: string;
        title: string;
        cluster: string;
    };
}

const getCadres = (): Promise<ApiResponse<CadresResponse>> => {
    return client.post<CadresResponse>(
        "authentication/cadres",
        { action: "GetCadres" },
        { timeout: 15000 }
    );
};

const createCadre = (data: CadrePayload): Promise<ApiResponse<CadreItem>> => {
    return client.post<CadreItem>("authentication/cadres", data, { timeout: 15000 });
};

const updateCadre = (data: CadrePayload): Promise<ApiResponse<CadreItem>> => {
    return client.post<CadreItem>("authentication/cadres", data, { timeout: 15000 });
};

const cadresService = {
    getCadres,
    createCadre,
    updateCadre,
};

export default cadresService;