import { useAuth } from "@/context/AuthContext";
import { FontAwesome } from "@expo/vector-icons";
import { useState } from "react";
import { ActivityIndicator, Text, TouchableOpacity } from "react-native";
import { GOOGLE_IOS_CLIENT_ID, GOOGLE_SIGN_IN_CONFIGURED, GOOGLE_WEB_CLIENT_ID, GoogleSignInButtonProps, noteGoogleSignInNotConfigured } from "./googleSignInTypes";

/*
 * The Google Sign-In library needs its native module, which only exists in a build made
 * after the library was installed (npx expo prebuild / expo run:android). Importing it
 * statically crashes the whole login route on older builds and in Expo Go, so it is
 * loaded lazily: if the native module is missing, the button simply doesn't render.
 */
type GoogleSigninModule = typeof import("@react-native-google-signin/google-signin");
let googleModule: GoogleSigninModule | null | undefined;

function loadGoogleSignin(): GoogleSigninModule | null {
    if (googleModule !== undefined) return googleModule;
    try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        googleModule = require("@react-native-google-signin/google-signin") as GoogleSigninModule;
    } catch (e) {
        if (__DEV__) {
            console.warn(
                "Google Sign-In hidden: its native module isn't in this build. Rebuild the app (npx expo run:android / run:ios) to enable it.",
                e
            );
        }
        googleModule = null;
    }
    return googleModule;
}

let configured = false;

function ensureConfigured() {
    if (configured) return;
    const { GoogleSignin } = loadGoogleSignin()!;
    GoogleSignin.configure({
        // The Web client ID makes Google issue an ID token our backend can verify.
        webClientId: GOOGLE_WEB_CLIENT_ID,
        iosClientId: GOOGLE_IOS_CLIENT_ID || undefined,
        offlineAccess: false,
    });
    configured = true;
}

/** Android / iOS: native Google account picker via @react-native-google-signin. */
export default function GoogleSignInButton({ onIdToken, onError, loading, disabled }: GoogleSignInButtonProps) {
    const { theme } = useAuth();
    const [pickerOpen, setPickerOpen] = useState(false);
    const busy = loading || pickerOpen;

    if (!GOOGLE_SIGN_IN_CONFIGURED) {
        noteGoogleSignInNotConfigured();
        return null;
    }

    const google = loadGoogleSignin();
    if (!google) return null; // native module not in this build
    const { GoogleSignin, isErrorWithCode, isSuccessResponse, statusCodes } = google;

    const handlePress = async () => {
        setPickerOpen(true);
        try {
            ensureConfigured();
            await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
            const response = await GoogleSignin.signIn();

            if (!isSuccessResponse(response)) return; // user closed the account picker

            const idToken = response.data.idToken;
            // Forget the Google session so the account picker shows again next time (shared POS devices).
            GoogleSignin.signOut().catch(() => {});

            if (!idToken) {
                onError("Google did not return a sign-in token. Please try again.");
                return;
            }
            setPickerOpen(false);
            await onIdToken(idToken);
        } catch (error) {
            if (isErrorWithCode(error)) {
                switch (error.code) {
                    case statusCodes.SIGN_IN_CANCELLED:
                    case statusCodes.IN_PROGRESS:
                        return;
                    case statusCodes.PLAY_SERVICES_NOT_AVAILABLE:
                        onError("Google Play Services is unavailable or out of date on this device.");
                        return;
                }
            }
            console.error("Google Sign-In failed:", error);
            onError("Google sign-in failed. Please try again.");
        } finally {
            setPickerOpen(false);
        }
    };

    return (
        <TouchableOpacity
            onPress={handlePress}
            disabled={busy || disabled}
            accessibilityRole="button"
            accessibilityLabel="Continue with Google"
            style={{ backgroundColor: theme.surface, borderColor: theme.border }}
            className="w-full flex-row items-center justify-center gap-x-3 rounded-xl h-[52px] md:h-[44px] border active:opacity-90"
        >
            {busy ? (
                <ActivityIndicator color={theme.text} size="small" />
            ) : (
                <>
                    <FontAwesome name="google" size={18} color="#4285F4" />
                    <Text style={{ color: theme.text }} className="font-semibold text-base md:text-sm">
                        Continue with Google
                    </Text>
                </>
            )}
        </TouchableOpacity>
    );
}
