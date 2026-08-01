// import clientWithCache from './clientWithCache';
import client from "./client";

const getEntityLocationAction = (data) => {
  return client.post("/entitylocations/locations/filters/staff", data);
};


// const setEntityLocation = (entity_id, latitude,longitude) => {
//   return client.post("/entitylocations/locations/filters", {
//     "action": "AddEntityLocation",
//     "entity": entity_id,
//     "location": {
//         "latitude": latitude,
//         "longitude": longitude
//     }
// });
// };

const setEntityLocationAction = (data) => {
  return client.post("/entitylocations/locations/filters", data);
};


export default {
  setEntityLocationAction,
  getEntityLocationAction
};
