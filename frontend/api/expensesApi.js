import client from "./client";
const expensesAction = (data) => {
    return client.post("/expenses/entity", data);

};

export default{
    expensesAction
}