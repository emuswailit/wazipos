import { ApiResponse } from "apisauce";
import client from "../client";

export type UploadProgressCallback = (progressFraction: number) => void;

export interface DrugClassPayload {
  title: string;
  description: string;

}

export interface CreateDrugClassRequest {
  action: "CreateDrugClass";
  drug_class_details: DrugClassPayload;
}

const addDrugClass = (
  data: DrugClassPayload,
  onUploadProgress?: UploadProgressCallback
): Promise<ApiResponse<any>> => {
  const payload: CreateDrugClassRequest = {
    action: "CreateDrugClass",
    drug_class_details: {
      title: data.title.trim(),
      description: data.description,

    }
  };

  return client.post("/drugs/drugclasses", payload, {
    ...(onUploadProgress && {
      onUploadProgress: (progressEvent) => {
        const total = progressEvent.total ?? progressEvent.loaded;
        onUploadProgress(progressEvent.loaded / total);
      },
    }),
  });
};

const updateDrugClass = (
  data: any,
  onUploadProgress?: UploadProgressCallback
): Promise<ApiResponse<any>> => {
  return client.post("/drugs/drugclasses", data, {
    ...(onUploadProgress && {
      onUploadProgress: (progressEvent) => {
        const total = progressEvent.total ?? progressEvent.loaded;
        onUploadProgress(progressEvent.loaded / total);
      },
    }),
  });
};

const getDrugClasses = (
  data: any,
  onUploadProgress?: UploadProgressCallback
): Promise<ApiResponse<any>> => {
  return client.post("/drugs/drugclasses", data, {
    ...(onUploadProgress && {
      onUploadProgress: (progressEvent) => {
        const total = progressEvent.total ?? progressEvent.loaded;
        onUploadProgress(progressEvent.loaded / total);
      },
    }),
  });
};

const drugClassesApi = {
  addDrugClass,
  getDrugClasses,
  updateDrugClass,
};

export default drugClassesApi;
