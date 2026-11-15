// components/auth/FacebookSignInButton.tsx
//
// Facebook sign-in — placeholder until the app is registered with Meta.
// Set EXPO_PUBLIC_FACEBOOK_APP_ID in .env (and FACEBOOK_APP_ID /
// FACEBOOK_APP_SECRET on the server, which verifies the token at
// POST /authentication/facebook/). Until then a "coming soon" button shows.
// When the keys exist, wire the Facebook login SDK here and pass its access
// token to onAccessToken (authService.facebookLogin does the exchange).

import React from 'react';

import SocialPlaceholderButton from './SocialPlaceholderButton';

export const FACEBOOK_APP_ID = (process.env.EXPO_PUBLIC_FACEBOOK_APP_ID ?? '').trim();
export const FACEBOOK_SIGN_IN_CONFIGURED = FACEBOOK_APP_ID.length > 0;

export default function FacebookSignInButton({
    onError,
}: {
    onAccessToken?: (accessToken: string) => Promise<void> | void;
    onError: (message: string) => void;
    loading?: boolean;
    disabled?: boolean;
}) {
    if (!FACEBOOK_SIGN_IN_CONFIGURED) return <SocialPlaceholderButton provider="facebook" onPress={onError} />;
    // App ID is set, but the Facebook SDK isn't part of this build yet.
    return <SocialPlaceholderButton provider="facebook" onPress={() => onError('Facebook sign-in arrives with the next app update.')} />;
}
