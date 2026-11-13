// components/retailers/retailerIndents/RetailerIndentEditModal.tsx
//
// Edit sheet for retailer indent parameters: lead time, order days,
// pricing %, budget amount and budget enforcement. (The params endpoint
// does not accept is_open; an indent is closed by submitting it.)
//
// Behaviour
//   - Optimistic: values are written into local state the moment Save
//     is tapped, so the row on the list updates instantly.
//   - HTTP: `retailerIndentParamsUpdateAction` is called with the new
//     values. On success the server's `params` payload reconciles the
//     local row.
//   - On failure the previous values are restored and an inline error
//     banner shows the server's response_message / errors.
//
// Offline-queueable parameter edits (an INDENT_UPDATE op kind) is a
// follow-up — for now a failed save simply reverts.

import retailersApi from '@/api/retailersApi';
import { CustomTextField } from '@/components/common/CustomTextField';
import { AdminFormSheet, ChoiceChips, FormRow, FormSection, type ChoiceOption } from '@/components/common/listScreen';
import { useRetailerIndentsSync } from '@/context/RetailerIndentsSyncContext';
import { RetailerIndent } from '@/databases/types';
import React, { useEffect, useState } from 'react';
import { isServerOk } from '@/utils/serverResponse';

/* =========================================================
 * Helpers
 * ======================================================= */

const toBool = (v: any): boolean =>
    v === true || v === 'true' || v === 1 || v === '1';

function extractServerMessage(payload: any): string {
    if (!payload) return '';
    const flat =
        payload.response_message ??
        payload.message ??
        payload.detail;
    return typeof flat === 'string' ? flat.trim() : '';
}

function extractServerErrors(payload: any): string[] {
    if (!payload?.errors) return [];
    const raw = payload.errors;
    if (Array.isArray(raw)) {
        return raw
            .map((e: any) =>
                typeof e === 'string'
                    ? e
                    : JSON.stringify(e),
            )
            .filter(Boolean);
    }
    if (typeof raw === 'object') {
        const out: string[] = [];
        for (const [key, val] of Object.entries(raw)) {
            if (Array.isArray(val)) {
                for (const msg of val) {
                    out.push(`${key}: ${String(msg)}`);
                }
            } else {
                out.push(`${key}: ${String(val)}`);
            }
        }
        return out;
    }
    return [String(raw)];
}

/* =========================================================
 * Component
 * ======================================================= */

function RetailerIndentEditModal({
    indent,
    onClose,
    onSaved,
}: {
    indent: RetailerIndent | null;
    onClose: () => void;
    onSaved: () => void;
}) {
    const { patchIndentLocally } = useRetailerIndentsSync();

    const [leadTime, setLeadTime] = useState('0');
    const [orderDays, setOrderDays] = useState('0');
    const [pricingPct, setPricingPct] = useState('0');
    const [budgetEnforced, setBudgetEnforced] =
        useState('false');
    const [budgetAmount, setBudgetAmount] = useState('');
    const [saving, setSaving] = useState(false);
    const [errorText, setErrorText] = useState<string | null>(
        null,
    );

    useEffect(() => {
        if (!indent) return;
        setLeadTime(String(indent.lead_time ?? 0));
        setOrderDays(String(indent.order_days ?? 0));
        setPricingPct(
            String(indent.pricing_percentage ?? '0'),
        );
        setBudgetEnforced(
            toBool(indent.budget_enforced)
                ? 'true'
                : 'false',
        );
        setBudgetAmount(
            indent.budget_amount
                ? String(indent.budget_amount)
                : '',
        );
        setSaving(false);
        setErrorText(null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [indent?.remote_id]);

    if (!indent) return null;

    /* ── Save ─────────────────────────────────────────────── */

    const handleSave = async () => {
        if (saving) return;

        /* Snapshot the current local values so we can roll back if
         * the server rejects the change. */
        const previous: Partial<RetailerIndent> = {
            is_open: indent.is_open,
            lead_time: indent.lead_time,
            order_days: indent.order_days,
            pricing_percentage: indent.pricing_percentage,
            budget_amount: indent.budget_amount,
            budget_enforced: indent.budget_enforced,
        };

        /* New values, typed for the wire payload. */
        const nextParams = {
            order_days: Number(orderDays) || 0,
            lead_time: Number(leadTime) || 0,
            budget_amount: budgetAmount
                ? Number(budgetAmount)
                : null,
            budget_enforced: budgetEnforced,
            pricing_percentage: Number(pricingPct) || 0,
        };

        /* Optimistic local write — the list row flips immediately. */
        patchIndentLocally(indent.remote_id, {
            lead_time: nextParams.lead_time,
            order_days: nextParams.order_days,
            pricing_percentage: String(
                nextParams.pricing_percentage,
            ),
            budget_amount:
                nextParams.budget_amount === null
                    ? null
                    : String(nextParams.budget_amount),
            budget_enforced: nextParams.budget_enforced,
        });

        setSaving(true);
        setErrorText(null);

        let res: any = null;
        try {
            res =
                await retailersApi.retailerIndentParamsUpdateAction(
                    {
                        indent_id: indent.remote_id,
                        ...nextParams,
                    },
                );
        } catch (e: any) {
            res = {
                ok: false,
                problem: 'exception',
                data: {
                    detail: e?.message || 'Request threw',
                },
            };
        }

        const payload = res?.data ?? res;

        const isOk = isServerOk(res, payload);

        if (!isOk) {
            /* Roll back the optimistic write. */
            patchIndentLocally(indent.remote_id, previous);

            const serverMessage =
                extractServerMessage(payload);
            const serverErrors =
                extractServerErrors(payload);

            const parts: string[] = [];
            if (serverMessage) parts.push(serverMessage);
            if (serverErrors.length > 0) {
                parts.push(serverErrors.join('\n'));
            }
            if (parts.length === 0) {
                parts.push(
                    res?.problem
                        ? `Update failed (${res.problem}).`
                        : 'Update failed.',
                );
            }

            setErrorText(parts.join('\n\n'));
            setSaving(false);
            return;
        }

        /* Success — reconcile with the server's canonical params if
         * the response included them. Otherwise our optimistic write
         * already matches what the server accepted. */
        const params = payload?.params ?? {};
        const applied: Partial<RetailerIndent> = {};

        if (params.order_days !== undefined) {
            applied.order_days = Number(params.order_days);
        }
        if (params.lead_time !== undefined) {
            applied.lead_time = Number(params.lead_time);
        }
        if (params.budget_amount !== undefined) {
            applied.budget_amount = params.budget_amount;
        }
        if (params.budget_enforced !== undefined) {
            applied.budget_enforced = String(
                params.budget_enforced,
            );
        }
        if (params.pricing_percentage !== undefined) {
            applied.pricing_percentage = String(
                params.pricing_percentage,
            );
        }
        if (params.is_open !== undefined) {
            applied.is_open = String(params.is_open);
        }

        if (Object.keys(applied).length > 0) {
            patchIndentLocally(indent.remote_id, applied);
        }

        setSaving(false);
        onSaved();
    };

    const busy = saving;
    const budgetOn = budgetEnforced === 'true';

    return (
        <AdminFormSheet
            visible={!!indent}
            onClose={busy ? () => { } : onClose}
            title="Edit indent"
            subtitle={[indent.indent_number, indent.entity_title].filter(Boolean).join(' · ') || null}
            icon="options-outline"
            submitLabel="Save changes"
            submitting={saving}
            onSubmit={handleSave}
            error={errorText}
            width={600}
        >
            <FormSection title="Planning" hint="Used to work out how much of each item the indent should cover.">
                <FormRow>
                    <CustomTextField
                        label="Lead time (days)"
                        value={leadTime}
                        onChangeText={(t) => setLeadTime(t.replace(/[^0-9]/g, ''))}
                        keyboardType="number-pad"
                        placeholder="0"
                        hint="How long wholesalers take to deliver."
                        editable={!busy}
                    />
                    <CustomTextField
                        label="Order days"
                        value={orderDays}
                        onChangeText={(t) => setOrderDays(t.replace(/[^0-9]/g, ''))}
                        keyboardType="number-pad"
                        placeholder="0"
                        hint="Days of stock each order should cover."
                        editable={!busy}
                    />
                </FormRow>
                <CustomTextField
                    label="Pricing %"
                    value={pricingPct}
                    onChangeText={(t) => setPricingPct(t.replace(/[^0-9.]/g, ''))}
                    keyboardType="decimal-pad"
                    placeholder="0"
                    hint="Markup applied when working out profit."
                    editable={!busy}
                />
            </FormSection>

            <FormSection title="Budget">
                <CustomTextField
                    label="Budget amount (KES)"
                    value={budgetAmount}
                    onChangeText={(t) => setBudgetAmount(t.replace(/[^0-9.]/g, ''))}
                    keyboardType="decimal-pad"
                    placeholder="No budget"
                    hint="Leave empty for no budget."
                    editable={!busy}
                />
                <ChoiceChips
                    label="When over budget"
                    options={BUDGET_OPTIONS}
                    value={budgetOn ? 'true' : 'false'}
                    onChange={setBudgetEnforced}
                    disabled={busy || !budgetAmount}
                    hint={!budgetAmount ? 'Set a budget amount first.' : budgetOn ? 'Items that would go over the budget are blocked.' : 'You are warned but can still add items.'}
                />
            </FormSection>
        </AdminFormSheet>
    );
}

const BUDGET_OPTIONS: ChoiceOption<'true' | 'false'>[] = [
    { value: 'false', label: 'Warn only', icon: 'alert-circle-outline' },
    { value: 'true', label: 'Block items', icon: 'hand-left-outline', color: '#f43f5e' },
];

export default RetailerIndentEditModal;
