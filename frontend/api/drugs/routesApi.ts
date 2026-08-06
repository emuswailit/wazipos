import { ApiResponse } from "apisauce"; // 🌟 FIXED: Import apisauce wrapper types
import { AxiosProgressEvent } from "axios";
import client from "../client";

// 1. DATA AND PARAMETER TYPE INTERFACES
export interface RouteActionPayload {
  action: "GetRoutes" | "AddRoute" | "UpdateRoute" | string;
  [key: string]: any;
}

export type UploadProgressCallback = (progressFraction: number) => void;

// Helper to handle upload progress monitoring safely
const createConfigWithProgress = (onUploadProgress?: UploadProgressCallback) => {
  if (!onUploadProgress) return {};

  return {
    onUploadProgress: (progressEvent: AxiosProgressEvent) => {
      const total = progressEvent.total ?? 0;
      if (total > 0) {
        onUploadProgress(progressEvent.loaded / total);
      }
    },
  };
};

// 2. STRONGLY TYPED INTERACTION CONTROLLERS WITH APISAUCE WRAPPERS
const addRoute = (
  data: RouteActionPayload,
  onUploadProgress?: UploadProgressCallback
): Promise<ApiResponse<any>> => { // 🌟 FIXED: Changed type assignment signature here
  return client.post("/drugs/routes", data, createConfigWithProgress(onUploadProgress));
};

const updateRoute = (
  data: RouteActionPayload,
  onUploadProgress?: UploadProgressCallback
): Promise<ApiResponse<any>> => { // 🌟 FIXED: Changed type assignment signature here
  return client.post("/drugs/routes", data, createConfigWithProgress(onUploadProgress));
};

const getRoutes = (
  data: RouteActionPayload,
  onUploadProgress?: UploadProgressCallback
): Promise<ApiResponse<any>> => { // 🌟 FIXED: Changed type assignment signature here
  return client.post("/drugs/routes", data, createConfigWithProgress(onUploadProgress));
};

// 3. EXPORT MODULE DEFINITIONS
export default {
  addRoute,
  getRoutes,
  updateRoute,
};
