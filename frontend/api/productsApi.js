import clientWithCache from "./clientWithCache";
import multipartClient from "./multipartClient";
const productsAction = (data) => {
    return clientWithCache.post("/products/", data);

};
const createProduct = (data) => {
    console.log("omaria","omaria")
    return multipartClient.post("/products/products/create", data);

};

export default{
    productsAction,
    createProduct
}

