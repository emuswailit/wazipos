import { ApiResponse } from "apisauce";
import { useCallback, useState } from "react";

/**
 * Custom Type-Safe API Request Hook.
 * @template T The expected type of the successful payload data.
 * @template U The expected type of the error payload data (defaults to any).
 */
export function useApi<T, U = any>(
  apiFunc: (...args: any[]) => Promise<ApiResponse<T, U>>
) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Wrapped in useCallback to prevent infinite render cycles when used in useEffect hooks
  const request = useCallback(
    async (...args: any[]): Promise<ApiResponse<T, U>> => {
      setLoading(true);
      setError(false);
      setErrorMessage(null);

      try {
        const response = await apiFunc(...args);

        setLoading(false);
        setError(!response.ok);

        if (response.ok && response.data !== undefined) {
          // 🌟 FIX: Safely check for .results signature layouts without breaking strict TS contracts
          const rawData = response.data as any;

          if (rawData && rawData.results !== undefined) {
            // Commit the nested array payload matching backend collection frameworks
            setData(rawData.results);
          } else {
            // Fallback directly onto standard root object payload responses
            setData(response.data);
          }
        } else {
          // If apisauce encounters an issue, catch the core problem string layout
          setErrorMessage(response.problem || "An unexpected error occurred.");
        }

        return response;
      } catch (err: any) {
        setLoading(false);
        setError(true);
        setErrorMessage(err?.message || "Network communication breakdown.");

        // Re-synthesize a valid minimal error response package fallback
        return {
          ok: false,
          problem: "CLIENT_ERROR",
          originalError: err,
        } as ApiResponse<T, U>;
      }
    },
    [apiFunc]
  );

  return { data, error, loading, errorMessage, request, setData };
}

export default useApi;
