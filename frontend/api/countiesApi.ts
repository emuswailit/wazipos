import clientWithCache from "./clientWithCache";

const getCounties = () => {
  return clientWithCache.post("/authentication/counties", {
    action: "GetCounties",
  });
};

export default {
  getCounties,
};
