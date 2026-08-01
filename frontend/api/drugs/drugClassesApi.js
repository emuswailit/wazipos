import client from "../client";

const addDrugClass = (data, onUploadProgress) => {
  return client.post("/drugs/drugclasses", data, {
    onUploadProgress: (progress) =>
      onUploadProgress(progress.loaded / progress.total),
  });
};

const updateDrugClass = (data, onUploadProgress) => {
  return client.post("/drugs/drugclasses", data, {
    onUploadProgress: (progress) =>
      onUploadProgress(progress.loaded / progress.total),
  });
};

const getDrugClasses = (data, onUploadProgress) => {
  return client.post("/drugs/drugclasses", data, {
    onUploadProgress: (progress) =>
      onUploadProgress(progress.loaded / progress.total),
  });
};
export default {
  addDrugClass,
  getDrugClasses,
  updateDrugClass,
};
