import client from "../client";

// const addProduct = (data, onUploadProgress) => {
//   return client.post("/products/", data, {
//     onUploadProgress: (progress) =>
//       onUploadProgress(progress.loaded / progress.total),
//   });
// };

const addProduct = (input) => {
  console.log("addProduct", input);
  const data = new FormData();
  data.append("title", input.title);
  data.append("description", input.description);
  data.append("preparation", input.preparation ? input.preparation.id : "");
  data.append("manufacturer", input.manufacturer.id);
  data.append("units_per_pack", input.units_per_pack);
  data.append("pack_tag", input.pack_tag);
  data.append("is_vatable", input.is_vatable);
  data.append("category", input.category.id);

  input.images.forEach((image, index) => {
    let uriParts = image.split(".");
    let fileType = uriParts[uriParts.length - 1];
    data.append("images", {
      uri: image,
      name: convertToSlug(input.title) + index + "." + fileType,
      type: `image/${fileType}`,
    });
  });

  return client.post("/products/products/create", data);
};

const deleteProductImage = (data, onUploadProgress) => {
  return client.post("/products/", data, {
    onUploadProgress: (progress) =>
      onUploadProgress(progress.loaded / progress.total),
  });
};
const updateProduct = (input, id, onUploadProgress) => {
  const data = new FormData();
  data.append("title", input.title);
  data.append("description", input.description);
  data.append("preparation", input.preparation ? input.preparation.id : "");
  data.append("manufacturer", input.manufacturer);
  data.append("description", input.description);
  data.append("units_per_pack", input.units_per_pack);
  data.append("pack_tag", input.pack_tag);
  data.append("category", input.category.id);
  data.append("is_vatable", input.is_vatable);
  input.images.forEach((image, index) => {
    let uriParts = image.split(".");
    let fileType = uriParts[uriParts.length - 1];
    data.append("images", {
      uri: image,
      name: convertToSlug(input.title) + index + "." + fileType,
      type: `image/${fileType}`,
    });
  });

  return client.patch(`/products/products/${id}/update`, data, {
    onUploadProgress: (progress) =>
      onUploadProgress(progress.loaded / progress.total),
  });
};

function convertToSlug(Text) {
  return Text.toLowerCase()
    .replace(/ /g, "-")
    .replace(/[^\w-]+/g, "");
}

const searchProducts = (searchQuery) =>
  client.post("/products/", {
    action: "SearchProducts",
    searchQuery: searchQuery,
  });

const getProductsByCategory = (id) =>
  client.post("/products/", {
    action: "GetProductsByCategory",
    category_id: id,
  });

const getProducts = (data) => {
  return client.post("/products/", data);
};

const productsAction = (data) => {
  return client.post("/products/", data);
};

export default {
  addProduct,
  getProducts,
  updateProduct,
  deleteProductImage,
  searchProducts,
  getProductsByCategory,
  productsAction,
};
