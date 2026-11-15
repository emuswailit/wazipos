import { ApiResponse } from "apisauce";
import { appendToFormData, type PickedImage } from "@/components/common/imagePicker";
import client from "./clientOpen";
import multipartOpenClient from "./multipartOpenClient";

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
export interface SelfRegisterInput {
  first_name: string;
  middle_name?: string;
  last_name: string;
  phone: string;
  email: string;
  password: string;
  accepted_terms: boolean;
  gender?: string;
  date_of_birth?: string;
  identifier_type?: "NationalId" | "Passport" | "";
  identifier_number?: string;
}

/**
 * Self sign-up (POST /authentication/register). Replies with session tokens
 * (like login) and texts a consent code to the phone. JSON, or multipart when
 * an ID / passport photo is attached.
 */
const register = (input: SelfRegisterInput, document?: PickedImage | null): Promise<ApiResponse<any>> => {
  if (!document) return client.post("/authentication/register", input);
  const form = new FormData();
  for (const [k, v] of Object.entries(input)) {
    if (v !== undefined && v !== null && v !== "") form.append(k, String(v));
  }
  appendToFormData(form, "document", document);
  return multipartOpenClient.post("/authentication/register", form);
};

/** Facebook access token -> WaziPOS session (server answers "not set up yet" until configured). */
const facebookLogin = (
  access_token: string
): Promise<ApiResponse<LoginResponsePayload>> => {
  return client.post<LoginResponsePayload>("/authentication/facebook/", { access_token });
};

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
  facebookLogin,
  register,
};

export default authService;
