import client from "../client";

const addGeneric = (data, onUploadProgress) => {
  return client.post("/drugs/generics", data, {
    onUploadProgress: (progress) =>
      onUploadProgress(progress.loaded / progress.total),
  });
};

const updateGeneric = (data, onUploadProgress) => {
  return client.post("/drugs/generics", data, {
    onUploadProgress: (progress) =>
      onUploadProgress(progress.loaded / progress.total),
  });
};

const getGenerics = (data, onUploadProgress) => {
  return client.post("/drugs/generics", data, {
    onUploadProgress: (progress) =>
      onUploadProgress(progress.loaded / progress.total),
  });
};
const searchGenerics = (query) => {
  return client.post("/drugs/generics", {
    action: "SearchGenerics",
    searchQuery: query,
  });
};

export default {
  addGeneric,
  getGenerics,
  updateGeneric,
  searchGenerics,
};
