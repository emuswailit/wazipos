import { storageService } from "@/hooks/storage";
import { ApisauceInstance, create } from "apisauce";

const apiClient: ApisauceInstance = create({
  // baseURL: "https://api.wazipos.co.ke/api/v1/",
  baseURL: "http://127.0.0.1:8000/api/v1/",
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
  },
  timeout: 15000,
});

apiClient.addAsyncRequestTransform(async (request) => {
  try {
    let authToken = await storageService.getToken();

    if (!authToken && typeof window !== "undefined" && window?.localStorage) {
      authToken = window.localStorage.getItem("authToken") || window.localStorage.getItem("token");
    }

    if (authToken) {
      if (!request.headers) {
        request.headers = {};
      }
      request.headers["Authorization"] = `Bearer ${authToken}`;
    }
  } catch (err) {
    console.error("Web dynamic network interceptor tracing breakdown:", err);
  }
});

export default apiClient;
