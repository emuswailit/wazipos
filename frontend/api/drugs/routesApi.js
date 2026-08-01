import client from "../client";

const addRoute = (data, onUploadProgress) => {
  return client.post("/drugs/routes", data, {
    onUploadProgress: (progress) =>
      onUploadProgress(progress.loaded / progress.total),
  });
};

const updateRoute = (data, onUploadProgress) => {
  return client.post("/drugs/routes", data, {
    onUploadProgress: (progress) =>
      onUploadProgress(progress.loaded / progress.total),
  });
};

const getRoutes = (data, onUploadProgress) => {
  return client.post("/drugs/routes", data, {
    onUploadProgress: (progress) =>
      onUploadProgress(progress.loaded / progress.total),
  });
};

export default {
  addRoute,
  getRoutes,
  updateRoute,
};
