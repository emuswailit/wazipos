import client from "./client";
import clientWithCache from "./clientWithCache";

const getPaymentMethodsAction = (data) => {
    return clientWithCache.post("/payments/methods/filter", data);

};
const getPaymentAccountsAction = (data) => {
    return client.post("/payments/accounts", data);

};


export default{
    getPaymentMethodsAction,
    getPaymentAccountsAction
 
}