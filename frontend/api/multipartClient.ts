// api/multipartClient.ts
//
// Axios instance for multipart uploads.
//
// Two important rules:
//
//   1. Never hardcode Content-Type. `multipart/form-data` without a
//      boundary is not a valid request — the server rejects it with
//      415. The browser/RN runtime generates the correct header
//      (including the boundary) when we leave it unset and the body
//      is a FormData instance.
//
//   2. apisauce merges a default `Content-Type: application/json`
//      into every request, overriding our silence. The request
//      transform below deletes that header before the request goes
//      out, so the runtime can fill in the right value.

import { create } from "apisauce";
import { router } from "expo-router";
import { storageService } from "../hooks/storage";

const multipartClient = create({
  baseURL: "https://api.wazipos.co.ke/api/v1/",
  headers: {
    Accept: "*/*",
    // No Content-Type. See the transform below for why.
  },
});

multipartClient.addAsyncRequestTransform(async (request) => {
  // ── Strip the JSON Content-Type that apisauce injected ─────────
  // apisauce merges `Content-Type: application/json` into every
  // request. If we leave it, the runtime sends that header verbatim
  // and never attaches the multipart boundary — Django returns 415.
  // Deleting it lets the browser/RN fill in the correct value.
  if (request.headers) {
    delete (request.headers as any)["Content-Type"];
    delete (request.headers as any)["content-type"];
  }

  // ── Auth ────────────────────────────────────────────────────────
  try {
    const authToken = await storageService.getToken();

    if (!authToken) {
      console.log("Auth token at client", "Haiko");
      router.push("/(routes)/login");
      return;
    }

    if (!request.headers) {
      request.headers = {} as any;
    }
    request.headers["Authorization"] = `Bearer ${authToken}`;
  } catch (err) {
    console.error("[multipartClient] auth transform error:", err);
  }
});

export default multipartClient;