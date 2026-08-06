import { ApiResponse } from "apisauce";
import { AxiosProgressEvent } from "axios";
import client from "../client";

// 1. NESTED PROPERTY SCHEMAS
export interface FrequencyDetailsData {
  title: string;
  description: string;
  abbreviation: string;
  latin: string;
  numerical: string | number; // Support string values matching your payload structure
}

export interface FrequencyActionPayload {
  action: "GetFrequencies" | "CreateFrequency" | "UpdateFrequency" | string;
  frequency_details?: FrequencyDetailsData; // 🌟 FIXED: Nested structure key
  [key: string]: any;
}

export type UploadProgressCallback = (progressFraction: number) => void;

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

// 2. INTERACTION METHODS WITH REALIGNED CONTRACTS
const addFrequency = (
  data: FrequencyActionPayload,
  onUploadProgress?: UploadProgressCallback
): Promise<ApiResponse<any>> => {
  return client.post("/drugs/frequencies", data, createConfigWithProgress(onUploadProgress));
};

const updateFrequency = (
  data: FrequencyActionPayload,
  onUploadProgress?: UploadProgressCallback
): Promise<ApiResponse<any>> => {
  return client.post("/drugs/frequencies", data, createConfigWithProgress(onUploadProgress));
};

const getFrequencies = (
  data: FrequencyActionPayload,
  onUploadProgress?: UploadProgressCallback
): Promise<ApiResponse<any>> => {
  return client.post("/drugs/frequencies", data, createConfigWithProgress(onUploadProgress));
};

export default {
  addFrequency,
  getFrequencies,
  updateFrequency,
};
