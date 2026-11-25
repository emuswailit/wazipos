// components/common/MenuSectionsCard.tsx
//
// Profile → Menu sections: show or hide optional menu sections (e.g. Church). The
// choice is saved on the account, so it applies on every device (utils/menuPrefs).

import { useAuth } from '@/context/AuthContext';
import { useHiddenMenus } from '@/utils/menuPrefs';
import { HIDEABLE_SECTIONS } from '@/utils/navigationData';
import React from 'react';
import { Switch, Text, View } from 'react-native';

export default function MenuSectionsCard({ borderColor }: { borderColor: string }) {
    const { theme } = useAuth();
    const { isHidden, setHidden } = useHiddenMenus();
    return (
        <View>
            {HIDEABLE_SECTIONS.map((s, i) => {
                const shown = !isHidden(s.key);
                return (
                    <View key={s.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12, borderTopWidth: i ? 1 : 0, borderColor }}>
                        <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={{ color: theme.text, fontFamily: theme.font.semibold, fontSize: 13.5 }}>{s.title}</Text>
                            <Text style={{ color: theme.textDark, fontFamily: theme.font.regular, fontSize: 11.5, marginTop: 2 }}>{s.description}</Text>
                        </View>
                        <Switch
                            value={shown}
                            onValueChange={(on) => void setHidden(s.key, !on)}
                            trackColor={{ true: theme.primary, false: undefined }}
                            accessibilityLabel={`${shown ? 'Hide' : 'Show'} the ${s.title} menu`}
                        />
                    </View>
                );
            })}
        </View>
    );
}
