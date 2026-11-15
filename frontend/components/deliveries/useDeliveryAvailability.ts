// components/deliveries/useDeliveryAvailability.ts
//
// DELIVERY is only open to businesses whose location is set (entitylocations).
// Asks the server (GetDeliveryAvailability) so fulfilment pickers can hide or
// disable delivery and say why. While loading or offline, delivery stays off.

import deliveriesApi, { isOk } from '@/api/deliveriesApi';
import { useEffect, useState } from 'react';

export type DeliveryAvailability = {
    loading: boolean;
    available: boolean;
    /** Why delivery is off (e.g. "… has not set its business location"). */
    reason: string | null;
};

/**
 * @param target { entity } for a shop, { retailer_order } for both sides of an
 *               order, {} for the caller's own business. Pass null to skip.
 */
export function useDeliveryAvailability(target: { entity?: string; retailer_order?: string } | null): DeliveryAvailability {
    const key = target ? `${target.entity ?? ''}|${target.retailer_order ?? ''}` : null;
    const [state, setState] = useState<DeliveryAvailability>({ loading: !!target, available: false, reason: null });

    useEffect(() => {
        if (key === null) {
            setState({ loading: false, available: false, reason: null });
            return;
        }
        let alive = true;
        setState((s) => ({ ...s, loading: true }));
        const [entity, retailer_order] = key.split('|');
        deliveriesApi
            .getDeliveryAvailability({ ...(entity ? { entity } : {}), ...(retailer_order ? { retailer_order } : {}) })
            .then((res: any) => {
                if (!alive) return;
                const a = isOk(res) ? res.data?.availability : null;
                setState({
                    loading: false,
                    available: !!a?.delivery_available,
                    reason: a ? (a.reasons?.[0] ?? null) : 'Delivery availability could not be checked.',
                });
            })
            .catch(() => {
                if (alive) setState({ loading: false, available: false, reason: 'Delivery availability could not be checked.' });
            });
        return () => {
            alive = false;
        };
    }, [key]);

    return state;
}
