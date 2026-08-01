import { create } from "apisauce";
const multipartOpenClient = create({
  baseURL: "https://api.wazipos.co.ke/api/v1/",
   headers: {
    "Content-Type": "multipart/form-data",
    Accept: "*/*",
  },
});

multipartOpenClient.addAsyncRequestTransform(async (request) => {

});

export default multipartOpenClient;
