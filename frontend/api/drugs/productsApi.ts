import { ApiResponse } from "apisauce";
import client from "../client";

export type UploadProgressCallback = (progressFraction: number) => void;

export interface EmbeddedIdEntity {
  id: string;
  [key: string]: any;
}

export interface ProductInputPayload {
  title: string;
  description: string;
  units_per_pack: string | number;
  pack_tag: string;
  is_vatable: string | boolean;
  preparation?: EmbeddedIdEntity | string | null;
  manufacturer: EmbeddedIdEntity | string;
  category: EmbeddedIdEntity | string;
  images: any[];
}

const convertToSlug = (text: string): string => {
  return text.toLowerCase().replace(/ /g, "-").replace(/[^\w-]+/g, "");
};

const addProduct = async (input: ProductInputPayload): Promise<ApiResponse<any>> => {
  const data = new FormData();
  data.append("title", input.title);
  data.append("description", input.description);
  const prepId = input.preparation && typeof input.preparation === "object" ? input.preparation.id : (input.preparation || "");
  data.append("preparation", prepId);
  const mfgId = typeof input.manufacturer === "object" ? input.manufacturer.id : input.manufacturer;
  data.append("manufacturer", mfgId);
  data.append("units_per_pack", String(input.units_per_pack));
  data.append("pack_tag", input.pack_tag);
  data.append("is_vatable", String(input.is_vatable));
  const catId = typeof input.category === "object" ? input.category.id : input.category;
  data.append("category", catId);

  for (let index = 0; index < input.images.length; index++) {
    const image = input.images[index];
    if (image && !image.startsWith("http://") && !image.startsWith("https://")) {
      const uriParts = image.split(".");
      const fileType = uriParts[uriParts.length - 1] || "png";
      if (typeof window !== "undefined") {
        try {
          const response = await fetch(image);
          const blob = await response.blob();
          const webFile = new File([blob], convertToSlug(input.title) + index + "." + fileType, { type: `image/${fileType}` });
          data.append("images", webFile);
        } catch {
          data.append("images", { uri: image, name: convertToSlug(input.title) + index + "." + fileType, type: `image/${fileType}` } as any);
        }
      } else {
        data.append("images", { uri: image, name: convertToSlug(input.title) + index + "." + fileType, type: `image/${fileType}` } as any);
      }
    }
  }

  return client.post("/products/products/create", data, {
    headers: { "Content-Type": "multipart/form-data" },
  });
};

const updateProduct = async (
  input: ProductInputPayload,
  id: string,
  onUploadProgress?: UploadProgressCallback
): Promise<ApiResponse<any>> => {
  console.log("Updating product with ID:", id, "and input:", input);
  const data = new FormData();
  data.append("title", input.title);
  data.append("description", input.description);
  const prepId = input.preparation && typeof input.preparation === "object" ? input.preparation.id : (input.preparation || "");
  data.append("preparation", prepId);
  const mfgId = typeof input.manufacturer === "object" ? input.manufacturer.id : input.manufacturer;
  data.append("manufacturer", mfgId);
  data.append("units_per_pack", String(input.units_per_pack));
  data.append("pack_tag", input.pack_tag);
  const catId = typeof input.category === "object" ? input.category.id : input.category;
  data.append("category", catId);
  data.append("is_vatable", String(input.is_vatable));

  const existingImages: string[] = [];
  for (let index = 0; index < input.images.length; index++) {
    const image = input.images[index];
    if (image) {
      if (image.startsWith("http://") || image.startsWith("https://")) {
        existingImages.push(image);
      } else {
        const uriParts = image.split(".");
        const fileType = uriParts[uriParts.length - 1] || "png";
        if (typeof window !== "undefined") {
          try {
            const response = await fetch(image);
            const blob = await response.blob();
            const webFile = new File([blob], convertToSlug(input.title) + index + "." + fileType, { type: `image/${fileType}` });
            data.append("images", webFile);
          } catch {
            data.append("images", { uri: image, name: convertToSlug(input.title) + index + "." + fileType, type: `image/${fileType}` } as any);
          }
        } else {
          data.append("images", { uri: image, name: convertToSlug(input.title) + index + "." + fileType, type: `image/${fileType}` } as any);
        }
      }
    }
  }

  if (existingImages.length > 0) {
    data.append("existing_images", JSON.stringify(existingImages));
  }

  return client.patch(`/products/products/${id}/update`, data, {
    headers: { "Content-Type": "multipart/form-data" },
    ...(onUploadProgress && {
      onUploadProgress: (progressEvent) => {
        const total = progressEvent.total ?? progressEvent.loaded;
        onUploadProgress(progressEvent.loaded / total);
      },
    }),
  });
};

const deleteProductImage = (data: any, onUploadProgress?: UploadProgressCallback): Promise<ApiResponse<any>> => {
  return client.post("/products/", data, {
    ...(onUploadProgress && {
      onUploadProgress: (progressEvent) => {
        const total = progressEvent.total ?? progressEvent.loaded;
        onUploadProgress(progressEvent.loaded / total);
      },
    }),
  });
};

const searchProducts = (searchQuery: string): Promise<ApiResponse<any>> => {
  return client.post("/products/", { action: "SearchProducts", searchQuery });
};

const getProductsByCategory = (id: string): Promise<ApiResponse<any>> => {
  return client.post("/products/", { action: "GetProductsByCategory", category_id: id });
};

const getProducts = (data: any): Promise<ApiResponse<any>> => {
  return client.post("/products/", data, {
    headers: { "Content-Type": "application/json" }
  });
};

const productsAction = (data: any): Promise<ApiResponse<any>> => {
  return client.post("/products/", data);
};

const productsApi = {
  addProduct,
  getProducts,
  updateProduct,
  deleteProductImage,
  searchProducts,
  getProductsByCategory,
  productsAction,
};

export default productsApi;
