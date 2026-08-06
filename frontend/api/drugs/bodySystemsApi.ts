import { ApiResponse } from "apisauce"; // Or your local network package declaration path
import client from "../client";

export type UploadProgressCallback = (progressFraction: number) => void;

export interface BodySystemPayload {
  action: "CreateBodySystem" | "GetBodySystems" | "UpdateBodySystem" | string;
  body_system_details?: {
    title: string;
    description: string;
    code?: string;
  };
  [key: string]: any;
}

const addBodySystem = (
  data: BodySystemPayload,
  onUploadProgress?: UploadProgressCallback
): Promise<ApiResponse<any>> => { // 🌟 FIXED: Mapped securely to return custom wrapper ApiResponse contracts
  return client.post("/drugs/bodysystems", data, {
    ...(onUploadProgress && {
      onUploadProgress: (progressEvent) => {
        const total = progressEvent.total ?? progressEvent.loaded;
        onUploadProgress(progressEvent.loaded / total);
      },
    }),
  });
};

const updateBodySystem = (
  data: BodySystemPayload,
  onUploadProgress?: UploadProgressCallback
): Promise<ApiResponse<any>> => { // 🌟 FIXED: Type aligned to bypass missing 'statusText' parameters warnings
  return client.post("/drugs/bodysystems", data, {
    ...(onUploadProgress && {
      onUploadProgress: (progressEvent) => {
        const total = progressEvent.total ?? progressEvent.loaded;
        onUploadProgress(progressEvent.loaded / total);
      },
    }),
  });
};

const getBodySystems = (
  data: BodySystemPayload,
  onUploadProgress?: UploadProgressCallback
): Promise<ApiResponse<any>> => { // 🌟 FIXED: Standardised response wrapper engine across endpoints
  return client.post("/drugs/bodysystems", data, {
    ...(onUploadProgress && {
      onUploadProgress: (progressEvent) => {
        const total = progressEvent.total ?? progressEvent.loaded;
        onUploadProgress(progressEvent.loaded / total);
      },
    }),
  });
};

const bodySystemsApi = {
  addBodySystem,
  getBodySystems,
  updateBodySystem,
};

export default bodySystemsApi;
