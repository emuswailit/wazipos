import { ApiResponse } from "apisauce";
import client from "../client";

export type UploadProgressCallback = (progressFraction: number) => void;

export interface PreparationPayload {
  title: string;
  description: string;
  formulation_id: string;
  generics: string[];
  id?: string;
}

const addPreparation = (
  data: PreparationPayload
): Promise<ApiResponse<any>> => {
  const payload = {
    action: "CreatePreparation",
    preparation_details: {
      title: data.title.trim(),
      description: data.description.trim(),
      formulation_id: data.formulation_id.trim(),
      generics: data.generics
    }
  };
  return client.post("/drugs/preparations", payload);
};

const updatePreparation = (
  data: any,
  onUploadProgress?: UploadProgressCallback
): Promise<ApiResponse<any>> => {
  return client.post("/drugs/preparations", data, {
    ...(onUploadProgress && {
      onUploadProgress: (progressEvent) => {
        const total = progressEvent.total ?? progressEvent.loaded;
        onUploadProgress(progressEvent.loaded / total);
      },
    }),
  });
};

const getPreparations = (
  data: any,
  onUploadProgress?: UploadProgressCallback
): Promise<ApiResponse<any>> => {
  return client.post("/drugs/preparations", data, {
    ...(onUploadProgress && {
      onUploadProgress: (progressEvent) => {
        const total = progressEvent.total ?? progressEvent.loaded;
        onUploadProgress(progressEvent.loaded / total);
      },
    }),
  });
};

const preparationsApi = {
  addPreparation,
  getPreparations,
  updatePreparation,
};

export default preparationsApi;
