import { ApiResponse } from "apisauce";
import client from "./client";
import clientWithCache from "./clientWithCache";
import mobiticketKYCClient from "./mobiticketKYCClient";
import multipartClient from "./multipartClient";
import multipartOpenClient from "./multipartOpenClient";

// ==========================================
// TYPE DEFINITIONS & CONTRACTS
// ==========================================

export interface UserRegisterInput {
  accepted_terms: string | boolean;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  password?: string;
  date_of_birth?: string;
  gender?: string;
  country?: string;
  images?: string[];
  documents?: string[];
}

export interface FacilityRegisterInput {
  accepted_terms: string | boolean;
  first_name: string;
  last_name: string;
  national_id: string;
  phone: string;
  date_of_birth?: string;
  gender: { value: string;[key: string]: any };
  password?: string;
  email?: string;
}

export interface UserUpdateInput {
  first_name: string;
  last_name: string;
  email?: string;
  title?: string;
  images?: string[];
  documents?: string[];
}

// 🌟 React Native explicit FormData file append interface contract 
interface ReactNativeFileAppend {
  uri: string;
  name: string;
  type: string;
}

type ProgressCallback = (percentage: number) => void;

// ==========================================
// HELPER UTILITY ALGORITHMS
// ==========================================

function convertToSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/ /g, "-")
    .replace(/[^\w-]+/g, "");
}

// ==========================================
// SERVICE ENDPOINT ACTIONS
// ==========================================

const register = (input: UserRegisterInput): Promise<ApiResponse<any>> => {
  const data = new FormData();
  data.append("accepted_terms", String(input.accepted_terms));
  data.append("first_name", input.first_name);
  data.append("last_name", input.last_name);
  data.append("email", input.email);
  data.append("phone", input.phone);
  if (input.password) data.append("password", input.password);
  if (input.date_of_birth) data.append("date_of_birth", input.date_of_birth);
  if (input.gender) data.append("gender", input.gender);
  if (input.country) data.append("country", input.country);

  if (input.images && input.images.length) {
    input.images.forEach((image, index) => {
      const uriParts = image.split(".");
      const fileType = uriParts[uriParts.length - 1];
      const fileAppend = {
        uri: image,
        name: `${input.phone}${index}.${fileType}`,
        type: `image/${fileType}`,
      } as unknown as Blob; // 🌟 Type assertion allows clean validation across Metro pipelines
      data.append("images", fileAppend);
    });
  }

  if (input.documents && input.documents.length) {
    input.documents.forEach((doc, index) => {
      const uriParts = doc.split(".");
      const fileType = uriParts[uriParts.length - 1];
      const fileAppend = {
        uri: doc,
        name: `${convertToSlug(input.phone)}${index}.${fileType}`,
        type: `document/${fileType}`,
      } as unknown as Blob;
      data.append("documents", fileAppend);
    });
  }

  return client.post("/authentication/register", data);
};

const facilityRegister = (
  userinfo: FacilityRegisterInput,
  onUploadProgress: ProgressCallback
): Promise<ApiResponse<any>> => {
  const data = new FormData();
  data.append("accepted_terms", String(userinfo.accepted_terms));
  data.append("first_name", userinfo.first_name);
  data.append("last_name", userinfo.last_name);
  data.append("national_id", userinfo.national_id);
  data.append("phone", userinfo.phone);
  if (userinfo.date_of_birth) data.append("date_of_birth", userinfo.date_of_birth);
  data.append("gender", userinfo.gender.value);

  data.append("password", userinfo.password ? userinfo.phone : "testpass123");
  data.append("email", userinfo.email ? userinfo.email : `${userinfo.phone}@tibacare.co.ke`);

  return client.post("/users/register/company", data, {
    onUploadProgress: (progress) => {
      if (progress.total) {
        onUploadProgress(progress.loaded / progress.total);
      }
    },
  });
};

const updateNotificationToken = (token: string): Promise<ApiResponse<any>> => {
  const data = new FormData();
  data.append("notification_token", token);
  return client.patch("/users/user/update", data);
};

const pushNotification = (to: string, title: string, body: string): Promise<ApiResponse<any>> => {
  const data = new FormData();
  data.append("to", to);
  data.append("title", title);
  data.append("body", body);
  return client.post("/users/push/notification", data);
};

const usersAction = (data: any): Promise<ApiResponse<any>> => {
  return client.post("/authentication/users", data);
};

const usersActionAdmin = (data: any): Promise<ApiResponse<any>> => {
  return client.post("/authentication/users/admin", data);
};

const getCompanyUsers = (): Promise<ApiResponse<any>> => {
  return clientWithCache.get("/users/customers");
};

const updateUser = (
  input: UserUpdateInput,
  id: string | number,
  onUploadProgress: ProgressCallback
): Promise<ApiResponse<any>> => {
  const data = new FormData();
  data.append("first_name", input.first_name);
  data.append("last_name", input.last_name);
  data.append("email", input.email ? input.email : "");

  const titleSlug = input.title ? convertToSlug(input.title) : "user_upload";

  if (input.images && input.images.length) {
    input.images.forEach((image, index) => {
      const uriParts = image.split(".");
      const fileType = uriParts[uriParts.length - 1];
      const fileAppend = {
        uri: image,
        name: `${titleSlug}${index}.${fileType}`,
        type: `image/${fileType}`,
      } as unknown as Blob;
      data.append("images", fileAppend);
    });
  }

  if (input.documents && input.documents.length) {
    input.documents.forEach((doc, index) => {
      const uriParts = doc.split(".");
      const fileType = uriParts[uriParts.length - 1];
      const fileAppend = {
        uri: doc,
        name: `${titleSlug}${index}.${fileType}`,
        type: `document/${fileType}`,
      } as unknown as Blob;
      data.append("documents", fileAppend);
    });
  }

  return client.patch(`/authentication/users/${id}/update`, data, {
    onUploadProgress: (progress) => {
      if (progress.total) {
        onUploadProgress(progress.loaded / progress.total);
      }
    },
  });
};

const searchUsers = (searchQuery: string): Promise<ApiResponse<any>> => {
  return client.post("/authentication/users", {
    action: "SearchUsers",
    searchQuery: searchQuery,
  });
};

const searchEntityCustomers = (searchQuery: string): Promise<ApiResponse<any>> => {
  return client.post("/authentication/users", {
    action: "SearchUsers",
    searchQuery: searchQuery,
  });
};

const getClusters = (): Promise<ApiResponse<any>> => {
  return client.post("/authentication/clusters", {
    action: "GetClusters",
  });
};

const addCadre = (data: any, onUploadProgress: ProgressCallback): Promise<ApiResponse<any>> => {
  return client.post("/authentication/cadres", data, {
    onUploadProgress: (progress) => {
      if (progress.total) onUploadProgress(progress.loaded / progress.total);
    },
  });
};

const updateCadre = (data: any, onUploadProgress: ProgressCallback): Promise<ApiResponse<any>> => {
  return client.post("/authentication/cadres", data, {
    onUploadProgress: (progress) => {
      if (progress.total) onUploadProgress(progress.loaded / progress.total);
    },
  });
};

const getCadres = (data: any, onUploadProgress: ProgressCallback): Promise<ApiResponse<any>> => {
  return client.post("/authentication/cadres", data, {
    onUploadProgress: (progress) => {
      if (progress.total) onUploadProgress(progress.loaded / progress.total);
    },
  });
};

const kycCheck = (data: any): Promise<ApiResponse<any>> => {
  return mobiticketKYCClient.post("/authentication/users", data);
};

const createCorporateClient = (data: any): Promise<ApiResponse<any>> => {
  return multipartClient.post("/authentication/register/corporate", data);
};

const createUserByAgent = (data: any): Promise<ApiResponse<any>> => {
  return multipartClient.post("/authentication/register/simple/agent", data);
};

const selfRegister = (data: any): Promise<ApiResponse<any>> => {
  return multipartOpenClient.post("/authentication/register", data);
};

export const usersService = {
  facilityRegister,
  usersAction,
  usersActionAdmin,
  pushNotification,
  register,
  updateNotificationToken,
  getCompanyUsers,
  updateUser,
  searchUsers,
  searchEntityCustomers,
  getClusters,
  addCadre,
  updateCadre,
  getCadres,
  kycCheck,
  createCorporateClient,
  createUserByAgent,
  selfRegister,
};

export default usersService;
