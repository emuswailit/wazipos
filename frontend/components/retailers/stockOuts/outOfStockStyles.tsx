import { Alert, Platform } from 'react-native';

export function notifyNoOffers(productTitle: string) {
    const title = 'No Offers';
    const message =
        `There are no wholesaler offers for "${productTitle}" yet. ` +
        `Check back once suppliers submit quotes.`;

    if (Platform.OS === 'web') {
        if (typeof window !== 'undefined') {
            window.alert(`${title}\n\n${message}`);
        } else {
            console.log(`[NOTIFY] ${title} — ${message}`);
        }
        return;
    }

    Alert.alert(title, message, [{ text: 'OK' }], {
        cancelable: true,
    });
}