import authStorage from "@/hooks/storage";
import { create } from "apisauce";
const mobiticketKYCClient = create({
  baseURL: "https://api.mobiticket.co.ke/v1/payments/identity?identity=true",
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
  },
});

mobiticketKYCClient.addAsyncRequestTransform(async (request) => {
  const paymentsToken = await authStorage.getPaymentsToken();

  if (!paymentsToken) {
    console.log("Hamna token");
    return;
  } else {
    console.log("Tuko na token", paymentsToken);
    request.headers["Access-Token"] = `Bearer ${paymentsToken}`;
  }
});

export default mobiticketKYCClient;
