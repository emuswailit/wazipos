// components/admin/kit/AdminSheet.tsx
//
// Universal modal surface for admin details + forms.
//   - Phones (native, or web narrower than 640px): bottom sheet with a grab handle.
//   - Wider screens: centred card.
// Sticky header (icon · title · subtitle · close), scrolling body, optional sticky footer.

import { isWeb, useListTokens, webPointer } from '@/components/common/listScreen/tokens';
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useId, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { IconName } from './AdminListView';
import { useDetailsDock } from './DetailsDock';

const SHEET_WIDE_MIN_WIDTH = 640;

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

    // Native layout does not reliably shrink a ScrollView under a percentage
    // maxHeight, so long content pushed the footer (and its buttons) out of the
    // clipped panel. Measure the chrome and cap the body in pixels instead.
    const [chromeH, setChromeH] = useState({ top: 0, footer: 0 });
    const panelMaxH = wide ? Math.round(winHeight * 0.9) : Math.round(winHeight * 0.92) - insets.top;
    const bodyMaxH = Math.max(120, panelMaxH - chromeH.top - chromeH.footer);
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
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
        };

    return (
        <Modal visible={visible} transparent animationType={wide ? 'fade' : 'slide'} statusBarTranslucent onRequestClose={close}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
                <View style={{ flex: 1, justifyContent: wide ? 'center' : 'flex-end', alignItems: 'center', padding: wide ? 24 : 0 }}>
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
                                contentContainerStyle={{ padding: 20, gap: 18, paddingBottom: footer ? 20 : 20 + (wide ? 0 : insets.bottom) }}
                                keyboardShouldPersistTaps="handled"
                                showsVerticalScrollIndicator={false}
                            >
                                {children}
                            </ScrollView>
                        ) : (
                            <View style={{ flexShrink: 1, maxHeight: bodyMaxH }}>{children}</View>
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
                                    paddingBottom: 12 + (wide ? 0 : insets.bottom),
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
    return (
        <Pressable
            onPress={onPress}
            disabled={off}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityState={{ disabled: !!off, busy: !!loading }}
            // Layout lives in `style` (not className): NativeWind drops className styles
            // on a Pressable whose style is a function, which collapsed these buttons.
            style={({ pressed }) => ({
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
                ...webPointer,
            })}
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
