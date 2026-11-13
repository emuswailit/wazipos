// utils/hasAccountFlag.ts
//
// Tracks whether this device has ever had a signed-in user.
//
// Set to true on any successful login or registration. Read by the
// layout's auth guard and by WelcomeScreen to decide where an
// unauthenticated visitor should land:
//
//   flag true  → /(auth)/login   (returning user)
//   flag false → /welcome        (first-time visitor)
//
// The flag is device-scoped, not account-scoped.

import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'wazipos_has_account_v1';

export async function readHasAccount(): Promise<boolean> {
    try {
        const raw = await AsyncStorage.getItem(KEY);
        return raw === 'true';
    } catch {
        return false;
    }
}
