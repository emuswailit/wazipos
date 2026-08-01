import client from "../client";

const addPreparation = (data, onUploadProgress) => {
  return client.post("/drugs/preparations", data, {
    onUploadProgress: (progress) =>
      onUploadProgress(progress.loaded / progress.total),
  });
};

const updatePreparation = (data, onUploadProgress) => {
  return client.post("/drugs/preparations", data, {
    onUploadProgress: (progress) =>
      onUploadProgress(progress.loaded / progress.total),
  });
};

const getPreparations = (data) => {
  return client.post("/drugs/preparations", data);
};

const searchPreparations = (query) => {
  return client.post("/drugs/preparations", {
    action: "SearchPreparations",
    searchQuery: query,
  });
};

export default {
  addPreparation,
  getPreparations,
  updatePreparation,
  searchPreparations,
};
