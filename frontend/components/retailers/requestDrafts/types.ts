// components/retailers/requestDrafts/types.ts
import type { RequestDraftItem } from '@/databases/types';

export interface RetailerRequestDraftsViewProps {
    drafts: RequestDraftItem[];
    draftCount: number;
    draftTotalQuantity: number;
    /** True while a CreateRequest call is in flight. */
    isSubmittingRequest?: boolean;
    onAddNew: () => void;
    onEditItem: (item: RequestDraftItem) => void;
    onRemoveItem: (item: RequestDraftItem) => void;
    onClearAll: () => void;
    onContinue: () => void;
}