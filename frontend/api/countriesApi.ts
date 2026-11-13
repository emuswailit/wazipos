// import clientWithCache from './clientWithCache';
import clientWithCache from "./clientWithCache";

const getCountries = () => {
  return clientWithCache.post("/authentication/countries", {
    action: "GetCountries",
  });
};

export default {
  getCountries,
};
