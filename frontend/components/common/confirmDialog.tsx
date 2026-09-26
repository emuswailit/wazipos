// components/common/confirmDialog.tsx
//
// Universal confirmation dialog.
//
// - Public API: `confirmDialog(opts) => Promise<boolean>`, same as
//   the native-only version this replaces. Call sites don't change.
// - Renders a themed in-app modal when <ConfirmProvider> is mounted
//   somewhere above the caller (recommended: app root, inside
//   <AuthProvider> so it can read `theme`).
// - Falls back to `window.confirm` on web / `Alert.alert` on native
//   when the provider isn't mounted (tests, boot-time calls, or any
//   subtree rendered outside the provider).
//
// Handles:
//   - web, iOS, Android, and any WebView shell
//   - queued concurrent calls (second prompt shows after the first)
//   - Escape key on web to cancel
//   - backdrop tap / Android back to cancel
//
// Setup:
//   <AuthProvider>
//     <ConfirmProvider>
//       <RootNavigator />
//     </ConfirmProvider>
//   </AuthProvider>

import { useAuth, type ThemeShape } from '@/context/AuthContext';
import React, {
    useCallback,
    useEffect,
    useState
} from 'react';
import {
    Alert,
    Modal,
    Platform,
    Pressable,
    Text,
    View,
} from 'react-native';

/* =========================================================
 * Public types
 * ======================================================= */

export interface ConfirmDialogOptions {
    title: string;
    message: string;
    /** Label for the affirmative button. Default: "OK". */
    confirmLabel?: string;
    /** Label for the dismissive button. Default: "Cancel". */
    cancelLabel?: string;
    /** Style the confirm button red. Default: false. */
    destructive?: boolean;
}

/* =========================================================
 * Internal types
 * ======================================================= */

interface PendingConfirm extends ConfirmDialogOptions {
    resolve: (v: boolean) => void;
}

interface ProviderHandle {
    show: (opts: ConfirmDialogOptions) => Promise<boolean>;
}

/* =========================================================
 * Singleton bridge
 *
 * The provider registers itself here on mount. The public
 * `confirmDialog()` function routes through it when present,
 * falls back to native otherwise.
 * ======================================================= */

let providerHandle: ProviderHandle | null = null;

/* =========================================================
 * Native fallback
 * ======================================================= */

function nativeConfirm(
    opts: ConfirmDialogOptions
): Promise<boolean> {
    const {
        title,
        message,
        confirmLabel = 'OK',
        cancelLabel = 'Cancel',
        destructive = false,
    } = opts;

    if (Platform.OS === 'web') {
        if (typeof window === 'undefined') {
            return Promise.resolve(false);
        }
        try {
            return Promise.resolve(
                window.confirm(`${title}\n\n${message}`)
            );
        } catch {
            // Some embedded WebViews disable confirm(). Treat as
            // a no-op and don't block the caller.
            return Promise.resolve(true);
        }
    }

    return new Promise<boolean>((resolve) => {
        let settled = false;
        const settle = (v: boolean) => {
            if (settled) return;
            settled = true;
            resolve(v);
        };

        Alert.alert(
            title,
            message,
            [
                {
                    text: cancelLabel,
                    style: 'cancel',
                    onPress: () => settle(false),
                },
                {
                    text: confirmLabel,
                    style: destructive ? 'destructive' : 'default',
                    onPress: () => settle(true),
                },
            ],
            {
                cancelable: true,
                onDismiss: () => settle(false),
            }
        );
    });
}

/* =========================================================
 * Public API
 * ======================================================= */

/**
 * Show a confirmation dialog. Resolves `true` on confirm,
 * `false` on cancel / dismiss / Escape / hardware back.
 *
 * When <ConfirmProvider> is mounted, uses the themed in-app
 * modal. Otherwise falls back to the native dialog.
 */
export function confirmDialog(
    opts: ConfirmDialogOptions
): Promise<boolean> {
    if (providerHandle) {
        return providerHandle.show(opts);
    }

    if (__DEV__) {
        console.warn(
            '[confirmDialog] No <ConfirmProvider> mounted — ' +
            'falling back to native dialog. Mount the provider ' +
            'near the app root to get the themed version.'
        );
    }

    return nativeConfirm(opts);
}

/* =========================================================
 * Provider
 * ======================================================= */

export function ConfirmProvider({
    children,
}: {
    children: React.ReactNode;
}) {
    const { theme, isDarkMode } = useAuth();
    const [queue, setQueue] = useState<PendingConfirm[]>([]);

    /* ---- Register as the singleton on mount ---- */
    useEffect(() => {
        if (providerHandle) {
            if (__DEV__) {
                console.warn(
                    '[ConfirmProvider] Another ConfirmProvider is ' +
                    'already mounted. Only one should exist in the tree.'
                );
            }
            return;
        }

        providerHandle = {
            show: (opts) =>
                new Promise<boolean>((resolve) => {
                    setQueue((q) => [...q, { ...opts, resolve }]);
                }),
        };

        return () => {
            providerHandle = null;
            // Resolve any pending confirms as cancelled so no
            // awaiting caller hangs forever on unmount.
            setQueue((q) => {
                q.forEach((p) => p.resolve(false));
                return [];
            });
        };
    }, []);

    /* ---- The head of the queue is what's currently shown ---- */
    const current = queue[0] ?? null;

    const settle = useCallback((result: boolean) => {
        setQueue((q) => {
            if (q.length === 0) return q;
            const [head, ...rest] = q;
            head.resolve(result);
            return rest;
        });
    }, []);

    /* ---- Escape to cancel on web ---- */
    useEffect(() => {
        if (Platform.OS !== 'web') return;
        if (!current) return;
        if (typeof window === 'undefined') return;

        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                settle(false);
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [current, settle]);

    return (
        <>
            {children}
            {current ? (
                <ConfirmModal
                    key="confirm-modal"
                    pending={current}
                    theme={theme}
                    isDarkMode={isDarkMode}
                    onSettle={settle}
                />
            ) : null}
        </>
    );
}

/* =========================================================
 * The modal
 * ======================================================= */

function ConfirmModal({
    pending,
    theme,
    isDarkMode,
    onSettle,
}: {
    pending: PendingConfirm;
    theme: ThemeShape;
    isDarkMode: boolean;
    onSettle: (result: boolean) => void;
}) {
    const borderColor = isDarkMode ? '#334155' : '#e2e8f0';
    const dividerColor = `${theme.textDark}20`;
    const panelBg = theme.panel;

    const confirmLabel = pending.confirmLabel ?? 'OK';
    const cancelLabel = pending.cancelLabel ?? 'Cancel';
    const destructive = pending.destructive ?? false;

    const confirmBg = destructive ? '#ef4444' : theme.primary;

    return (
        <Modal
            visible
            animationType="fade"
            transparent
            onRequestClose={() => onSettle(false)}
        >
            <View className="flex-1 bg-black/55 items-center justify-center p-5">
                {/* Backdrop — tap to cancel */}
                <Pressable
                    className="absolute inset-0"
                    onPress={() => onSettle(false)}
                    accessibilityRole="button"
                    accessibilityLabel="Dismiss dialog"
                />

                {/* Panel */}
                <View
                    accessibilityViewIsModal
                    className="w-full max-w-[440px] rounded-2xl border overflow-hidden"
                    style={{
                        backgroundColor: panelBg,
                        borderColor,
                    }}
                >
                    <View className="p-5">
                        <Text
                            style={{
                                color: theme.text,
                                fontFamily: theme.font.bold,
                                fontSize: theme.fontSize.lg,
                                marginBottom: 8,
                            }}
                        >
                            {pending.title}
                        </Text>
                        <Text
                            style={{
                                color: theme.textDark,
                                fontFamily: theme.font.medium,
                                fontSize: theme.fontSize.sm,
                                lineHeight: 20,
                            }}
                        >
                            {pending.message}
                        </Text>
                    </View>

                    <View
                        className="flex-row gap-2 p-4 border-t justify-end"
                        style={{ borderTopColor: dividerColor }}
                    >
                        <Pressable
                            onPress={() => onSettle(false)}
                            accessibilityRole="button"
                            accessibilityLabel={cancelLabel}
                            className="rounded-xl border items-center justify-center min-h-[44px] px-5"
                            style={{ borderColor }}
                        >
                            <Text
                                className="uppercase tracking-wide text-[12px] font-bold"
                                style={{
                                    color: theme.textDark,
                                    fontFamily: theme.font.bold,
                                }}
                            >
                                {cancelLabel}
                            </Text>
                        </Pressable>
                        <Pressable
                            onPress={() => onSettle(true)}
                            accessibilityRole="button"
                            accessibilityLabel={confirmLabel}
                            className="rounded-xl items-center justify-center min-h-[44px] px-5"
                            style={{ backgroundColor: confirmBg }}
                        >
                            <Text
                                className="uppercase tracking-wide text-white text-[12px] font-bold"
                                style={{ fontFamily: theme.font.bold }}
                            >
                                {confirmLabel}
                            </Text>
                        </Pressable>
                    </View>
                </View>
            </View>
        </Modal>
    );
}

/* =========================================================
 * Optional hook API
 *
 * Same thing as `confirmDialog`, but reads more naturally
 * inside components that already use hooks.
 * ======================================================= */

export function useConfirm() {
    return useCallback(
        (opts: ConfirmDialogOptions) => confirmDialog(opts),
        []
    );
}