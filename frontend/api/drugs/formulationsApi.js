import client from "../client";

const addFormulation = (data, onUploadProgress) => {
  return client.post("/drugs/formulations", data, {
    onUploadProgress: (progress) =>
      onUploadProgress(progress.loaded / progress.total),
  });
};

const updateFormulation = (data, onUploadProgress) => {
  return client.post("/drugs/formulations", data, {
    onUploadProgress: (progress) =>
      onUploadProgress(progress.loaded / progress.total),
  });
};

const getFormulations = (data, onUploadProgress) =>
  client.post("/drugs/formulations", data, {
    onUploadProgress: (progress) =>
      onUploadProgress(progress.loaded / progress.total),
  });

export default {
  addFormulation,
  getFormulations,
  updateFormulation,
};
