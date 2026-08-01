import { ApiResponse, ApisauceInstance, AxiosRequestConfig, create } from "apisauce";
// 🌟 Link directly to your updated storageService location hook mapping
import { storageService } from "@/hooks/storage";
// Assuming cache utility path mapping
import cache from "@/utils/cache";

/**
 * Instantiate the type-safe Apisauce client engine.
 */
const apiClient: ApisauceInstance = create({
  baseURL: "https://api.wazipos.co.ke/api/v1/",
  headers: {
    "Content-Type": "application/json",
  },
  timeout: 15000, // Highly recommended fail-safe configuration threshold for mobile networks
});

/**
 * Async Request Transform Middleware Interceptor.
 * Appends valid secure authorization tokens to headers before request execution.
 */
apiClient.addAsyncRequestTransform(async (request) => {
  const authToken = await storageService.getToken();

  if (!authToken) return;

  if (!request.headers) {
    request.headers = {};
  }

  request.headers["Authorization"] = `Bearer ${authToken}`;
});

// 🌟 Store the original untampered GET reference method pointer with explicit type bindings
const originalGet = apiClient.get;

/**
 * Override the default apiClient.get layout.
 * Intercepts requests to store functional cache fallbacks when mobile networks disconnect.
 */
apiClient.get = async <T, U = any>(
  url: string,
  params?: object,
  axiosConfig?: AxiosRequestConfig
): Promise<ApiResponse<T, U>> => {

  // Execute the standard network dispatch pathway first
  const response = await originalGet<T, U>(url, params, axiosConfig);

  // If the server handles the handshake successfully, commit payload to memory blocks
  if (response.ok) {
    cache.store(url, response.data);
    return response;
  }

  // If network links fail, attempt to load last-known data nodes locally
  const cachedData = await cache.get(url);

  // Synthesize a valid ApiResponse mock envelope if data is found in offline records
  if (cachedData) {
    return {
      ok: true,
      data: cachedData as T,
      problem: null,
      originalError: null,
      status: 200,
      headers: {},
      config: axiosConfig || {},
    } as ApiResponse<T, U>;
  }

  // Fall back to returning the raw connection error message if nothing is cached
  return response;
};

export default apiClient;
