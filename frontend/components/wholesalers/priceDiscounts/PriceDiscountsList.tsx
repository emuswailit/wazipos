// Orchestrator — owns filter/selection state, picks the presentation
// layer by viewport width (platform is only a tiebreaker for native).
//
//   wide  (>= 900px)  → PriceDiscountsWebView     (table)
//   narrow (< 900px)  → PriceDiscountsMobileView  (cards)
//
// Create flow: "New" → opens the form modal (empty). The modal itself
//              owns the receipt picker, so no separate pick step.
// Edit flow:   row's Edit → opens the form modal with existing record.

import { useAlert } from "@/components/common/AlertProvider";
import { usePriceDiscountList } from "@/hooks/useDiscounts";
import { useMemo, useState } from "react";
import { Platform, useWindowDimensions } from "react-native";
import PriceDiscountDetailsModal from "./PriceDiscountDetailsModal";
import PriceDiscountEditModal from "./PriceDiscountEditModal";
import PriceDiscountsMobileView from "./PriceDiscountsMobileView";
import PriceDiscountsWebView from "./PriceDiscountsWebView";
import type { PriceDiscount, PriceDiscountFilter } from "./types";

/**
 * Width at which the table layout takes over.
 * 900px is the same breakpoint the campaign builder uses for its
 * split left/right layout, so the two screens agree on "wide".
 */
const WIDE_BREAKPOINT = 900;

export default function PriceDiscountsList() {
    const alert = useAlert();
    const { width } = useWindowDimensions();

    const [filter, setFilter] = useState<PriceDiscountFilter>("ALL");
    const [detailsId, setDetailsId] = useState<string | null>(null);
    const [editTarget, setEditTarget] = useState<PriceDiscount | null>(null);
    const [createOpen, setCreateOpen] = useState(false);
    const [refreshing, setRefreshing] = useState(false);

    // Native is always considered narrow — a tablet in portrait is
    // still better served by the card list than by a scrollable table.
    // Only web checks the actual viewport width.
    const useWebLayout =
        Platform.OS === "web" && width >= WIDE_BREAKPOINT;

    const filters = useMemo(() => {
        if (filter === "ALL") return undefined;
        return {
            state: filter.toLowerCase() as
                | "active"
                | "scheduled"
                | "expired"
                | "inactive",
        };
    }, [filter]);

    const { data, isLoading, error, refresh } = usePriceDiscountList(filters);

    const onRefresh = async () => {
        setRefreshing(true);
        try {
            await refresh();
        } finally {
            setRefreshing(false);
        }
    };

    const shared = {
        discounts: data,
        isLoading,
        error,
        filter,
        onFilterChange: setFilter,
        onOpenDetails: setDetailsId,
        onCreate: () => setCreateOpen(true),
        onEdit: (d: PriceDiscount) => setEditTarget(d),
        onRefresh,
        refreshing,
    };

    return (
        <>
            {useWebLayout ? (
                <PriceDiscountsWebView {...shared} />
            ) : (
                <PriceDiscountsMobileView {...shared} />
            )}

            <PriceDiscountDetailsModal
                visible={detailsId !== null}
                discountId={detailsId ?? undefined}
                onClose={() => setDetailsId(null)}
                onEdit={(d) => {
                    setDetailsId(null);
                    setEditTarget(d);
                }}
            />

            <PriceDiscountEditModal
                visible={createOpen || editTarget !== null}
                discount={editTarget}
                onClose={() => {
                    setCreateOpen(false);
                    setEditTarget(null);
                }}
                onSaved={async () => {
                    setCreateOpen(false);
                    setEditTarget(null);
                    alert("Saved", "Price discount saved.");
                    await refresh();
                }}
            />
        </>
    );
}