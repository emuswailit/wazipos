import client from "../client";

const addFrequency = (data, onUploadProgress) => {
  return client.post("/drugs/frequencies", data, {
    onUploadProgress: (progress) =>
      onUploadProgress(progress.loaded / progress.total),
  });
};

const updateFrequency = (data, onUploadProgress) => {
  return client.post("/drugs/frequencies", data, {
    onUploadProgress: (progress) =>
      onUploadProgress(progress.loaded / progress.total),
  });
};

const getFrequencies = (data, onUploadProgress) =>
  client.post("/drugs/frequencies", data, {
    onUploadProgress: (progress) =>
      onUploadProgress(progress.loaded / progress.total),
  });

export default {
  addFrequency,
  getFrequencies,
  updateFrequency,
};
