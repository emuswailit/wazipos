import client from "./client";
import clientMultipart from "./multipartClient";
const propertiesAction = (data) => {
    return client.post("/properties/", data);

};
const createPropertyAction = (data) => {
    return clientMultipart.post("/properties/create", data);

};
const updatePropertyAction = (data,id) => {
    return clientMultipart.patch(`/properties/${id}/update`, data);

};
const createPropertyUnitAction = (data) => {
    return clientMultipart.post("/properties/units/create", data);

};
const updatePropertyUnitAction = (data,id) => {
    return clientMultipart.patch(`/properties/units/${id}/update`, data);

};
const createPropertyUnitTenantAction = (data) => {
    return clientMultipart.post("/properties/tenants/create", data);

};
const updatePropertyUnitTenantAction = (data,id) => {
    return clientMultipart.patch(`/properties/tenants/${id}/update`, data);

};
export default {
propertiesAction,
createPropertyAction,
updatePropertyAction,
 createPropertyUnitAction,
 updatePropertyUnitAction,
 updatePropertyUnitTenantAction,
 createPropertyUnitTenantAction
};