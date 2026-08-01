import { create } from "apisauce";
import { router } from "expo-router";
import authStorage from "../hooks/storage";
const multipartClient = create({
  baseURL: "https://api.wazipos.co.ke/api/v1/",
   headers: {
    "Content-Type": "multipart/form-data",
    Accept: "*/*",
  },
});

multipartClient.addAsyncRequestTransform(async (request) => {
  const authToken = await authStorage.getToken();

  if (!authToken) {
    console.log("Auth token at client", "Haiko");
    router.push("/(routes)/login");
    return;
  }
  console.log("Auth token at client", authToken);
  request.headers["Authorization"] = `Bearer ${authToken}`;
});

export default multipartClient;
