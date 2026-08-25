import { create } from "apisauce";

const apiClient = create({
    // baseURL: "https://api.wazipos.co.ke/api/v1/",
    baseURL: "http://127.0.0.1:8000/api/v1/",
    headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
    },
});

export default apiClient;
