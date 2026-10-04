import { useAuth } from '@/context/AuthContext';
import { X } from 'lucide-react-native';
import React from 'react';
import {
    Modal, Platform, Pressable,
    useWindowDimensions, View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import WholesalerMarketplaceMobile from './WholesalerMarketplaceMobile';
import WholesalerMarketplaceWeb from './WholesalerMarketplaceWeb';

const isWeb = Platform.OS === 'web';

/**
 * Minimum width for the desktop layout.
 * Below this, the browser gets the mobile layout even on web.
 */
const WEB_BREAKPOINT = 768;

export interface WholesalerMarketplaceModalProps {
    visible: boolean;
    onClose: () => void;
    wholesalerId: string;
    wholesalerTitle?: string;
}

/**
 * Full-screen marketplace modal for a single wholesaler.
 *
 * Chooses between the desktop and mobile layouts based on:
 *   - Platform.OS === 'web'  (native always uses mobile)
 *   - actual viewport width ≥ WEB_BREAKPOINT
 *
 * A floating close button is rendered in the top-right corner on all
 * platforms and viewport sizes so the modal can always be dismissed
 * without hunting for the inline back affordance.
 */
export default function WholesalerMarketplaceModal({
    visible,
    onClose,
    wholesalerId,
    wholesalerTitle,
}: WholesalerMarketplaceModalProps) {
    const { theme, isDarkMode } = useAuth();
    const { width } = useWindowDimensions();
    const insets = useSafeAreaInsets();

    // Web layout only when the viewport is wide enough.
    const useWebLayout = isWeb && width >= WEB_BREAKPOINT;

    // Floating close button geometry — kept out of the way of the
    // platform chrome and the safe area.
    const closeButtonSize = 36;
    const closeButtonTop = (isWeb ? 12 : 12) + insets.top;
    const closeButtonRight = 12 + (isWeb ? 0 : insets.right);

    return (
        <Modal
            visible={visible}
            animationType="slide"
            presentationStyle="fullScreen"
            onRequestClose={onClose}
            statusBarTranslucent
        >
            <View style={{ flex: 1, backgroundColor: theme.background }}>
                {visible && (
                    useWebLayout ? (
                        <WholesalerMarketplaceWeb
                            onClose={onClose}
                            wholesalerId={wholesalerId}
                            wholesalerTitle={wholesalerTitle}
                        />
                    ) : (
                        <WholesalerMarketplaceMobile
                            onClose={onClose}
                            wholesalerId={wholesalerId}
                            wholesalerTitle={wholesalerTitle}
                        />
                    )
                )}

                {/* Floating close button */}
                {visible && (
                    <Pressable
                        onPress={onClose}
                        accessibilityRole="button"
                        accessibilityLabel="Close marketplace"
                        focusable
                        style={{
                            position: 'absolute',
                            top: closeButtonTop,
                            right: closeButtonRight,
                            width: closeButtonSize,
                            height: closeButtonSize,
                            borderRadius: closeButtonSize / 2,
                            alignItems: 'center',
                            justifyContent: 'center',
                            backgroundColor: isDarkMode
                                ? 'rgba(15,23,42,0.85)'
                                : 'rgba(255,255,255,0.92)',
                            borderWidth: 1,
                            borderColor: isDarkMode ? '#334155' : '#e2e8f0',
                            shadowColor: '#000',
                            shadowOffset: { width: 0, height: 2 },
                            shadowOpacity: 0.15,
                            shadowRadius: 6,
                            elevation: 6,
                            zIndex: 9999,
                            ...(isWeb ? ({ cursor: 'pointer' } as any) : null),
                        }}
                    >
                        <X size={18} color={theme.text} />
                    </Pressable>
                )}
            </View>
        </Modal>
    );
}