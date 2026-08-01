import client from "./client";
const categoriesAction = (data) => {
    return client.post("/authentication/categories", data);

};

export default{
    categoriesAction
}