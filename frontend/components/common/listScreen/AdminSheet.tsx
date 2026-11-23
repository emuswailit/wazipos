// components/admin/kit/AdminSheet.tsx
//
// Universal modal surface for admin details + forms.
//   - Phones (native, or web narrower than 640px): bottom sheet with a grab handle.
//   - Wider screens: centred card.
// Sticky header (icon · title · subtitle · close), scrolling body, optional sticky footer.

import { isWeb, useListTokens, webPointer } from '@/components/common/listScreen/tokens';
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useId, useRef, useState } from 'react';
import { Dimensions, Keyboard, KeyboardAvoidingView, Modal, Platform, ScrollView, StatusBar, Text, useWindowDimensions, View } from 'react-native';
import { Pressable } from '@/components/common/StablePressable';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { IconName } from './AdminListView';
import { useDetailsDock } from './DetailsDock';

const SHEET_WIDE_MIN_WIDTH = 640;
/** Phones: gap between a sheet and the bottom of the screen (above the nav bar / home indicator). */
export const SHEET_BOTTOM_MARGIN = 12;
/** Phones: gap between a sheet and the sides of the screen. */
export const SHEET_SIDE_MARGIN = 8;

/**
 * Space to keep clear at the bottom of a phone sheet: the safe-area inset, or
 * on Android — where that inset can come back 0 inside a modal although the
 * modal draws under the navigation bar — the bar's height worked out from the
 * screen vs window size. Without it the last controls of a sheet (e.g.
 * "Start preparing") sat behind the navigation buttons.
 */
export function useSheetBottomInset(): number {
    const insets = useSafeAreaInsets();
    const { height: windowH } = useWindowDimensions();
    if (Platform.OS !== 'android') return insets.bottom;
    const screenH = Dimensions.get('screen').height;
    const statusH = StatusBar.currentHeight ?? 0;
    const navBar = Math.max(0, Math.round(screenH - windowH - statusH));
    // Edge-to-edge windows equal the screen (navBar 0): fall back to a
    // conservative height for a 3-button bar when the inset is missing too.
    const guess = navBar > 0 ? navBar : insets.bottom > 0 ? 0 : ANDROID_NAV_BAR_FALLBACK;
    return Math.max(insets.bottom, guess);
}
const ANDROID_NAV_BAR_FALLBACK = 48;

/**
 * Pixel height the body may use, for sheets with `scroll={false}` that bring
 * their own ScrollView. On native a ScrollView does not shrink under a parent's
 * maxHeight, so a long form pushed the footer (Save) off the sheet: give the
 * ScrollView `style={{ maxHeight: useSheetBodyMaxHeight() }}` instead.
 */
const SheetBodyMaxHeight = React.createContext<number | undefined>(undefined);
export const useSheetBodyMaxHeight = () => React.useContext(SheetBodyMaxHeight);

/**
 * Bare phone bottom-sheet frame for hand-built sheets: a modal whose panel
 * floats clear of the status bar and the bottom edge (nav bar + margin), with
 * a pixel height cap from the measured space (percentage heights hide content
 * on native), the tap-to-close backdrop BEHIND the panel (wrapping the panel
 * stole its scroll touches), and the iOS keyboard handled.
 * `size`: 'fit' (content height, capped) or a fraction of the space, e.g. 0.65.
 * Inside, give a ScrollView `style={{ flexShrink: 1 }}` so pinned buttons stay visible.
 */
export function FloatingSheet({
    visible,
    onClose,
    size = 'fit',
    animationType = 'slide',
    panelStyle,
    children,
}: {
    visible: boolean;
    onClose: () => void;
    size?: 'fit' | number;
    animationType?: 'slide' | 'fade' | 'none';
    panelStyle?: any;
    children: React.ReactNode;
}) {
    const { theme } = useListTokens();
    const insets = useSafeAreaInsets();
    const bottomInset = useSheetBottomInset();
    const { height: winHeight } = useWindowDimensions();
    const [availH, setAvailH] = useState(0);
    const padTop = insets.top + 16;
    const padBottom = bottomInset + SHEET_BOTTOM_MARGIN;
    const room = Math.max(200, (availH || winHeight) - padTop - padBottom);
    const sizeStyle = size === 'fit' ? { maxHeight: room } : { height: Math.round(room * Math.min(1, size)) };
    return (
        <Modal visible={visible} transparent animationType={animationType} statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
                <View
                    onLayout={(e) => {
                        const h = Math.round(e.nativeEvent.layout.height);
                        setAvailH((prev) => (Math.abs(prev - h) < 1 ? prev : h));
                    }}
                    style={{ flex: 1, justifyContent: 'flex-end', paddingTop: padTop, paddingBottom: padBottom, paddingHorizontal: SHEET_SIDE_MARGIN }}
                >
                    <Pressable
                        onPress={onClose}
                        accessibilityRole="button"
                        accessibilityLabel="Close"
                        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15,23,42,0.5)' }}
                    />
                    <View style={[{ backgroundColor: theme.panel, borderRadius: 24, overflow: 'hidden', elevation: 12 }, sizeStyle, panelStyle]}>{children}</View>
                </View>
            </KeyboardAvoidingView>
        </Modal>
    );
}

/** A ScrollView for `scroll={false}` sheets, capped to the sheet body's pixel height. */
export function SheetScrollView({ style, ...rest }: React.ComponentProps<typeof ScrollView>) {
    const maxHeight = useSheetBodyMaxHeight();
    return <ScrollView {...rest} style={[{ flexGrow: 0, flexShrink: 1 }, style, maxHeight ? { maxHeight } : null]} />;
}

interface AdminSheetProps {
    visible: boolean;
    onClose: () => void;
    title: string;
    subtitle?: string | null;
    icon?: IconName;
    /** Accent for the header icon tile (defaults to theme primary). */
    accent?: string;
    /** Max card width on wide screens. */
    width?: number;
    /** Content pinned under the body (actions). */
    footer?: React.ReactNode;
    /** Pass false when children manage their own scrolling. */
    scroll?: boolean;
    /** Disables backdrop / close while e.g. saving. */
    dismissible?: boolean;
    /**
     * Details sheets: inside a <DetailsDock> on a wide screen, show as a panel
     * beside the list (like a cart) instead of a popup.
     */
    dockable?: boolean;
    children: React.ReactNode;
}

export function AdminSheet({
    visible,
    onClose,
    title,
    subtitle,
    icon,
    accent,
    width = 640,
    footer,
    scroll = true,
    dismissible = true,
    dockable = false,
    children,
}: AdminSheetProps) {
    const dock = useDetailsDock();
    const docked = dockable && !!dock?.docked;
    const dockId = useId();
    useEffect(() => {
        if (!dock || !dockable) return;
        dock.setOpen(dockId, docked && visible);
        return () => dock.setOpen(dockId, false);
    }, [dock, dockable, docked, visible, dockId]);
    if (docked) {
        return visible ? (
            <DockedPanel title={title} subtitle={subtitle} icon={icon} accent={accent} footer={footer} scroll={scroll} onClose={() => dismissible && onClose()}>
                {children}
            </DockedPanel>
        ) : null;
    }
    return (
        <ModalSheet
            visible={visible}
            onClose={onClose}
            title={title}
            subtitle={subtitle}
            icon={icon}
            accent={accent}
            width={width}
            footer={footer}
            scroll={scroll}
            dismissible={dismissible}
        >
            {children}
        </ModalSheet>
    );
}

/** A details sheet docked beside the list (DetailsDock): header, scrolling body, footer. */
function DockedPanel({
    title,
    subtitle,
    icon,
    accent,
    footer,
    scroll,
    onClose,
    children,
}: Pick<AdminSheetProps, 'title' | 'subtitle' | 'icon' | 'accent' | 'footer' | 'scroll' | 'children'> & { onClose: () => void }) {
    const { theme, divider, border } = useListTokens();
    const color = accent ?? theme.primary;
    return (
        <View
            style={{
                flex: 1,
                minHeight: 0,
                backgroundColor: theme.panel,
                borderRadius: 24,
                borderWidth: 1,
                borderColor: border,
                overflow: 'hidden',
                ...(isWeb ? ({ boxShadow: '0 8px 28px rgba(15,23,42,0.10)' } as any) : { elevation: 3 }),
            }}
        >
            <View className="flex-row items-center gap-3 px-5" style={{ paddingTop: 16, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: divider }}>
                {icon ? (
                    <View className="w-10 h-10 rounded-2xl items-center justify-center" style={{ backgroundColor: `${color}18` }}>
                        <Ionicons name={icon} size={19} color={color} />
                    </View>
                ) : null}
                <View className="flex-1 min-w-0">
                    <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 16 }} numberOfLines={2}>
                        {title}
                    </Text>
                    {subtitle ? (
                        <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12, marginTop: 1 }} numberOfLines={1}>
                            {subtitle}
                        </Text>
                    ) : null}
                </View>
                <Pressable
                    onPress={onClose}
                    hitSlop={10}
                    accessibilityRole="button"
                    accessibilityLabel="Close details"
                    style={({ pressed }) => ({ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? divider : 'transparent', ...webPointer })}
                >
                    <Ionicons name="close" size={20} color={theme.textDark} />
                </Pressable>
            </View>
            {scroll !== false ? (
                <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 18, gap: 18 }} showsVerticalScrollIndicator={false}>
                    {children}
                </ScrollView>
            ) : (
                <View style={{ flex: 1, minHeight: 0 }}>{children}</View>
            )}
            {footer ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'flex-end', gap: 8, paddingHorizontal: 18, paddingVertical: 12, borderTopWidth: 1, borderTopColor: divider }}>
                    {footer}
                </View>
            ) : null}
        </View>
    );
}

function ModalSheet({
    visible,
    onClose,
    title,
    subtitle,
    icon,
    accent,
    width = 640,
    footer,
    scroll = true,
    dismissible = true,
    children,
}: AdminSheetProps) {
    const { theme, isDarkMode, divider } = useListTokens();
    const { width: winWidth, height: winHeight } = useWindowDimensions();
    const insets = useSafeAreaInsets();
    const wide = winWidth >= SHEET_WIDE_MIN_WIDTH;

    // Height actually available inside the modal (measured): the window size
    // misses the status / navigation bars a translucent modal draws under, which
    // let the sheet run past the bottom of the screen and hide its footer.
    const [availH, setAvailH] = useState(0);
    const containerRef = useRef<View>(null);

    // Android: KeyboardAvoidingView is iOS-only here, and an edge-to-edge modal
    // is not resized for the keyboard, so lift the sheet by however much of it
    // the keyboard covers (0 when the window did resize).
    const [keyboardLift, setKeyboardLift] = useState(0);
    useEffect(() => {
        if (Platform.OS !== 'android' || !visible) return;
        const show = Keyboard.addListener('keyboardDidShow', (e) => {
            containerRef.current?.measureInWindow((_x, y, _w, h) => {
                setKeyboardLift(Math.max(0, Math.round(y + h - e.endCoordinates.screenY)));
            });
        });
        const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardLift(0));
        return () => {
            show.remove();
            hide.remove();
            setKeyboardLift(0);
        };
    }, [visible]);

    // Phones: the sheet floats clear of the status bar and of the bottom edge
    // (navigation bar / home indicator + a margin), so nothing sits under them.
    const padTop = wide ? 24 : insets.top + 16;
    const bottomInset = useSheetBottomInset();
    const padBottom = wide ? 24 : bottomInset + SHEET_BOTTOM_MARGIN + keyboardLift;

    // Native layout does not reliably shrink a ScrollView under a percentage
    // maxHeight, so long content pushed the footer (and its buttons) out of the
    // clipped panel. Measure the chrome and cap the body in pixels instead.
    const [chromeH, setChromeH] = useState({ top: 0, footer: 0 });
    const room = (availH || winHeight) - padTop - padBottom;
    const panelMaxH = Math.max(200, wide ? Math.min(room, Math.round(winHeight * 0.9)) : room);
    const bodyMaxH = Math.max(96, panelMaxH - chromeH.top - chromeH.footer);
    const onTopLayout = (h: number) => setChromeH((c) => (Math.abs(c.top - h) < 1 ? c : { ...c, top: h }));
    const onFooterLayout = (h: number) => setChromeH((c) => (Math.abs(c.footer - h) < 1 ? c : { ...c, footer: h }));
    const color = accent ?? theme.primary;
    const close = () => {
        if (dismissible) onClose();
    };

    const panelStyle = wide
        ? {
            width: '100%' as const,
            maxWidth: width,
            maxHeight: panelMaxH,
            borderRadius: 24,
            ...(isWeb ? ({ boxShadow: '0 24px 64px rgba(15,23,42,0.28)' } as any) : { elevation: 12 }),
        }
        : {
            width: '100%' as const,
            maxHeight: panelMaxH,
            borderRadius: 24,
            ...(isWeb ? ({ boxShadow: '0 -8px 32px rgba(15,23,42,0.22)' } as any) : { elevation: 12 }),
        };

    return (
        <Modal
            visible={visible}
            transparent
            animationType={wide ? 'fade' : 'slide'}
            statusBarTranslucent
            // Draw under the Android navigation bar too, so the bottom padding
            // below (its inset + margin) is what keeps the sheet clear of it.
            navigationBarTranslucent
            onRequestClose={close}
        >
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
                <View
                    ref={containerRef}
                    onLayout={(e) => {
                        const h = Math.round(e.nativeEvent.layout.height);
                        setAvailH((prev) => (Math.abs(prev - h) < 1 ? prev : h));
                    }}
                    style={{
                        flex: 1,
                        justifyContent: wide ? 'center' : 'flex-end',
                        alignItems: 'center',
                        paddingTop: padTop,
                        paddingBottom: padBottom,
                        paddingHorizontal: wide ? 24 : SHEET_SIDE_MARGIN,
                    }}
                >
                    <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Close"
                        onPress={close}
                        style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(15,23,42,0.5)' }}
                    />

                    <View style={{ backgroundColor: theme.panel, overflow: 'hidden', ...panelStyle }}>
                        <View onLayout={(e) => onTopLayout(e.nativeEvent.layout.height)}>
                        {!wide ? (
                            <View className="items-center pt-2.5 pb-1">
                                <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: isDarkMode ? '#334155' : '#cbd5e1' }} />
                            </View>
                        ) : null}

                        {/* Header */}
                        <View className="flex-row items-center gap-3 px-5" style={{ paddingTop: wide ? 18 : 8, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: divider }}>
                            {icon ? (
                                <View className="w-10 h-10 rounded-2xl items-center justify-center" style={{ backgroundColor: `${color}18` }}>
                                    <Ionicons name={icon} size={19} color={color} />
                                </View>
                            ) : null}
                            <View className="flex-1 min-w-0">
                                <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 17 }} numberOfLines={2}>
                                    {title}
                                </Text>
                                {subtitle ? (
                                    <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12, marginTop: 1 }} numberOfLines={1}>
                                        {subtitle}
                                    </Text>
                                ) : null}
                            </View>
                            <Pressable
                                onPress={close}
                                hitSlop={10}
                                accessibilityRole="button"
                                accessibilityLabel="Close"
                                style={({ pressed }) => ({
                                    width: 36,
                                    height: 36,
                                    borderRadius: 18,
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    backgroundColor: pressed ? divider : 'transparent',
                                    ...webPointer,
                                })}
                            >
                                <Ionicons name="close" size={22} color={theme.textDark} />
                            </Pressable>
                        </View>
                        </View>

                        {/* Body */}
                        {scroll ? (
                            <ScrollView
                                style={{ flexGrow: 0, flexShrink: 1, maxHeight: bodyMaxH }}
                                contentContainerStyle={{ padding: 20, gap: 18 }}
                                keyboardShouldPersistTaps="handled"
                                showsVerticalScrollIndicator={false}
                            >
                                {children}
                            </ScrollView>
                        ) : (
                            <View style={{ flexShrink: 1, maxHeight: bodyMaxH, overflow: 'hidden' }}>
                                <SheetBodyMaxHeight.Provider value={bodyMaxH}>{children}</SheetBodyMaxHeight.Provider>
                            </View>
                        )}

                        {/* Footer */}
                        {footer ? (
                            <View
                                onLayout={(e) => onFooterLayout(e.nativeEvent.layout.height)}
                                style={{
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    justifyContent: 'flex-end',
                                    gap: 8,
                                    paddingHorizontal: 20,
                                    paddingTop: 12,
                                    borderTopWidth: 1,
                                    borderTopColor: divider,
                                    paddingBottom: 14,
                                    flexShrink: 0,
                                }}
                            >
                                {footer}
                            </View>
                        ) : null}
                    </View>
                </View>
            </KeyboardAvoidingView>
        </Modal>
    );
}

/* =========================================================
 * Footer buttons
 * ======================================================= */

export function SheetButton({
    label,
    onPress,
    variant = 'primary',
    icon,
    loading,
    loadingLabel = 'Saving…',
    disabled,
    grow,
}: {
    label: string;
    onPress: () => void;
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
    icon?: IconName;
    loading?: boolean;
    /** Label while loading (default "Saving…"). */
    loadingLabel?: string;
    disabled?: boolean;
    /** Stretch to share the footer width (phones). */
    grow?: boolean;
}) {
    const { theme, border } = useListTokens();
    // Narrow phones: smaller label and padding so the label fits the button.
    const { width: winW } = useWindowDimensions();
    const fontSize = winW < 360 ? 12 : winW < 400 ? 13 : 14;
    const off = disabled || loading;
    const bg = variant === 'primary' ? theme.primary : variant === 'danger' ? '#f43f5e' : variant === 'secondary' ? `${theme.primary}12` : 'transparent';
    const fg = variant === 'primary' || variant === 'danger' ? '#fff' : variant === 'secondary' ? theme.primary : theme.text;
    const [pressed, setPressed] = useState(false);
    return (
        <Pressable
            onPress={onPress}
            onPressIn={() => setPressed(true)}
            onPressOut={() => setPressed(false)}
            disabled={off}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityState={{ disabled: !!off, busy: !!loading }}
            // A plain style object, never a function: on native, NativeWind's Pressable
            // dropped a function style entirely, leaving the white label on no
            // background — primary buttons (Save, Start preparing…) were invisible.
            style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                height: 44,
                minHeight: 44,
                paddingHorizontal: winW < 400 ? 12 : 20,
                borderRadius: 16,
                backgroundColor: bg,
                borderWidth: variant === 'ghost' ? 1 : 0,
                borderColor: border,
                opacity: off ? 0.55 : pressed ? 0.85 : 1,
                flexGrow: grow ? 1 : 0,
                flexBasis: grow ? 0 : 'auto',
                // Primary: brand cobalt -> sky on web, with a soft coloured glow everywhere.
                ...(variant === 'primary' || variant === 'danger'
                    ? {
                        shadowColor: bg, shadowOpacity: off ? 0 : 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 5 }, elevation: off ? 0 : 4,
                        ...(isWeb && variant === 'primary' ? ({ backgroundImage: `linear-gradient(120deg, ${theme.primary}, ${theme.accent})` } as any) : {}),
                    }
                    : {}),
                ...webPointer,
            }}
        >
            {icon ? <Ionicons name={loading ? 'hourglass-outline' : icon} size={fontSize + 2} color={fg} /> : null}
            <Text style={{ flexShrink: 1, color: fg, fontFamily: theme.font.bold, fontSize }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                {loading ? loadingLabel : label}
            </Text>
        </Pressable>
    );
}

/** True when sheets render as centred cards (used to lay out footers). */
export function useSheetIsWide(): boolean {
    const { width } = useWindowDimensions();
    return width >= SHEET_WIDE_MIN_WIDTH;
}
