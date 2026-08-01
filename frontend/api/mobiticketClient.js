import { create } from "apisauce";
import authStorage from "../auth/storage";
const apiClient = create({
  baseURL: "https://api.mobiticket.co.ke/v1/payments/",
  headers: {
    "Content-Type": "application/json",
    "Api-Key":
      "8Benp9qSzxD6MxDDXPpOkEUtk5CHivUzfHZsrecEAJbt7a5CnO57teepjMoafIFPfhACu6i4bQ8Ku9OEoXLWFIiV7t02R5TaqwNXKL7MvGWKhLwFvi9xF5FyBXtA9iRoA",
    Accept: "application/json",
  },
});

export default apiClient;
