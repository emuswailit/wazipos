import { ApisauceInstance, create } from "apisauce";
// 🌟 Link directly to your updated storageService location hook mapping
import { storageService } from "@/hooks/storage";

/**
 * Type-safe API Client Configured using Apisauce.
 * Binds type definitions directly to the return object.
 */
const apiClient: ApisauceInstance = create({
  baseURL: "https://api.wazipos.co.ke/api/v1/",
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
  },
  timeout: 15000, // Highly recommended boilerplate configuration safeguard for mobile networks
});

/**
 * Async Request Transform Middleware Interceptor.
 * Intercepts outgoing requests to automatically append valid authorization headers.
 */
apiClient.addAsyncRequestTransform(async (request) => {
  try {
    const authToken = await storageService.getToken();
    if (authToken) {
      if (!request.headers) request.headers = {};
      request.headers["Authorization"] = `Bearer ${authToken}`;
    }
  } catch (err) {
    console.error("Network interceptor cache tracking breakdown:", err);
  }
});

export default apiClient;
