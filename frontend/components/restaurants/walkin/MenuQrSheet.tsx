// components/restaurants/walkin/MenuQrSheet.tsx
//
// The restaurant's menu QR code (GenerateQRCode, purpose RESTAURANT_MENU):
// for the whole restaurant, or for one table — scanning it opens the public
// menu page with that table already picked. Print it, save it or share the link.

import { errorText, isOk } from '@/api/diningApi';
import qrMenuApi, { type MenuQrCode } from '@/api/qrMenuApi';
import { AdminSheet, SheetButton, useListTokens } from '@/components/common/listScreen';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Linking, Platform, Share, Text, View } from 'react-native';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);

export default function MenuQrSheet({ visible, onClose, table }: { visible: boolean; onClose: () => void; table?: { id: string; title: string } | null }) {
    const { theme, border } = useListTokens();
    const [qr, setQr] = useState<MenuQrCode | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const tableId = table?.id ?? null;

    useEffect(() => {
        if (!visible) return;
        let live = true;
        setQr(null);
        setError(null);
        setCopied(false);
        // On the web the code points at this site, so it works wherever the app is hosted.
        const base = Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.origin : undefined;
        qrMenuApi
            .qrCode(tableId, base)
            .then((res: any) => {
                if (!live) return;
                if (isOk(res)) setQr(res.data.qr_code);
                else setError(errorText(res, 'The QR code could not be made.'));
            })
            .catch(() => live && setError('Could not reach the server.'));
        return () => {
            live = false;
        };
    }, [visible, tableId]);

    const print = () => {
        if (!qr || Platform.OS !== 'web' || typeof window === 'undefined') return;
        const w = window.open('', '_blank', 'width=480,height=680');
        if (!w) return;
        w.document.write(
            `<html><head><title>${esc(qr.label)}</title><style>body{font-family:system-ui,sans-serif;text-align:center;padding:32px}h1{font-size:26px;margin:0 0 4px}p{color:#475569;margin:6px 0}img{width:320px;height:320px}</style></head>` +
                `<body><h1>${esc(qr.label)}</h1><p>Scan to see the menu and order</p><img src="${qr.image}" alt="Menu QR code" onload="window.print()"/><p>Food and drinks · pay with M-Pesa or to your waiter</p></body></html>`,
        );
        w.document.close();
    };
    const save = () => {
        if (!qr || Platform.OS !== 'web' || typeof document === 'undefined') return;
        const a = document.createElement('a');
        a.href = qr.image;
        a.download = `${qr.label.replace(/[^\w]+/g, '-').toLowerCase()}-menu-qr.png`;
        a.click();
    };
    const share = async () => {
        if (!qr) return;
        if (Platform.OS === 'web') {
            try {
                await navigator.clipboard.writeText(qr.url);
                setCopied(true);
            } catch {
                setError('Copy the link shown above.');
            }
        } else {
            await Share.share({ message: `${qr.label} — menu: ${qr.url}` }).catch(() => undefined);
        }
    };

    return (
        <AdminSheet visible={visible} onClose={onClose} title="Menu QR code" subtitle={table ? `For ${table.title}` : 'For the whole restaurant'} icon="qr-code-outline" width={460}>
            <View style={{ gap: 14, alignItems: 'center' }}>
                {!qr && !error ? <ActivityIndicator color={theme.primary} style={{ marginVertical: 60 }} /> : null}
                {error ? <Text style={{ color: '#f43f5e', fontFamily: theme.font.medium, fontSize: 13, textAlign: 'center' }}>{error}</Text> : null}
                {qr ? (
                    <>
                        <View className="rounded-2xl p-3" style={{ backgroundColor: '#fff', borderWidth: 1, borderColor: border }}>
                            <Image source={{ uri: qr.image }} style={{ width: 240, height: 240 }} accessibilityLabel={`QR code for ${qr.label}`} />
                        </View>
                        <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 16, textAlign: 'center' }}>{qr.label}</Text>
                        <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12.5, textAlign: 'center' }}>
                            Guests scan this with their phone camera to see your food and drinks and order{table ? ` from ${table.title}` : ''} — no app or account needed.
                        </Text>
                        <Text selectable style={{ color: theme.primary, fontFamily: theme.font.medium, fontSize: 12, textAlign: 'center' }} onPress={() => void Linking.openURL(qr.url).catch(() => undefined)}>
                            {qr.url}
                        </Text>
                        <View style={{ gap: 8, alignSelf: 'stretch' }}>
                            {Platform.OS === 'web' ? <SheetButton label="Print" icon="print-outline" onPress={print} /> : null}
                            {Platform.OS === 'web' ? <SheetButton label="Save image" icon="download-outline" variant="secondary" onPress={save} /> : null}
                            <SheetButton label={Platform.OS === 'web' ? (copied ? 'Link copied' : 'Copy link') : 'Share link'} icon={Platform.OS === 'web' ? 'copy-outline' : 'share-outline'} variant="secondary" onPress={() => void share()} />
                        </View>
                    </>
                ) : null}
            </View>
        </AdminSheet>
    );
}
