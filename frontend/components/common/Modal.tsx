import { useAuth } from "@/context/AuthContext";
import { ReactNode, useEffect, useId, useState } from "react";
import { useDetailsDock } from "@/components/common/listScreen/DetailsDock";
import { SHEET_BOTTOM_MARGIN, SHEET_SIDE_MARGIN, useSheetBottomInset } from "@/components/common/listScreen/AdminSheet";
import {
    KeyboardAvoidingView,
    Platform,
    Pressable,
    Modal as RNModal,
    Text,
    useWindowDimensions,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface Props {
    visible: boolean;
    onClose: () => void;
    title?: string;
    children: ReactNode;
    maxHeightRatio?: number;
    hideHeader?: boolean;
    /** Details: inside a <DetailsDock> on a wide screen, show beside the list instead of popping up. */
    dockable?: boolean;
    /**
     * Phones: size the sheet to its content (alerts, short messages). Default:
     * the sheet takes its full height, so content laid out with flex: 1 (forms
     * with a pinned Save) has room — under a content-sized panel it collapsed.
     */
    fitContent?: boolean;
}

export function Modal({
    visible,
    onClose,
    title,
    children,
    maxHeightRatio = 0.92,
    hideHeader = false,
    dockable = false,
    fitContent = false,
}: Props) {
    const { theme } = useAuth();
    const dock = useDetailsDock();
    const docked = dockable && !!dock?.docked;
    const dockId = useId();
    useEffect(() => {
        if (!dock || !dockable) return;
        dock.setOpen(dockId, docked && visible);
        return () => dock.setOpen(dockId, false);
    }, [dock, dockable, docked, visible, dockId]);

    if (docked) {
        if (!visible) return null;
        return (
            <View
                style={{
                    flex: 1,
                    minHeight: 0,
                    backgroundColor: theme.surface,
                    borderColor: theme.border,
                    borderWidth: 1,
                    borderRadius: 24,
                    overflow: "hidden",
                    ...(Platform.OS === "web" ? ({ boxShadow: "0 8px 28px rgba(15,23,42,0.10)" } as any) : { elevation: 3 }),
                }}
            >
                {!hideHeader ? <Header title={title} onClose={onClose} /> : null}
                <View style={{ flex: 1, minHeight: 0 }}>{children}</View>
            </View>
        );
    }
    const isWeb = Platform.OS === "web";
    const panelMaxHeight = `${maxHeightRatio * 100}%` as const;

    if (isWeb) {
        return (
            <RNModal
                visible={visible}
                transparent
                animationType="fade"
                onRequestClose={onClose}
            >
                <Pressable
                    onPress={onClose}
                    style={{
                        flex: 1,
                        backgroundColor: "rgba(0,0,0,0.5)",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: 24,
                    }}
                >
                    <Pressable
                        onPress={(e) => e.stopPropagation()}
                        style={{
                            width: "100%",
                            maxWidth: 560,
                            maxHeight: panelMaxHeight,
                            backgroundColor: theme.surface,
                            borderColor: theme.border,
                            borderWidth: 1,
                            borderRadius: 16,
                            overflow: "hidden",
                        }}
                    >
                        {!hideHeader ? <Header title={title} onClose={onClose} /> : null}
                        <View style={{ flex: 1 }}>{children}</View>
                    </Pressable>
                </Pressable>
            </RNModal>
        );
    }

    return (
        <NativeSheet visible={visible} onClose={onClose} title={title} hideHeader={hideHeader} maxHeightRatio={maxHeightRatio} fitContent={fitContent}>
            {children}
        </NativeSheet>
    );
}

/**
 * Phones: a sheet that floats clear of the status bar and the bottom edge
 * (navigation bar + margin). Its height is capped in pixels from the measured
 * space — a percentage maxHeight with a flex:1 body hid the content on native —
 * and the backdrop sits behind the panel (a Pressable around the panel took
 * the touches its ScrollViews need).
 */
function NativeSheet({
    visible,
    onClose,
    title,
    hideHeader,
    maxHeightRatio,
    fitContent,
    children,
}: {
    fitContent: boolean;
    visible: boolean;
    onClose: () => void;
    title?: string;
    hideHeader: boolean;
    maxHeightRatio: number;
    children: ReactNode;
}) {
    const { theme } = useAuth();
    const insets = useSafeAreaInsets();
    const { height: winHeight } = useWindowDimensions();
    const [availH, setAvailH] = useState(0);
    const padTop = insets.top + 16;
    const padBottom = useSheetBottomInset() + SHEET_BOTTOM_MARGIN;
    const panelMaxH = Math.max(200, Math.round(((availH || winHeight) - padTop - padBottom) * Math.min(1, maxHeightRatio / 0.92)));

    return (
        <RNModal
            visible={visible}
            transparent
            animationType="slide"
            onRequestClose={onClose}
            statusBarTranslucent
            navigationBarTranslucent
        >
            <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
            <View
                onLayout={(e) => {
                    const h = Math.round(e.nativeEvent.layout.height);
                    setAvailH((prev) => (Math.abs(prev - h) < 1 ? prev : h));
                }}
                style={{
                    flex: 1,
                    justifyContent: "flex-end",
                    paddingTop: padTop,
                    paddingBottom: padBottom,
                    paddingHorizontal: SHEET_SIDE_MARGIN,
                }}
            >
                <Pressable
                    onPress={onClose}
                    accessibilityLabel="Close"
                    style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.6)" }}
                />
                <View
                    style={{
                        ...(fitContent ? { maxHeight: panelMaxH } : { height: panelMaxH }),
                        backgroundColor: theme.surface,
                        borderColor: theme.border,
                        borderWidth: 1,
                        borderRadius: 24,
                        overflow: "hidden",
                        elevation: 12,
                    }}
                >
                    <View style={{ alignItems: "center", paddingTop: 8, paddingBottom: 4 }}>
                        <View
                            style={{
                                width: 40,
                                height: 4,
                                borderRadius: 999,
                                backgroundColor: theme.border,
                            }}
                        />
                    </View>

                    {!hideHeader ? <Header title={title} onClose={onClose} /> : null}

                    <View style={fitContent ? { flexShrink: 1, minHeight: 0 } : { flex: 1, minHeight: 0 }}>{children}</View>
                </View>
            </View>
            </KeyboardAvoidingView>
        </RNModal>
    );
}

function Header({ title, onClose }: { title?: string; onClose: () => void }) {
    const { theme } = useAuth();
    return (
        <View
            style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                paddingHorizontal: 16,
                paddingVertical: 12,
                borderBottomColor: theme.border,
                borderBottomWidth: 1,
            }}
        >
            <Text
                style={{
                    flex: 1,
                    color: theme.text,
                    fontSize: 16,
                    fontWeight: "600",
                }}
                numberOfLines={1}
            >
                {title ?? ""}
            </Text>
            <Pressable onPress={onClose} hitSlop={12}>
                <Text style={{ color: theme.textDark, fontSize: 22, lineHeight: 24 }}>
                    ×
                </Text>
            </Pressable>
        </View>
    );
}