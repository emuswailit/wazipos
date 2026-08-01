import client from "../client";

const addDrugSubClass = (data) => {
  return client.post("/drugs/drugsubclasses", data);
};

const updateDrugSubClass = (data, onUploadProgress) => {
  return client.post("/drugs/drugsubclasses", data, {
    onUploadProgress: (progress) =>
      onUploadProgress(progress.loaded / progress.total),
  });
};

const getDrugSubClasses = (data, onUploadProgress) => {
  return client.post("/drugs/drugsubclasses", data, {
    onUploadProgress: (progress) =>
      onUploadProgress(progress.loaded / progress.total),
  });
};

export default {
  addDrugSubClass,
  getDrugSubClasses,
  updateDrugSubClass,
};
