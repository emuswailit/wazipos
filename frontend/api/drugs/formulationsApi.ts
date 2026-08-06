import { ApiResponse } from "apisauce";
import client from "../client";

export type UploadProgressCallback = (progressFraction: number) => void;

export interface FormulationPayload {
  title: string;
  description: string;
  id?: string;
}

const addFormulation = (
  data: FormulationPayload
): Promise<ApiResponse<any>> => {
  const payload = {
    action: "CreateFormulation",
    formulation_details: {
      title: data.title.trim(),
      description: data.description.trim()
    }
  };
  return client.post("/drugs/formulations", payload);
};

const updateFormulation = (
  data: any,
  onUploadProgress?: UploadProgressCallback
): Promise<ApiResponse<any>> => {
  return client.post("/drugs/formulations", data, {
    ...(onUploadProgress && {
      onUploadProgress: (progressEvent) => {
        const total = progressEvent.total ?? progressEvent.loaded;
        onUploadProgress(progressEvent.loaded / total);
      },
    }),
  });
};

const getFormulations = (
  data: any,
  onUploadProgress?: UploadProgressCallback
): Promise<ApiResponse<any>> => {
  return client.post("/drugs/formulations", data, {
    ...(onUploadProgress && {
      onUploadProgress: (progressEvent) => {
        const total = progressEvent.total ?? progressEvent.loaded;
        onUploadProgress(progressEvent.loaded / total);
      },
    }),
  });
};

const formulationsApi = {
  addFormulation,
  getFormulations,
  updateFormulation,
};

export default formulationsApi;
