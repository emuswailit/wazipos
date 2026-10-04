// Orchestrator — owns filter / selection / modal state, picks the
// presentation layer by viewport width.
//
//   wide  (>= 900px)  → WholesalerCampaignsWebView     (table)
//   narrow (< 900px)  → WholesalerCampaignsMobileView  (cards)
//
// Native is always treated as narrow.
//
// Modal chain:
//   "New campaign"  → EditModal (meta form, create mode)
//   row tap         → DetailsModal
//   DetailsModal →  "Edit details"         → EditModal (meta form, edit)
//   DetailsModal →  "Products & retailers" → BuilderModal (drafts only)
//   row Edit (draft)→ BuilderModal directly

import type { Campaign, CampaignStatus, UUID } from "@/campaigns/types";
import { useAlert } from "@/components/common/AlertProvider";
import { useCampaignList } from "@/hooks/useCampaigns";
import { useMemo, useState } from "react";
import { Platform, useWindowDimensions } from "react-native";
import WholesalerCampaignBuilderModal from "./WholesalerCampaignBuilderModal";
import WholesalerCampaignDetailsModal from "./WholesalerCampaignDetailsModal";
import WholesalerCampaignEditModal from "./WholesalerCampaignEditModal";
import WholesalerCampaignsMobileView from "./WholesalerCampaignsMobileView";
import WholesalerCampaignsWebView from "./WholesalerCampaignsWebView";

type Filter = "ALL" | CampaignStatus;

const WIDE_BREAKPOINT = 900;

export default function WholesalerCampaignsList() {
    const alert = useAlert();
    const { width } = useWindowDimensions();
    const useWebLayout =
        Platform.OS === "web" && width >= WIDE_BREAKPOINT;

    /* ---------- List state ---------- */

    const [filter, setFilter] = useState<Filter>("ALL");
    const [refreshing, setRefreshing] = useState(false);

    const filters = useMemo(() => {
        if (filter === "ALL") return {};
        return { status: filter };
    }, [filter]);

    const { data, isLoading, error, refresh } = useCampaignList(
        "wholesaler",
        filters
    );

    const onRefresh = async () => {
        setRefreshing(true);
        try {
            await refresh();
        } finally {
            setRefreshing(false);
        }
    };

    /* ---------- Modal state ---------- */

    // Details modal — non-null when a row is open.
    const [detailsId, setDetailsId] = useState<UUID | null>(null);

    // Meta form — non-null when editing an existing campaign.
    // `createOpen` handles the "New campaign" path separately.
    const [editingMeta, setEditingMeta] = useState<Campaign | null>(null);
    const [createOpen, setCreateOpen] = useState(false);

    // Builder — non-null when a draft is being edited for
    // products / retailers / discounts.
    const [builderId, setBuilderId] = useState<UUID | null>(null);

    /* ---------- Shared props for both views ---------- */

    const shared = {
        campaigns: data,
        isLoading,
        error,
        filter,
        onFilterChange: setFilter,
        onOpenDetails: (id: UUID) => setDetailsId(id),
        onOpenBuilder: (id: UUID) => setBuilderId(id),
        onOpenCreate: () => setCreateOpen(true),
        onRefresh,
        refreshing,
    };

    /* ---------- Render ---------- */

    return (
        <>
            {useWebLayout ? (
                <WholesalerCampaignsWebView {...shared} />
            ) : (
                <WholesalerCampaignsMobileView {...shared} />
            )}

            {/* Read-only details + chain actions */}
            <WholesalerCampaignDetailsModal
                visible={detailsId !== null}
                campaignId={detailsId ?? undefined}
                onClose={() => setDetailsId(null)}
                onChanged={refresh}
                onEditMeta={(c) => {
                    setDetailsId(null);
                    setEditingMeta(c);
                }}
                onEditBuilder={(c) => {
                    setDetailsId(null);
                    setBuilderId(c.id);
                }}
            />

            {/* Meta form — create and edit share the same modal */}
            <WholesalerCampaignEditModal
                visible={createOpen || editingMeta !== null}
                campaign={editingMeta}
                onClose={() => {
                    setCreateOpen(false);
                    setEditingMeta(null);
                }}
                onSaved={async () => {
                    const wasCreate = createOpen;
                    setCreateOpen(false);
                    setEditingMeta(null);
                    alert(
                        "Saved",
                        wasCreate
                            ? "Campaign created."
                            : "Campaign updated.",
                        undefined,
                        "success"
                    );
                    await refresh();
                }}
            />

            {/* Products / retailers / discounts — drafts only */}
            <WholesalerCampaignBuilderModal
                visible={builderId !== null}
                campaignId={builderId ?? undefined}
                onClose={() => setBuilderId(null)}
                onSaved={refresh}
            />
        </>
    );
}