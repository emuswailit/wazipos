import { useAuth } from "@/context/AuthContext";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { GOOGLE_SIGN_IN_CONFIGURED, GOOGLE_WEB_CLIENT_ID, GoogleSignInButtonProps, noteGoogleSignInNotConfigured } from "./googleSignInTypes";

const GIS_SCRIPT_SRC = "https://accounts.google.com/gsi/client";
const MAX_BUTTON_WIDTH = 400; // Google's rendered button maxes out at 400px

let gisScriptPromise: Promise<void> | null = null;

/** Loads Google Identity Services once per page. */
function loadGoogleIdentityServices(): Promise<void> {
    if ((window as any).google?.accounts?.id) return Promise.resolve();
    if (!gisScriptPromise) {
        gisScriptPromise = new Promise((resolve, reject) => {
            const script = document.createElement("script");
            script.src = GIS_SCRIPT_SRC;
            script.async = true;
            script.defer = true;
            script.onload = () => resolve();
            script.onerror = () => {
                gisScriptPromise = null;
                reject(new Error("Failed to load Google Identity Services"));
            };
            document.head.appendChild(script);
        });
    }
    return gisScriptPromise;
}

/** Web: Google's own "Sign in with Google" button (Google Identity Services). */
export default function GoogleSignInButton({ onIdToken, onError, loading, disabled }: GoogleSignInButtonProps) {
    const { theme } = useAuth();
    const containerRef = useRef<HTMLDivElement>(null);
    const [ready, setReady] = useState(false);

    // Keep the latest callbacks without re-rendering Google's button on every parent render.
    const handlersRef = useRef({ onIdToken, onError });
    handlersRef.current = { onIdToken, onError };

    useEffect(() => {
        if (!GOOGLE_WEB_CLIENT_ID) return;
        let cancelled = false;

        loadGoogleIdentityServices()
            .then(() => {
                const container = containerRef.current;
                const gis = (window as any).google?.accounts?.id;
                if (cancelled || !container || !gis) return;

                gis.initialize({
                    client_id: GOOGLE_WEB_CLIENT_ID,
                    callback: (response: { credential?: string }) => {
                        if (response.credential) {
                            handlersRef.current.onIdToken(response.credential);
                        } else {
                            handlersRef.current.onError("Google sign-in failed. Please try again.");
                        }
                    },
                    ux_mode: "popup",
                    auto_select: false,
                    cancel_on_tap_outside: true,
                });

                const width = Math.min(container.offsetWidth || MAX_BUTTON_WIDTH, MAX_BUTTON_WIDTH);
                gis.renderButton(container, {
                    type: "standard",
                    theme: "outline",
                    size: "large",
                    text: "continue_with",
                    shape: "rectangular",
                    logo_alignment: "center",
                    width,
                });
                setReady(true);
            })
            .catch((error) => {
                console.error(error);
                if (!cancelled) handlersRef.current.onError("Google sign-in is unavailable right now. Check your connection.");
            });

        return () => {
            cancelled = true;
        };
    }, []);

    if (!GOOGLE_SIGN_IN_CONFIGURED) {
        noteGoogleSignInNotConfigured();
        return null;
    }

    const blocked = loading || disabled;

    return (
        <View className="w-full items-center justify-center min-h-[44px]">
            <div
                ref={containerRef}
                style={{
                    width: "100%",
                    display: "flex",
                    justifyContent: "center",
                    opacity: blocked ? 0.5 : 1,
                    pointerEvents: blocked ? "none" : "auto",
                }}
            />
            {(!ready || loading) && (
                <View className="absolute inset-0 items-center justify-center">
                    <ActivityIndicator color={theme.text} size="small" />
                </View>
            )}
        </View>
    );
}
