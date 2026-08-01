import * as SecureStore from "expo-secure-store";
import { Platform } from 'react-native';

const AUTH_TOKEN_KEY = "authToken";
const REG_DETAILS_KEY = "registrationDetails";

export interface RegistrationDetails {
  [key: string]: any;
}

export interface JwtPayload {
  exp: number;
  [key: string]: any;
}

/**
 * 🌟 CROSS-PLATFORM STORAGE FALLBACK ADAPTER
 * Leverages native localStorage API in browsers and encrypted hardware modules on mobile devices.
 */
const platformStorage = {
  getItem: async (key: string): Promise<string | null> => {
    if (Platform.OS === 'web') {
      // ✅ Safely fetches plaintext string tokens from web local storage
      return localStorage.getItem(key);
    }
    return await SecureStore.getItemAsync(key);
  },
  setItem: async (key: string, value: string): Promise<void> => {
    if (Platform.OS === 'web') {
      // ✅ Saves state parameters directly into web local storage keys
      localStorage.setItem(key, value);
      return;
    }
    await SecureStore.setItemAsync(key, value);
  },
  deleteItem: async (key: string): Promise<void> => {
    if (Platform.OS === 'web') {
      // ✅ Purges web data entries completely from browser history stores
      localStorage.removeItem(key);
      return;
    }
    await SecureStore.deleteItemAsync(key);
  }
};

/**
 * High-performance, lightweight JWT decoder built explicitly for React Native.
 * Completely cuts out external 'buffer' dependencies to remain cross-platform safe.
 */
function decodeJwt(token: string): JwtPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    // 🌟 1. Replace Base64URL safe components fluidly back to standard Base64 characters
    let base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');

    // 🌟 2. THE CRITICAL WEB FIX: Dynamically pad the Base64 string with '=' symbols.
    // Without this mathematical module operation layout, atob() fails instantly on the Web!
    const pad = base64.length % 4;
    if (pad) {
      if (pad === 1) {
        throw new Error("Invalid base64 string length metadata");
      }
      base64 += new Array(5 - pad).join('=');
    }

    // 🌟 3. Decode securely across both web and native JS engines
    const jsonString = atob(base64);
    return JSON.parse(jsonString);
  } catch (error) {
    console.error("JWT decoding matrix syntax error:", error);
    return null;
  }
}


/**
 * Validates token lifespan constraints accurately against active system clocks.
 */
const isExpired = (token: string | null): boolean => {
  if (!token) return true;

  const decoded = decodeJwt(token);
  if (!decoded || !decoded.exp) return true;

  const currentTime = Date.now() / 1000;

  if (decoded.exp < currentTime) {
    console.log("Token verification trace: Token has expired.");
    return true;
  }

  return false;
};

// ==========================================
// AUTH TOKEN ACTIONS
// ==========================================

const storeToken = async (authToken: string): Promise<void> => {
  try {
    await platformStorage.setItem(AUTH_TOKEN_KEY, authToken);
  } catch (error) {
    console.error("Storage Error: Could not write auth token:", error);
  }
};

const removeToken = async (): Promise<void> => {
  try {
    await platformStorage.deleteItem(AUTH_TOKEN_KEY);
  } catch (error) {
    console.error("Storage Error: Could not delete auth token:", error);
  }
};

const getToken = async (): Promise<string | null> => {
  try {
    const token = await platformStorage.getItem(AUTH_TOKEN_KEY);
    if (!token) return null;

    if (isExpired(token)) {
      await removeToken();
      return null;
    }

    return token;
  } catch (error) {
    console.error("Storage Error: Could not fetch auth token:", error);
    return null;
  }
};

const getUser = async (): Promise<JwtPayload | null> => {
  try {
    const token = await getToken();
    if (!token) return null;

    return decodeJwt(token);
  } catch (error) {
    console.error("Storage Error: User resolution failure:", error);
    return null;
  }
};

// ==========================================
// REGISTRATION DETAILS ACTIONS
// ==========================================

const storeRegistrationDetails = async (details: RegistrationDetails): Promise<void> => {
  try {
    await platformStorage.setItem(REG_DETAILS_KEY, JSON.stringify(details));
  } catch (error) {
    console.error("Storage Error: Could not write registration variables:", error);
  }
};

const retrieveRegistrationDetails = async (): Promise<RegistrationDetails | null> => {
  try {
    const details = await platformStorage.getItem(REG_DETAILS_KEY);
    return details ? JSON.parse(details) : null;
  } catch (error) {
    console.error("Storage Error: Could not parse registration variables:", error);
    return null;
  }
};

const removeRegistrationDetails = async (): Promise<void> => {
  try {
    await platformStorage.deleteItem(REG_DETAILS_KEY);
  } catch (error) {
    console.error("Storage Error: Could not delete registration variables:", error);
  }
};

export const storageService = {
  getToken,
  getUser,
  removeToken,
  storeToken,
  storeRegistrationDetails,
  retrieveRegistrationDetails,
  removeRegistrationDetails,
};
