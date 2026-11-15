import { useAuth } from "@/context/AuthContext";
import { ReactNode, useEffect, useId } from "react";
import { useDetailsDock } from "@/components/common/listScreen/DetailsDock";
import {
    Platform,
    Pressable,
    Modal as RNModal,
    Text,
    View,
} from "react-native";

interface Props {
    visible: boolean;
    onClose: () => void;
    title?: string;
    children: ReactNode;
    maxHeightRatio?: number;
    hideHeader?: boolean;
    /** Details: inside a <DetailsDock> on a wide screen, show beside the list instead of popping up. */
    dockable?: boolean;
}

export function Modal({
    visible,
    onClose,
    title,
    children,
    maxHeightRatio = 0.92,
    hideHeader = false,
    dockable = false,
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
        <RNModal
            visible={visible}
            transparent
            animationType="slide"
            onRequestClose={onClose}
            statusBarTranslucent
        >
            <Pressable
                onPress={onClose}
                style={{
                    flex: 1,
                    backgroundColor: "rgba(0,0,0,0.6)",
                    justifyContent: "flex-end",
                }}
            >
                <Pressable
                    onPress={(e) => e.stopPropagation()}
                    style={{
                        maxHeight: panelMaxHeight,
                        backgroundColor: theme.surface,
                        borderTopColor: theme.border,
                        borderTopWidth: 1,
                        borderTopLeftRadius: 24,
                        borderTopRightRadius: 24,
                        overflow: "hidden",
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

                    <View style={{ flex: 1 }}>{children}</View>
                </Pressable>
            </Pressable>
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