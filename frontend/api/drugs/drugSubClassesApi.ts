import { ApiResponse } from "apisauce";
import client from "../client";

export type UploadProgressCallback = (progressFraction: number) => void;

export interface DrugSubClassPayload {
  title: string;
  description: string;
  drug_class: string;
  id?: string;
}

const addDrugSubClass = (
  data: DrugSubClassPayload
): Promise<ApiResponse<any>> => {
  const payload = {
    action: "CreateDrugSubClass",
    drug_sub_class_details: {
      title: data.title.trim(),
      description: data.description.trim(),
      drug_class: data.drug_class.trim()
    }
  };

  // 🌐 WEB LOGGER: Logs outbound data block before it leaves the browser instance
  console.log(`📤 [Outbound API Dispatch] POST /drugs/drugsubclasses Payload:`, JSON.stringify(payload));

  return client.post("/drugs/drugsubclasses", payload);
};

const updateDrugSubClass = (
  data: any,
  onUploadProgress?: UploadProgressCallback
): Promise<ApiResponse<any>> => {
  return client.post("/drugs/drugsubclasses", data, {
    ...(onUploadProgress && {
      onUploadProgress: (progressEvent) => {
        const total = progressEvent.total ?? progressEvent.loaded;
        onUploadProgress(progressEvent.loaded / total);
      },
    }),
  });
};

const getDrugSubClasses = (
  data: any,
  onUploadProgress?: UploadProgressCallback
): Promise<ApiResponse<any>> => {
  return client.post("/drugs/drugsubclasses", data, {
    ...(onUploadProgress && {
      onUploadProgress: (progressEvent) => {
        const total = progressEvent.total ?? progressEvent.loaded;
        onUploadProgress(progressEvent.loaded / total);
      },
    }),
  });
};

const drugSubClassesApi = {
  addDrugSubClass,
  getDrugSubClasses,
  updateDrugSubClass,
};

export default drugSubClassesApi;
