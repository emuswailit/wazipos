import OrderFormContainer from '@/components/wholesalers/newWholesaleOrder/OrderFormContainer';
import { useAuth } from '@/context/AuthContext';
import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView } from 'react-native';

// Staff create a retailer order here; it is submitted straight to
// CreateStaffRetailerOrder (no offline queue). Form, scanner and submit
// state all live in useWholesaleOrderForm via OrderFormContainer.
export default function NewWholesaleOrder() {
    const { theme, user } = useAuth();
    const scrollViewRef = useRef<ScrollView>(null);
    const [rowsCount, setRowsCount] = useState(1);
    const previousRowsCount = useRef(1);

    // Keep newly added rows in view.
    useEffect(() => {
        if (rowsCount > previousRowsCount.current) {
            const timer = setTimeout(() => {
                scrollViewRef.current?.scrollToEnd({ animated: true });
            }, 60);
            previousRowsCount.current = rowsCount;
            return () => clearTimeout(timer);
        }
        previousRowsCount.current = rowsCount;
    }, [rowsCount]);

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={{ flex: 1, width: '100%' }}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 20}
        >
            <ScrollView
                ref={scrollViewRef}
                contentContainerStyle={{
                    flexGrow: 1,
                    padding: 16,
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'flex-start',
                }}
                style={{ backgroundColor: theme.background }}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                showsVerticalScrollIndicator
                bounces
                overScrollMode="always"
            >
                <OrderFormContainer
                    theme={theme}
                    user={user}
                    onRowsCountChange={setRowsCount}
                />
            </ScrollView>
        </KeyboardAvoidingView>
    );
}
