// api/clustersApi.ts
import { ClusterItem } from "@/databases/types";
import { ApiResponse } from "apisauce";
import client from "./client";

interface ClustersResponse {
    count: number;
    next: string | null;
    previous: string | null;
    results: ClusterItem[];
}

interface ClusterPayload {
    action: "CreateCluster" | "UpdateCluster";
    cluster_details: {
        id?: string;
        title: string; // 🟢 Changed from label to title
    };
}

const getClusters = (): Promise<ApiResponse<ClustersResponse>> => {
    return client.post<ClustersResponse>(
        "authentication/clusters",
        { action: "GetClusters" },
        { timeout: 15000 }
    );
};

const createCluster = (data: ClusterPayload): Promise<ApiResponse<ClusterItem>> => {
    return client.post<ClusterItem>("authentication/clusters", data, { timeout: 15000 });
};

const updateCluster = (data: ClusterPayload): Promise<ApiResponse<ClusterItem>> => {
    return client.post<ClusterItem>("authentication/clusters", data, { timeout: 15000 });
};

const clustersService = {
    getClusters,
    createCluster,
    updateCluster,
};

export default clustersService;