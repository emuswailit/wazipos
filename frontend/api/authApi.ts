import { ApiResponse } from "apisauce";
import client from "./clientOpen";

// ==========================================
// DATA CONTRACT INTERFACES (INPUT/OUTPUT)
// ==========================================

export interface LoginRequestPayload {
  phone_or_email: string;
  password: string;
}

export interface LoginResponsePayload {
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

// Export utilizing modern structured instance properties
export const authService = {
  login,
};

export default authService;
