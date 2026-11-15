// components/common/listScreen/DetailsDock.tsx
//
// Record details beside the list, like a cart: on wide screens (>= 1100 px)
// a details sheet (AdminDetailsSheet, or any AdminSheet marked `dockable`)
// rendered inside <DetailsDock pane={…}> shows as a panel on the left of the
// list instead of a popup. With nothing open the panel shows a short hint.
// Narrower screens keep the usual bottom sheet / centred card.
//
//   <DetailsDock pane={<ThingDetailsModal visible={…} … />} placeholder="Pick a thing">
//       <AdminListView … />
//   </DetailsDock>

import { Ionicons } from '@expo/vector-icons';
import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { Modal, Pressable, Text, useWindowDimensions, View } from 'react-native';

import type { IconName } from './AdminListView';
import { isWeb, useListTokens } from './tokens';

/** From this width the details sit beside the list. */
export const DOCK_MIN_WIDTH = 1100;
const PANE_WIDTH = 440;
/** Which side the panel sits on. */
const PANE_SIDE: 'left' | 'right' = 'left';

interface DockState {
    docked: boolean;
    /** A docked sheet reports when it opens / closes (to hide the hint). */
    setOpen: (id: string, open: boolean) => void;
}

const DockContext = createContext<DockState | null>(null);

/** Inside a DetailsDock on a wide screen? (AdminSheet renders inline then.) */
export function useDetailsDock() {
    return useContext(DockContext);
}

export function DetailsDock({
    pane,
    children,
    placeholder = 'Pick an item to see its details here.',
    placeholderIcon = 'hand-right-outline',
    minWidth = DOCK_MIN_WIDTH,
}: {
    /** The details sheet(s); rendered in the panel on wide screens. */
    pane: React.ReactNode;
    /** The list. */
    children: React.ReactNode;
    placeholder?: string;
    placeholderIcon?: IconName;
    minWidth?: number;
}) {
    const { theme, border, chipBg } = useListTokens();
    const { width } = useWindowDimensions();
    const docked = width >= minWidth;
    const [open, setOpenIds] = useState<Record<string, true>>({});
    const setOpen = useCallback((id: string, isOpen: boolean) => {
        setOpenIds((prev) => {
            if (isOpen === !!prev[id]) return prev;
            const next = { ...prev };
            if (isOpen) next[id] = true;
            else delete next[id];
            return next;
        });
    }, []);
    const value = useMemo(() => ({ docked, setOpen }), [docked, setOpen]);
    const anyOpen = Object.keys(open).length > 0;

    if (!docked) {
        return (
            <DockContext.Provider value={value}>
                {children}
                {pane}
            </DockContext.Provider>
        );
    }

    const panel = (
        <View style={{ width: PANE_WIDTH, flexShrink: 0, padding: 12, [PANE_SIDE === 'left' ? 'paddingRight' : 'paddingLeft']: 0 }}>
            <View style={{ flex: 1, minHeight: 0 }}>
                {pane}
                {!anyOpen ? (
                    <View
                        className="flex-1 items-center justify-center rounded-3xl px-8"
                        style={{ borderWidth: 1, borderColor: border, borderStyle: 'dashed', backgroundColor: theme.panel, gap: 10 }}
                    >
                        <View className="w-12 h-12 rounded-2xl items-center justify-center" style={{ backgroundColor: chipBg }}>
                            <Ionicons name={placeholderIcon} size={22} color={theme.textDark} />
                        </View>
                        <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 13, textAlign: 'center' }}>{placeholder}</Text>
                    </View>
                ) : null}
            </View>
        </View>
    );

    return (
        <DockContext.Provider value={value}>
            <View style={{ flex: 1, flexDirection: PANE_SIDE === 'left' ? 'row' : 'row-reverse', minHeight: 0, ...(isWeb ? ({ height: '100%' } as any) : null) }}>
                {panel}
                <View style={{ flex: 1, minWidth: 0 }}>{children}</View>
            </View>
        </DockContext.Provider>
    );
}

/**
 * For details popups that draw their own header / body / footer: a popup
 * (dimmed backdrop, centred card) normally, the same card as a panel beside the
 * list when inside a wide <DetailsDock>.
 */
export function DockableShell({
    visible,
    onClose,
    cardClassName,
    cardStyle,
    children,
}: {
    visible: boolean;
    onClose: () => void;
    /** Classes of the popup card (width, max height, radius…). */
    cardClassName?: string;
    cardStyle?: any;
    children: React.ReactNode;
}) {
    const dock = useDetailsDock();
    const docked = !!dock?.docked;
    const id = React.useId();
    const { theme, border } = useListTokens();
    React.useEffect(() => {
        if (!dock) return;
        dock.setOpen(id, docked && visible);
        return () => dock.setOpen(id, false);
    }, [dock, docked, visible, id]);

    if (docked) {
        if (!visible) return null;
        return (
            <View
                style={[
                    { flex: 1, minHeight: 0, borderRadius: 24, borderWidth: 1, borderColor: border, overflow: 'hidden', backgroundColor: theme.panel },
                    isWeb ? ({ boxShadow: '0 8px 28px rgba(15,23,42,0.10)' } as any) : { elevation: 3 },
                    cardStyle,
                    { width: undefined, maxWidth: undefined, maxHeight: undefined },
                ]}
            >
                {children}
            </View>
        );
    }
    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            <View className="flex-1 bg-black/40 items-center justify-center p-3">
                <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }} />
                <View className={cardClassName} style={cardStyle}>
                    {children}
                </View>
            </View>
        </Modal>
    );
}
