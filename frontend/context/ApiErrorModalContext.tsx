// context/ApiErrorModalContext.tsx
//
// Global API error display.
//
// - `apiErrorBus` is a tiny pub/sub channel. `useApi` pushes every
//   failure into it (HTTP 4xx/5xx, dispatcher response_code: 1, or
//   thrown exceptions).
// - `ApiErrorModalProvider` subscribes to the bus and renders the
//   shared modal. Manual triggering is available via
//   `useApiErrorModal().showApiError(...)`.
//
// Mount once, near the app root, inside AuthProvider (the modal
// reads the theme).

import ApiErrorModal, {
    FlatFieldError,
} from '@/components/common/ApiErrorModal';
import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
} from 'react';

/* Re-export so consumers import both from one place. */
export type { FlatFieldError };

/* =========================================================
 * Origin frame (dev only)
 * ======================================================= */

export interface OriginFrame {
    component: string;
    file: string;
    line: number;
    column: number;
}

/* =========================================================
 * Bus
 * ======================================================= */

export interface ApiErrorPayload {
    message: string | null;
    errors: FlatFieldError[];
    /** Dev-only: JS stack captured at the useApi call site. */
    origin?: OriginFrame[];
}

type Listener = (payload: ApiErrorPayload) => void;

class ApiErrorBus {
    private listeners = new Set<Listener>();

    emit(payload: ApiErrorPayload): void {
        for (const l of this.listeners) {
            try {
                l(payload);
            } catch {
                /* never let a listener break the emitter */
            }
        }
    }

    subscribe(listener: Listener): () => void {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }
}

export const apiErrorBus = new ApiErrorBus();

/* =========================================================
 * Flatten helper
 * ======================================================= */

/**
 * Flatten any shape of `errors` payload into a flat list of
 * { field, message } pairs.
 *
 * Handles every shape the backend produces:
 *
 *   { "request_id": "This field is required." }
 *   { "accepted_lines": "Each line requires item_id." }
 *   { "overlap": ["id-1", "id-2"] }
 *   { "items": [{ "product_id": "not found" }] }
 *   ["first error", "second error"]           ← top-level array
 *   { "detail": { "sub_field": "…" } }        ← nested object
 *   {}
 *   null / undefined
 */
export function flattenApiErrors(
    errors: any,
    prefix = ''
): FlatFieldError[] {
    if (errors === null || errors === undefined) return [];

    /* ---- Top-level array ---- */
    if (Array.isArray(errors)) {
        const out: FlatFieldError[] = [];
        for (let i = 0; i < errors.length; i++) {
            const item: any = errors[i];
            if (
                typeof item === 'string' ||
                typeof item === 'number'
            ) {
                out.push({
                    field: prefix,
                    message: String(item),
                });
            } else if (item && typeof item === 'object') {
                out.push(
                    ...flattenApiErrors(
                        item,
                        prefix || `Item ${i + 1}`
                    )
                );
            }
        }
        return out;
    }

    /* ---- Non-object scalars ---- */
    if (typeof errors !== 'object') {
        return [
            {
                field: prefix || 'Error',
                message: String(errors),
            },
        ];
    }

    /* ---- Object ---- */
    const out: FlatFieldError[] = [];

    for (const [k, v] of Object.entries(errors)) {
        const key = prefix ? `${prefix}.${k}` : k;

        if (v === null || v === undefined) continue;

        if (Array.isArray(v)) {
            for (let i = 0; i < v.length; i++) {
                const item: any = v[i];
                if (
                    typeof item === 'string' ||
                    typeof item === 'number'
                ) {
                    out.push({
                        field: key,
                        message: String(item),
                    });
                } else if (
                    item &&
                    typeof item === 'object'
                ) {
                    out.push(
                        ...flattenApiErrors(
                            item,
                            `${key}.${i}`
                        )
                    );
                }
            }
        } else if (v && typeof v === 'object') {
            out.push(...flattenApiErrors(v, key));
        } else {
            out.push({ field: key, message: String(v) });
        }
    }

    return out;
}

/* =========================================================
 * Context
 * ======================================================= */

interface ApiErrorModalContextType {
    showApiError: (payload: ApiErrorPayload) => void;
    dismiss: () => void;
}

const ApiErrorModalContext = createContext<
    ApiErrorModalContextType | undefined
>(undefined);

export function ApiErrorModalProvider({
    children,
}: {
    children: React.ReactNode;
}) {
    const [visible, setVisible] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const [errors, setErrors] = useState<FlatFieldError[]>([]);
    const [origin, setOrigin] = useState<OriginFrame[]>([]);

    const showApiError = useCallback(
        (payload: ApiErrorPayload) => {
            const hasMessage = !!payload.message;
            const hasErrors = payload.errors.length > 0;
            if (!hasMessage && !hasErrors) return;

            setMessage(payload.message);
            setErrors(payload.errors);
            setOrigin(payload.origin ?? []);
            setVisible(true);
        },
        []
    );

    const dismiss = useCallback(() => {
        setVisible(false);
        setTimeout(() => {
            setMessage(null);
            setErrors([]);
            setOrigin([]);
        }, 220);
    }, []);

    useEffect(() => {
        const unsubscribe = apiErrorBus.subscribe(
            showApiError
        );
        return unsubscribe;
    }, [showApiError]);

    const value = useMemo<ApiErrorModalContextType>(
        () => ({ showApiError, dismiss }),
        [showApiError, dismiss]
    );

    return (
        <ApiErrorModalContext.Provider value={value}>
            {children}
            <ApiErrorModal
                visible={visible}
                message={message}
                errors={errors}
                origin={origin}
                onClose={dismiss}
            />
        </ApiErrorModalContext.Provider>
    );
}

export function useApiErrorModal() {
    const ctx = useContext(ApiErrorModalContext);
    if (!ctx) {
        throw new Error(
            'useApiErrorModal must be used inside <ApiErrorModalProvider />'
        );
    }
    return ctx;
}