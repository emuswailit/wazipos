import client from "./client";
import clientWithCache from "./clientWithCache";
import multipartClient from "./multipartClient";

// const addEntity = (data, onUploadProgress) => {
//   return client.post("/authentication/entities", data, {
//     onUploadProgress: (progress) =>
//       onUploadProgress(progress.loaded / progress.total),
//   });
// };

const entitiesAction = (data) =>
  clientWithCache.post("/authentication/entities", data);

const adminUpdateEntity = (data, onUploadProgress) => {
  return client.post("/authentication/entities", data, {
    onUploadProgress: (progress) =>
      onUploadProgress(progress.loaded / progress.total),
  });
};

const verifyEntityDocument = (data) => {
  return client.post("/authentication/entities", data);
};
const deleteEntityDocument = (data) => {
  return client.post("/authentication/entities", data);
};
const deleteEntityPicture = (data) => {
  return client.post("/authentication/entities", data);
};
const verifyEntity = (data) => {
  return client.post("/authentication/entities/admin", data);
};

const addEntity = (switchEntity, onUploadProgress) => {
  const data = new FormData();
  data.append("title", switchEntity.title);
  data.append("entity_ownership", switchEntity.entity_ownership.title);
  data.append("entity_type", switchEntity.entity_type.title);
  data.append("country", switchEntity.country.id);

  if (switchEntity.road) {
    data.append("road", switchEntity.road);
  }

  if (switchEntity.town) {
    data.append("town", switchEntity.town);
  }

  if (switchEntity.county) {
    data.append("county", switchEntity.county.id);
  }

  if (switchEntity.description) {
    data.append("description", switchEntity.description);
  }

  if (switchEntity.images && switchEntity.images.length > 0) {
    switchEntity.images.forEach((image, index) => {
      let uriParts = image.split(".");
      let fileType = uriParts[uriParts.length - 1];
      data.append("images", {
        uri: image,
        name: switchEntity.title + index + "." + fileType,
        type: `image/${fileType}`,
      });
    });
  }
  if (switchEntity.licences && switchEntity.licences.length > 0) {
    switchEntity.licences.forEach((image, index) => {
      let uriParts = image.split(".");
      let fileType = uriParts[uriParts.length - 1];
      data.append("licences", {
        uri: image,
        name: switchEntity.title + index + "." + fileType,
        type: `image/${fileType}`,
      });
    });
  }

  return client.post(`/authentication/entities/create`, data, {
    onUploadProgress: (progress) =>
      onUploadProgress(progress.loaded / progress.total),
  });
};

const updateEntity = (switchEntity, id, onUploadProgress) => {
  const data = new FormData();
  data.append("title", switchEntity.title);
  data.append("entity_ownership", switchEntity.entity_ownership.title);
  data.append("entity_type", switchEntity.entity_type.title);
  data.append("country", switchEntity.country.id);

  if (switchEntity.road) {
    data.append("road", switchEntity.road);
  }

  if (switchEntity.town) {
    data.append("town", switchEntity.town);
  }

  if (switchEntity.county) {
    data.append("county", switchEntity.county.id);
  }

  if (switchEntity.description) {
    data.append("description", switchEntity.description);
  }

  if (switchEntity.images && switchEntity.images.length > 0) {
    switchEntity.images.forEach((image, index) => {
      let uriParts = image.split(".");
      let fileType = uriParts[uriParts.length - 1];
      data.append("images", {
        uri: image,
        name: switchEntity.title + index + "." + fileType,
        type: `image/${fileType}`,
      });
    });
  }

  if (switchEntity.licences && switchEntity.licences.length > 0) {
    switchEntity.licences.forEach((image, index) => {
      let uriParts = image.split(".");
      let fileType = uriParts[uriParts.length - 1];
      data.append("licences", {
        uri: image,
        name: switchEntity.title + index + "." + fileType,
        type: `image/${fileType}`,
      });
    });
  }

  return client.patch(`/authentication/entities/${id}/update`, data, {
    onUploadProgress: (progress) =>
      onUploadProgress(progress.loaded / progress.total),
  });
};

// const getUserEntities = () =>
//   client.post(
//     "/authentication/entities",
//     { action: "GetUserEntities" },
//     { headers: { Accept: "application/json" } }
//   );

const getAllEntities = () =>
  clientWithCache.post("/authentication/entities", {
    action: "GetAllEntities",
  });


const getEntitiesPendingVerification = () =>
  client.post("/authentication/entities/admin", {
    action: "EntitiesPendingVerification",
  });

const getUserEntities = () =>
  client.post("/authentication/entities", {
    action: "GetUserEntities",
  });

const getUserEmployerEntities = () =>
  client.post("/authentication/entities", {
    action: "GetUserEmployerEntities",
  });
const getManufacturers = () =>
  client.post("/authentication/entities", {
    action: "GetManufacturerEntities",
  });
const switchEntity = (id, onUploadProgress) => {
  return client.post(
    "/authentication/entities",
    {
      action: "SwitchToEntity",
      entity: id,
    },
    {
      onUploadProgress: (progress) =>
        onUploadProgress(progress.loaded / progress.total),
    }
  );
};

const searchEntity = (search_param) => {
  return client.post("/authentication/entities", {
    action: "SearchEntities",
    search_param: search_param,
  });
};
const searchWholesalers = (search_param) => {
  return client.post("/authentication/entities", {
    action: "SearchWholesalers",
    searchQuery: search_param,
  });
};

const addToFavorites = (id) => {
  return client.post("/authentication/entities", {
    action: "FavoriteEntity",
    entity: id,
  });
};
const getFavoriteUserEntities = () => {
  return client.post("/authentication/entities", {
    action: "GetFavoriteEntities",
  });
};
const getEntityRoles = (id) => {
  return client.post("/authentication/roles", {
    action: "GetEntityRoles",
    entity: id,
  });
};

const getClusters = () => {
  return client.post("/authentication/clusters", {
    action: "GetClusters",
  });
};

const addRole = (data) => {
  return client.post("/authentication/roles", data);
};

const updateRole = (data) => {
  return client.post("/authentication/roles", data);
};

const getEntityAdverts = () => {
  return client.post("/employees/adverts", {
    action: "GetAdverts",
  });
};

const getCadres = () => {
  return client.post("/authentication/cadres", {
    action: "GetCadres",
  });
};

const createDesignation = (data, onUploadProgress) => {
  return client.post("/employees/designations", data, {
    onUploadProgress: (progress) =>
      onUploadProgress(progress.loaded / progress.total),
  });
};

const updateDesignation = (data, onUploadProgress) => {
  return client.post("/employees/designations", data, {
    onUploadProgress: (progress) =>
      onUploadProgress(progress.loaded / progress.total),
  });
};

const getEntityDesignations = () => {
  return client.post("/employees/designations", {
    action: "EntityDesignations",
  });
};
const getEntityDepartments = (id) => {
  return client.post("/authentication/departments", {
    action: "GetEntityDepartments",
    entity: id,
  });
};

const addDepartment = (data, onUploadProgress) => {
  return client.post("/authentication/departments", data, {
    onUploadProgress: (progress) =>
      onUploadProgress(progress.loaded / progress.total),
  });
};
const updateDepartment = (data, onUploadProgress) => {
  return client.post("/authentication/departments", data, {
    onUploadProgress: (progress) =>
      onUploadProgress(progress.loaded / progress.total),
  });
};

const addAdvert = (data, onUploadProgress) => {
  return client.post("/employees/adverts", data, {
    onUploadProgress: (progress) =>
      onUploadProgress(progress.loaded / progress.total),
  });
};

const updateAdvert = (data, onUploadProgress) => {
  return client.post("/employees/adverts", data, {
    onUploadProgress: (progress) =>
      onUploadProgress(progress.loaded / progress.total),
  });
};

const uploadEntityLicences = (userDocuments, id, onUploadProgress) => {
  const data = new FormData();
  data.append("licence_number", userDocuments.licence_number);
  data.append("licence_type", userDocuments.licence_type);

  userDocuments.licences.forEach((image, index) => {
    let uriParts = image.split(".");
    let fileType = uriParts[uriParts.length - 1];
    data.append("licences", {
      uri: image,
      name: userDocuments.title + index + "." + fileType,
      type: `image/${fileType}`,
    });
  });

  return client.patch(`/authentication/entities/${id}/licences`, data, {
    onUploadProgress: (progress) =>
      onUploadProgress(progress.loaded / progress.total),
  });
};

const deleteUserImage = (data) => {
  return client.post("/authentication/images", data);
};
const collectionAccountAction = (data) => {
  return client.post("/authentication/accounts/collection", data);
};
const settlementAccountAction = (data) => {
  return client.post("/authentication/accounts/settlement", data);
};
const createAgentEntity = (data) => {
  return multipartClient.post("/authentication/entities/create/agent", data);
};
const createUserEntity = (data) => {
  return multipartClient.post("/authentication/entities/create", data);
};

export default {
  entitiesAction,
  searchWholesalers,
  adminUpdateEntity,
  addEntity,
  getUserEntities,
  getUserEmployerEntities,
  getFavoriteUserEntities,
  updateEntity,
  getAllEntities,
  switchEntity,
  getManufacturers,
  searchEntity,
  addToFavorites,
  getEntityRoles,
  getClusters,
  addRole,
  updateRole,
  getEntityAdverts,
  getCadres,
  createDesignation,
  updateDesignation,
  getEntityDesignations,
  addAdvert,
  updateAdvert,
  getEntityDepartments,
  addDepartment,
  updateDepartment,
  uploadEntityLicences,
  verifyEntity,
  verifyEntityDocument,
  deleteEntityDocument,
  deleteEntityPicture,
  deleteUserImage,
  collectionAccountAction,
  settlementAccountAction,
  getEntitiesPendingVerification, 
  createAgentEntity,
  createUserEntity
};
