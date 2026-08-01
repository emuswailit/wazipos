import client from "../client";
import clientWithCache from "../clientWithCache";

const addBodySystem = (data, onUploadProgress) => {
  return client.post("/drugs/bodysystems", data, {
    onUploadProgress: (progress) =>
      onUploadProgress(progress.loaded / progress.total),
  });
};

const updateBodySystem = (data, onUploadProgress) => {
  return client.post("/drugs/bodysystems", data, {
    onUploadProgress: (progress) =>
      onUploadProgress(progress.loaded / progress.total),
  });
};

const getBodySystems = (data, onUploadProgress) => {
  return client.post("/drugs/bodysystems", data, {
    onUploadProgress: (progress) =>
      onUploadProgress(progress.loaded / progress.total),
  });
};

export default {
  addBodySystem,
  getBodySystems,
  updateBodySystem,
};
