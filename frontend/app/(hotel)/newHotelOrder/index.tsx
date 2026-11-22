// app/(hotel)/newHotelOrder/index.tsx — Hotel section. The hotel POS: food and drinks for a walk-in guest, paid at the counter.
// Same screen as the Restaurant section, worded for a hotel.

import StaffWalkIn from '@/components/restaurants/walkin/StaffWalkIn';
import { DiningKindProvider } from '@/components/restaurants/diningKind';

export default function NewHotelOrderRoute() {
    return (
        <DiningKindProvider kind="hotel">
            <StaffWalkIn />
        </DiningKindProvider>
    );
}
