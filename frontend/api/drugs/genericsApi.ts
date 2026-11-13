import { ApiResponse } from "apisauce";
import client from "../client";

type UploadProgressCallback = (progressFraction: number) => void;

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
