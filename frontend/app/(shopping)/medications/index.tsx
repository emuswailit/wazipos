// app/(shopping)/medications/index.tsx
//
// /medications — the customer's dosing schedule for medicines bought on
// prescriptions. Dose reminders open this screen.

import MedicationScheduleScreen from '@/components/shopping/medications/MedicationScheduleScreen';

export default function MedicationsRoute() {
    return <MedicationScheduleScreen />;
}
