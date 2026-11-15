// api/multipartOpenClient.js
//
// Multipart uploads that don't need sign-in (e.g. self registration).
// Never set Content-Type here: `multipart/form-data` without the boundary is
// rejected by the server (415). Leaving it unset lets the browser / RN fill in
// the right header for the FormData body. apisauce adds a JSON Content-Type by
// default, so the transform removes it (same as multipartClient).
import { create } from "apisauce";

const multipartOpenClient = create({
  baseURL: "https://api.wazipos.co.ke/api/v1/",
  headers: {
    Accept: "*/*",
  },
});

multipartOpenClient.addAsyncRequestTransform(async (request) => {
  if (request.headers) {
    delete request.headers["Content-Type"];
    delete request.headers["content-type"];
  }
});

export default multipartOpenClient;
