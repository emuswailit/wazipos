// components/retailers/customerOrders/types.ts
//
// One CustomerOrder type for the whole customer-orders feature: re-export the
// canonical definition (databases/types.ts). This file used to declare a smaller
// copy, so values passed between the screens and the storage layer didn't type-check.

export type { CustomerOrder } from '@/databases/types';
