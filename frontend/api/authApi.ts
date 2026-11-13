import { ApiResponse } from "apisauce";
import client from "./clientOpen";

// ==========================================
// DATA CONTRACT INTERFACES (INPUT/OUTPUT)
// ==========================================

interface LoginResponsePayload {
  success: boolean;
  token: string;
  message?: string;
  user?: {
    id: string | number;
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
    [key: string]: any;
  };
}

// ==========================================
// TYPE-SAFE ENDPOINT ACTIONS
// ==========================================

/**
 * Submits account credentials to the central authentication gateway.
 * @param {string} phone_or_email Universal account user lookup indicator identifier.
 * @param {string} password Account passkey credential string payload.
 */
const login = (
  phone_or_email: string,
  password: string
): Promise<ApiResponse<LoginResponsePayload>> => {
  return client.post<LoginResponsePayload>("/authentication/login/", {
    phone_or_email,
    password
  });
};

/**
 * Exchanges a Google ID token for WaziPOS session tokens.
 * Creates a basic account on the backend if no user owns the Google email yet.
 * Responds in the same shape as `login`.
 * @param {string} id_token Google-signed ID token from Google Sign-In.
 */
const googleLogin = (
  id_token: string
): Promise<ApiResponse<LoginResponsePayload>> => {
  return client.post<LoginResponsePayload>("/authentication/google/", {
    id_token,
  });
};

// Export utilizing modern structured instance properties
const authService = {
  login,
  googleLogin,
};

export default authService;
