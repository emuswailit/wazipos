// Platform-agnostic image picker core.
//
// No React, no Formik, no UI — just: open the platform picker, return a
// normalised PickedImage, and know how to append it to FormData.
//
// Every platform branch in the app funnels through here so callers never
// see `Platform.OS`.

import { Platform } from "react-native";

/* =========================================================
 * Result type — discriminated union
 * ======================================================= */

export type PickedImage =
    | {
        kind: "web";
        /** blob: URL. Safe as `source={{ uri }}` in <Image>. */
        uri: string;
        /** Real File object. */
        file: File;
        name: string;
        type: string;
    }
    | {
        kind: "native";
        /** file:// URI. Safe as `source={{ uri }}` in <Image>. */
        uri: string;
        /** RN FormData file descriptor. */
        file: { uri: string; name: string; type: string };
        name: string;
        type: string;
    };

/**
 * The value stored in a form field that holds an image.
 *
 *   string      → an existing server URL (unchanged since load)
 *   PickedImage → a locally-chosen file, not yet uploaded
 *   null        → no image (cleared, or never set)
 */
export type ImageFieldValue = string | PickedImage | null;

export interface PickImageOptions {
    /** [width, height], e.g. [16, 9]. Ignored on web. */
    aspect?: [number, number];
    /** 0–1. Ignored on web. */
    quality?: number;
    /** Native only. Default true. */
    allowsEditing?: boolean;
}

/* =========================================================
 * Type guards
 * ======================================================= */

export function isPickedImage(v: unknown): v is PickedImage {
    return (
        typeof v === "object" &&
        v !== null &&
        "kind" in v &&
        ((v as PickedImage).kind === "web" ||
            (v as PickedImage).kind === "native")
    );
}

/** True when the value is a newly-picked file that still needs uploading. */
export function isPendingUpload(v: ImageFieldValue): v is PickedImage {
    return isPickedImage(v);
}

/** URI to render in <Image>. Works for both web blob and native file URIs. */
export function previewUri(v: ImageFieldValue): string | null {
    if (!v) return null;
    if (typeof v === "string") return v;
    return v.uri;
}

/* =========================================================
 * Public picker
 * ======================================================= */

export async function pickImage(
    options: PickImageOptions = {}
): Promise<PickedImage | null> {
    return Platform.OS === "web"
        ? pickImageWeb()
        : pickImageNative(options);
}

/**
 * Append a PickedImage to FormData. Passes through the correct shape for
 * the platform — the caller never inspects `img.file`.
 */
export function appendToFormData(
    fd: FormData,
    field: string,
    img: PickedImage
): void {
    fd.append(field, img.file as any);
}

/**
 * Web: revoke a blob URL created by pickImage. Native: no-op.
 * Call on unmount / value change so blob URLs don't leak.
 */
export function releasePreview(value: ImageFieldValue): void {
    if (
        Platform.OS === "web" &&
        isPickedImage(value) &&
        value.kind === "web" &&
        typeof URL !== "undefined" &&
        typeof URL.revokeObjectURL === "function"
    ) {
        URL.revokeObjectURL(value.uri);
    }
}

/* =========================================================
 * Web
 * ======================================================= */

function pickImageWeb(): Promise<PickedImage | null> {
    return new Promise((resolve) => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = "image/*";
        input.style.display = "none";
        document.body.appendChild(input);

        const cleanup = () => {
            if (input.parentNode) input.parentNode.removeChild(input);
        };

        input.onchange = () => {
            const file = input.files?.[0] ?? null;
            cleanup();
            if (!file) {
                resolve(null);
                return;
            }
            resolve({
                kind: "web",
                uri: URL.createObjectURL(file),
                file,
                name: file.name || `image-${Date.now()}`,
                type: file.type || "image/jpeg",
            });
        };

        input.oncancel = () => {
            cleanup();
            resolve(null);
        };

        input.click();
    });
}

/* =========================================================
 * Native
 * ======================================================= */

async function pickImageNative(
    options: PickImageOptions
): Promise<PickedImage | null> {
    const ImagePicker = await import("expo-image-picker");

    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return null;

    // MediaTypeOptions (old) vs MediaType (new SDK). Pick whichever exists.
    const mediaTypes =
        (ImagePicker as any).MediaTypeOptions?.Images ??
        (ImagePicker as any).MediaType?.Images ??
        "images";

    const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes,
        allowsEditing: options.allowsEditing ?? true,
        aspect: options.aspect ?? [16, 9],
        quality: options.quality ?? 0.85,
    });

    if (result.canceled || !result.assets?.length) return null;

    const asset = result.assets[0];
    const name =
        asset.fileName ?? `image-${Date.now()}.${guessExt(asset.mimeType)}`;
    const type = asset.mimeType ?? "image/jpeg";

    return {
        kind: "native",
        uri: asset.uri,
        file: { uri: asset.uri, name, type },
        name,
        type,
    };
}

function guessExt(mime?: string | null): string {
    if (!mime) return "jpg";
    if (mime.includes("png")) return "png";
    if (mime.includes("webp")) return "webp";
    if (mime.includes("gif")) return "gif";
    return "jpg";
}