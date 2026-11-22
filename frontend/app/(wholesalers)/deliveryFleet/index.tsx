// app/(wholesalers)/deliveryFleet/index.tsx — Deliveries -> Fleet: own vehicles, papers, running costs, trips.
// The backend scopes everything to the signed-in user's business (logistics/utils/fleet.py).

import FleetManager from '@/components/deliveries/fleet/FleetManager';
import React from 'react';

export default function DeliveryFleetRoute() {
    return <FleetManager />;
}
