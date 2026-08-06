import { ApiResponse } from "apisauce";
import client from "../client";

export type UploadProgressCallback = (progressFraction: number) => void;

export interface GenericPayload {
  title: string;
  description: string;
  drug_class: string;
  drug_sub_class: string;
  id?: string;
  [key: string]: any;
}

const addGeneric = (
  data: any,
  onUploadProgress?: UploadProgressCallback
): Promise<ApiResponse<any>> => {
  return client.post("/drugs/generics", data, {
    ...(onUploadProgress && {
      onUploadProgress: (progressEvent) => {
        const total = progressEvent.total ?? progressEvent.loaded;
        onUploadProgress(progressEvent.loaded / total);
      },
    }),
  });
};

const updateGeneric = (
  data: any,
  onUploadProgress?: UploadProgressCallback
): Promise<ApiResponse<any>> => {
  return client.post("/drugs/generics", data, {
    ...(onUploadProgress && {
      onUploadProgress: (progressEvent) => {
        const total = progressEvent.total ?? progressEvent.loaded;
        onUploadProgress(progressEvent.loaded / total);
      },
    }),
  });
};

const getGenerics = (
  data: any,
  onUploadProgress?: UploadProgressCallback
): Promise<ApiResponse<any>> => {
  return client.post("/drugs/generics", data, {
    ...(onUploadProgress && {
      onUploadProgress: (progressEvent) => {
        const total = progressEvent.total ?? progressEvent.loaded;
        onUploadProgress(progressEvent.loaded / total);
      },
    }),
  });
};

const searchGenerics = (query: string): Promise<ApiResponse<any>> => {
  return client.post("/drugs/generics", {
    action: "SearchGenerics",
    searchQuery: query,
  });
};

const genericsApi = {
  addGeneric,
  getGenerics,
  updateGeneric,
  searchGenerics,
};

export default genericsApi;
