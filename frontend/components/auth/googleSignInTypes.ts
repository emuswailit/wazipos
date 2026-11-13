export interface GoogleSignInButtonProps {
    /** Called with the Google ID token once the user has picked an account. */
    onIdToken: (idToken: string) => Promise<void> | void;
    /** Called with a user-facing message when Google Sign-In itself fails. */
    onError: (message: string) => void;
    /** Shows a spinner and blocks presses, e.g. while the backend call runs. */
    loading?: boolean;
    disabled?: boolean;
}

/** OAuth client ID of type "Web" from Google Cloud Console. Used on every platform. */
export const GOOGLE_WEB_CLIENT_ID = (process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? "").trim();
/** OAuth client ID of type "iOS" from Google Cloud Console. */
export const GOOGLE_IOS_CLIENT_ID = (process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? "").trim();

/** Google Sign-In is optional: without a Web client ID the button simply isn't shown. */
export const GOOGLE_SIGN_IN_CONFIGURED = GOOGLE_WEB_CLIENT_ID.length > 0;

let missingConfigNoted = false;

/** Dev-only, once per session: explain why the Google button is hidden. */
export function noteGoogleSignInNotConfigured() {
    if (missingConfigNoted || !__DEV__) return;
    missingConfigNoted = true;
    console.info(
        "Google Sign-In is off: EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID is empty in .env. " +
            "Set it to the OAuth \"Web\" client ID from Google Cloud Console and restart with `npx expo start -c` to show the button."
    );
}
