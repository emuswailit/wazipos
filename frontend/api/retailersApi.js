import client from "./client";
import multipartClient from "./multipartClient";
const retailStaffAction = (data) => {
    return client.post("/retailers/orders/staff", data);

};
const retailAdminAction = (data) => {
    return client.post("/retailers/orders/admin", data);

};
const retailerOrdersAction = (data) => {
    return client.post("/retailers/orders", data);

};
const retailerReceiptsAction = (data) => {
    return client.post("/retailers/receipts/joint", data);

};
const retailerReceiptsAdminAction = (data) => {
    return client.post("/retailers/receipts/admin", data);

};
const retailCientAction = (data) => {
    return client.post("/retailers/orders/client", data);

};

const wholesaleRequisitionsAction = (data) => {
    return client.post("/wholesalers/receipts", data);

};

const wholesaleOrdersAction = (data) => {
    return client.post("/wholesalers/retailers/orders", data);

};

const userPrescriptionsAction = (data) => {
    return client.post("/retailers/prescriptions", data);

};


const createPrescriptionAction = (data) => {
    return multipartClient.post("/retailers/prescriptions/create", data);

};

export default{
    retailCientAction,
    retailerOrdersAction,
    retailStaffAction,userPrescriptionsAction, retailerReceiptsAction,retailerReceiptsAdminAction, createPrescriptionAction,retailAdminAction,wholesaleRequisitionsAction,wholesaleOrdersAction
}