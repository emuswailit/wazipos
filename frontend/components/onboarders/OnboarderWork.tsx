// components/onboarders/OnboarderWork.tsx
//
// Onboarding (onboarders only): the businesses your agent attached you to, and
// — on the days the agent set — adding their opening stock. Retailers get
// retailer receipts, wholesalers wholesaler receipts, restaurants and hotels
// their supplies (food, cleaning, utilities, packaging) and bar drinks.
// Create-only: you can see what you entered but not change it; ask the
// business to correct a line.
// Backend: authentication/onboarders.py (re-checks the dates on every request).

import onboardersApi, { type OnboarderAssignment, type OnboarderReceipt, type ReceiptKind, type SupplyCategory } from '@/api/onboardersApi';
import { SwitchField } from '@/components/common/SwitchField';
import { AdminFormSheet, ChoiceChips, formatDate, FormRow, FormSection, SheetButton, useListTokens } from '@/components/admin/kit';
import { formatKES } from '@/components/admin/subscriptionPayments/subscriptionPaymentsConfig';
import { useAlert } from '@/components/common/AlertProvider';
import { CustomTextField } from '@/components/common/CustomTextField';
import { DateField } from '@/components/common/DateField';
import LiveSearchAutocompletePicker from '@/components/common/LiveSearchAutocompletePicker';
import { useAuth } from '@/context/AuthContext';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { Formik } from 'formik';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import * as Yup from 'yup';
import { errorText } from '@/utils/apiFeedback';

const ok = (res: any) => res?.ok && String(res.data?.response_code) === '0';
const newDraftId = () => `ob-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

const UNITS: Record<'RETAILER' | 'WHOLESALER', string[]> = {
    RETAILER: ['Piece', 'Pack', 'Kilogram', 'Gram', 'Litre', 'Millilitre'],
    WHOLESALER: ['Pack', 'Piece', 'Box', 'Carton', 'Strip', 'Bottle', 'Tube', 'Sachet'],
};

const SUPPLY_CATEGORIES: { value: SupplyCategory; label: string; icon: any }[] = [
    { value: 'FOOD', label: 'Food & ingredients', icon: 'nutrition-outline' },
    { value: 'CLEANING', label: 'Cleaning', icon: 'sparkles-outline' },
    { value: 'UTILITY', label: 'Utilities (gas, charcoal…)', icon: 'flame-outline' },
    { value: 'PACKAGING', label: 'Packaging', icon: 'cube-outline' },
    { value: 'OTHER', label: 'Other', icon: 'ellipsis-horizontal' },
];
const CATEGORY_LABEL: Record<string, string> = { ...Object.fromEntries(SUPPLY_CATEGORIES.map((c) => [c.value, c.label])), BAR: 'Bar' };

const KIND_LABEL: Record<ReceiptKind, string> = {
    RETAILER: 'Shop stock',
    WHOLESALER: 'Wholesaler stock',
    RESTAURANT: 'Supplies, utilities & bar',
};

function windowLabel(a: OnboarderAssignment): { text: string; color: string } {
    if (a.stock_take_status === 'DONE') return { text: 'Stock take done', color: '#64748b' };
    if (a.access_open) return { text: 'Open today', color: '#10b981' };
    const today = new Date().toISOString().slice(0, 10);
    if (a.access_from && today < a.access_from) return { text: `Opens ${formatDate(a.access_from)}`, color: '#f59e0b' };
    return { text: 'Access ended', color: '#f43f5e' };
}

export default function OnboarderWork() {
    const { theme, border, chipBg, cardShadow } = useListTokens();
    const [assignments, setAssignments] = useState<OnboarderAssignment[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [refreshing, setRefreshing] = useState(false);
    const [selected, setSelected] = useState<string | null>(null);

    const load = useCallback(async () => {
        setRefreshing(true);
        try {
            const res: any = await onboardersApi.getAssignments();
            if (ok(res)) {
                const rows: OnboarderAssignment[] = res.data.assignments ?? [];
                setAssignments(rows);
                setError(null);
                setSelected((cur) => cur ?? rows.find((r) => r.access_open)?.entity ?? null);
            } else setError(errorText(res, 'Could not load your businesses.'));
        } catch (e: any) {
            setError(e?.message || 'Could not reach the server.');
        } finally {
            setRefreshing(false);
        }
    }, []);

    useFocusEffect(
        useCallback(() => {
            void load();
        }, [load]),
    );

    const current = assignments?.find((a) => a.entity === selected) ?? null;

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: theme.background }}
            contentContainerStyle={{ padding: 16, gap: 14, maxWidth: 960, width: '100%', alignSelf: 'center' }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} tintColor={theme.primary} />}
        >
            <View style={{ gap: 2 }}>
                <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 24 }}>Onboarding</Text>
                <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 13 }}>
                    Add the opening stock of the businesses your agent sends you to, on the days they set.
                </Text>
            </View>

            {assignments === null && !error ? <ActivityIndicator color={theme.primary} style={{ marginTop: 24 }} /> : null}
            {error ? <Text style={{ color: '#f43f5e', fontFamily: theme.font.medium }}>{error}</Text> : null}
            {assignments && assignments.length === 0 ? (
                <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, textAlign: 'center', marginTop: 24 }}>
                    Your agent hasn't attached you to a business yet.
                </Text>
            ) : null}

            <View className="flex-row flex-wrap" style={{ gap: 10 }}>
                {(assignments ?? []).map((a) => {
                    const w = windowLabel(a);
                    const active = a.entity === selected;
                    return (
                        <Pressable
                            key={a.entity}
                            onPress={() => setSelected(a.entity)}
                            style={{ flexGrow: 1, flexBasis: 260, padding: 14, gap: 6, borderRadius: 16, borderWidth: 1, borderColor: active ? theme.primary : border, backgroundColor: active ? `${theme.primary}0d` : theme.panel, ...cardShadow }}
                        >
                            <View className="flex-row items-center" style={{ gap: 8 }}>
                                <Ionicons name={a.receipt_kind === 'WHOLESALER' ? 'business-outline' : a.receipt_kind === 'RESTAURANT' ? (a.entity_type === 'Hotel' ? 'bed-outline' : 'restaurant-outline') : 'storefront-outline'} size={18} color={theme.primary} />
                                <Text style={{ flex: 1, color: theme.text, fontFamily: theme.font.bold, fontSize: 15 }} numberOfLines={1}>{a.entity_title}</Text>
                                <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, backgroundColor: `${w.color}1a` }}>
                                    <Text style={{ color: w.color, fontFamily: theme.font.bold, fontSize: 11 }}>{w.text}</Text>
                                </View>
                            </View>
                            <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12 }}>
                                {a.access_from ? `${formatDate(a.access_from)} – ${formatDate(a.access_to)}` : 'No dates set'}
                                {a.town ? ` · ${a.town}` : ''}
                            </Text>
                            <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12 }} numberOfLines={1}>
                                Agent: {a.agent_name || '—'}{a.agent_phone ? ` · ${a.agent_phone}` : ''}
                            </Text>
                        </Pressable>
                    );
                })}
            </View>

            {current ? <AssignmentStock key={current.entity} assignment={current} onAccessLost={load} /> : null}
            {!current && assignments?.length ? (
                <View style={{ padding: 14, borderRadius: 14, backgroundColor: chipBg }}>
                    <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 13 }}>Pick a business to see or add its stock.</Text>
                </View>
            ) : null}
        </ScrollView>
    );
}

/** One business: what you entered, and "Add stock" while access is open. */
function AssignmentStock({ assignment: a, onAccessLost }: { assignment: OnboarderAssignment; onAccessLost: () => void }) {
    const { theme, border } = useListTokens();
    const [receipts, setReceipts] = useState<OnboarderReceipt[] | null>(null);
    const [msg, setMsg] = useState<string | null>(null);
    const [adding, setAdding] = useState(false);

    const load = useCallback(async () => {
        if (!a.access_open) {
            setReceipts([]);
            return;
        }
        const res: any = await onboardersApi.getMyReceipts(a.entity);
        if (ok(res)) {
            setReceipts(res.data.receipts ?? []);
            setMsg(null);
        } else {
            setReceipts([]);
            setMsg(errorText(res, 'Could not load your entries.'));
        }
    }, [a.entity, a.access_open]);

    useEffect(() => {
        void load();
    }, [load]);

    return (
        <View style={{ gap: 10, padding: 14, borderRadius: 16, borderWidth: 1, borderColor: border, backgroundColor: theme.panel }}>
            <View className="flex-row items-center justify-between" style={{ gap: 8 }}>
                <View style={{ flex: 1 }}>
                    <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 16 }}>{a.entity_title}</Text>
                    <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12 }}>
                        {a.receipt_kind ? KIND_LABEL[a.receipt_kind] : 'Stock'} · you can add lines, not change them
                    </Text>
                </View>
                {a.access_open ? <SheetButton label="Add stock" icon="add" onPress={() => setAdding(true)} /> : null}
            </View>

            {!a.access_open ? (
                <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 13 }}>
                    {a.stock_take_status === 'DONE'
                        ? 'The stock take is done. Your access to this business has ended.'
                        : `You can add stock only from ${formatDate(a.access_from)} to ${formatDate(a.access_to)}. Ask your agent if you need more days.`}
                </Text>
            ) : null}
            {msg ? <Text style={{ color: '#f43f5e', fontFamily: theme.font.medium, fontSize: 13 }}>{msg}</Text> : null}
            {a.access_open && receipts === null ? <ActivityIndicator color={theme.primary} /> : null}
            {a.access_open && receipts && receipts.length === 0 ? (
                <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 13 }}>Nothing entered yet. Tap Add stock for each product you count.</Text>
            ) : null}
            {(receipts ?? []).map((r) => (
                <View key={r.id} className="flex-row items-center" style={{ gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: border }}>
                    <View style={{ flex: 1 }}>
                        <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 13.5 }} numberOfLines={1}>{r.product_title}</Text>
                        <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12 }} numberOfLines={1}>
                            {[
                                r.category ? CATEGORY_LABEL[r.category] ?? r.category : null,
                                r.batch ? `Batch ${r.batch}` : null,
                                r.expiry_date ? `Expires ${formatDate(r.expiry_date)}` : null,
                                r.unit_selling_price ? `Sells at ${formatKES(r.unit_selling_price)}` : `Cost ${formatKES(r.unit_buying_price)}`,
                            ]
                                .filter(Boolean)
                                .join(' · ')}
                        </Text>
                    </View>
                    <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 14 }}>
                        {r.received_unit_quantity.toLocaleString()} {r.unit_of_receipt}
                    </Text>
                </View>
            ))}

            {a.receipt_kind === 'RESTAURANT' ? (
                <RestaurantStockSheet
                    visible={adding}
                    assignment={a}
                    onClose={() => setAdding(false)}
                    onAdded={(r) => setReceipts((prev) => [r, ...(prev ?? [])])}
                    onAccessLost={() => {
                        setAdding(false);
                        onAccessLost();
                    }}
                />
            ) : a.receipt_kind ? (
                <AddStockSheet
                    visible={adding}
                    assignment={a}
                    kind={a.receipt_kind as 'RETAILER' | 'WHOLESALER'}
                    onClose={() => setAdding(false)}
                    onAdded={(r) => setReceipts((prev) => [r, ...(prev ?? [])])}
                    onAccessLost={() => {
                        setAdding(false);
                        onAccessLost();
                    }}
                />
            ) : null}
        </View>
    );
}

/** One counted product. Stays open after saving so the next line can be entered. */
function AddStockSheet({
    visible,
    assignment,
    kind,
    onClose,
    onAdded,
    onAccessLost,
}: {
    visible: boolean;
    assignment: OnboarderAssignment;
    kind: 'RETAILER' | 'WHOLESALER';
    onClose: () => void;
    onAdded: (r: OnboarderReceipt) => void;
    onAccessLost: () => void;
}) {
    const { theme, isDarkMode } = useAuth();
    const alert = useAlert();
    const [products, setProducts] = useState<{ id: string; title: string }[]>([]);
    const [searching, setSearching] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [added, setAdded] = useState(0);
    const draft = useRef(newDraftId());
    const searchSeq = useRef(0);

    useEffect(() => {
        if (visible) {
            setAdded(0);
            setError(null);
            draft.current = newDraftId();
        }
    }, [visible]);

    const onSearch = useCallback(
        async (q: string) => {
            if (q.trim().length < 2) return;
            const mine = ++searchSeq.current;
            setSearching(true);
            try {
                const res: any = await onboardersApi.searchProducts(assignment.entity, q.trim());
                if (mine !== searchSeq.current) return;
                if (ok(res)) setProducts(res.data.products ?? []);
            } finally {
                if (mine === searchSeq.current) setSearching(false);
            }
        },
        [assignment.entity],
    );

    return (
        <Formik
            key={`${visible}`}
            initialValues={{ product: '', quantity: '', unit: UNITS[kind][0], buying: '', selling: '', batch: '', expiry: '', manufactured: '' }}
            validationSchema={Yup.object({
                product: Yup.string().required('Pick the product'),
                quantity: Yup.number().typeError('Enter a number').integer('Whole units').min(1, 'At least 1').required('How many?'),
                buying: Yup.number().typeError('Enter an amount').min(0).required('Buying price'),
                selling: Yup.number().typeError('Enter an amount').min(0).required('Selling price'),
            })}
            onSubmit={async (v, helpers) => {
                setSaving(true);
                setError(null);
                try {
                    const res: any = await onboardersApi.createReceipt(assignment.entity, {
                        draft_id: draft.current,
                        product: v.product,
                        received_unit_quantity: Number(v.quantity),
                        unit_of_receipt: v.unit,
                        unit_buying_price: String(Number(v.buying)),
                        unit_selling_price: String(Number(v.selling)),
                        ...(v.batch.trim() ? { batch: v.batch.trim() } : {}),
                        ...(v.expiry ? { expiry_date: v.expiry.slice(0, 10) } : {}),
                        ...(v.manufactured ? { manufacture_date: v.manufactured.slice(0, 10) } : {}),
                    });
                    if (ok(res)) {
                        onAdded(res.data.receipt);
                        setAdded((n) => n + 1);
                        draft.current = newDraftId();
                        helpers.resetForm({ values: { ...v, product: '', quantity: '', batch: '', expiry: '', manufactured: '', buying: '', selling: '' } });
                    } else {
                        const text = errorText(res, 'Could not record the stock.');
                        if (String(res?.data?.response_message) === 'No access') {
                            alert('Access ended', text, undefined, 'danger');
                            onAccessLost();
                        } else setError(text);
                    }
                } catch (e: any) {
                    setError(e?.message || 'Could not reach the server.');
                } finally {
                    setSaving(false);
                }
            }}
        >
            {(f) => (
                <AdminFormSheet
                    visible={visible}
                    onClose={onClose}
                    title="Add stock"
                    subtitle={`${assignment.entity_title}${added ? ` · ${added} added` : ''}`}
                    icon="cube-outline"
                    submitLabel="Save & next"
                    submitIcon="checkmark"
                    submitting={saving}
                    onSubmit={() => f.handleSubmit()}
                    cancelLabel="Done"
                    error={error}
                    width={560}
                >
                    <FormSection title="Product" zIndex={20}>
                        <LiveSearchAutocompletePicker
                            name="product"
                            label="Product"
                            options={products}
                            theme={theme}
                            isDarkMode={isDarkMode}
                            loading={searching}
                            placeholder="Type the product name…"
                            loadingPlaceholder="Searching…"
                            noMatchText="No products found."
                            emptyText="Type at least 2 letters."
                            onSearch={(q) => void onSearch(q)}
                        />
                    </FormSection>
                    <FormSection title="Count">
                        <FormRow>
                            <CustomTextField name="quantity" label="Quantity" required placeholder="e.g. 24" keyboardType="number-pad" />
                        </FormRow>
                        <ChoiceChips<string>
                            label="Counted in"
                            options={UNITS[kind].map((u) => ({ value: u, label: u }))}
                            value={f.values.unit}
                            onChange={(u) => f.setFieldValue('unit', u)}
                        />
                    </FormSection>
                    <FormSection title="Prices (per unit)">
                        <FormRow>
                            <CustomTextField name="buying" label="Buying price (KES)" required keyboardType="decimal-pad" />
                            <CustomTextField name="selling" label="Selling price (KES)" required keyboardType="decimal-pad" />
                        </FormRow>
                    </FormSection>
                    <FormSection title="Batch" hint="Optional, but needed for medicines.">
                        <CustomTextField name="batch" label="Batch number" placeholder="e.g. B2311" autoCapitalize="characters" />
                        <FormRow>
                            <DateField name="manufactured" label="Manufactured" />
                            <DateField name="expiry" label="Expires" />
                        </FormRow>
                    </FormSection>
                </AdminFormSheet>
            )}
        </Formik>
    );
}

/**
 * Restaurants / hotels: a supply line (food, cleaning, utilities, packaging…) or
 * a NEW bar drink with its opening bottles. Stays open for the next line.
 */
function RestaurantStockSheet({
    visible,
    assignment,
    onClose,
    onAdded,
    onAccessLost,
}: {
    visible: boolean;
    assignment: OnboarderAssignment;
    onClose: () => void;
    onAdded: (r: OnboarderReceipt) => void;
    onAccessLost: () => void;
}) {
    const { theme, isDarkMode } = useAuth();
    const alert = useAlert();
    const [products, setProducts] = useState<{ id: string; title: string }[]>([]);
    const [searching, setSearching] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [added, setAdded] = useState(0);
    const draft = useRef(newDraftId());
    const searchSeq = useRef(0);

    useEffect(() => {
        if (visible) {
            setAdded(0);
            setError(null);
            draft.current = newDraftId();
        }
    }, [visible]);

    const onSearch = useCallback(
        async (q: string) => {
            if (q.trim().length < 2) return;
            const mine = ++searchSeq.current;
            setSearching(true);
            try {
                const res: any = await onboardersApi.searchProducts(assignment.entity, q.trim());
                if (mine !== searchSeq.current) return;
                if (ok(res)) setProducts((res.data.products ?? []).map((p: any) => ({ id: String(p.id), title: String(p.title) })));
            } finally {
                if (mine === searchSeq.current) setSearching(false);
            }
        },
        [assignment.entity],
    );

    const blank = {
        target: 'SUPPLY' as 'SUPPLY' | 'DRINK',
        product: '',
        title: '',
        category: 'FOOD' as SupplyCategory,
        unit: 'kg',
        quantity: '',
        unit_cost: '',
        batch: '',
        expiry: '',
        volume_ml: '750',
        bottles: '',
        bottle_cost: '',
        bottle_price: '',
        sells_tots: false,
        tot_ml: '',
        tot_price: '',
    };
    const named = (v: any) => !!v.product || String(v.title || '').trim().length > 0;

    return (
        <Formik
            key={`${visible}`}
            initialValues={blank}
            validate={(v) => {
                const e: Record<string, string> = {};
                if (!named(v)) e.title = 'Pick the product or type its name';
                const pos = (x: string) => Number.isFinite(Number(x)) && Number(x) > 0;
                if (v.target === 'SUPPLY') {
                    if (!pos(v.quantity)) e.quantity = 'How much is there?';
                    if (!String(v.unit).trim()) e.unit = 'e.g. kg, litre, piece';
                    if (v.unit_cost !== '' && !(Number(v.unit_cost) >= 0)) e.unit_cost = 'Enter an amount';
                } else {
                    if (!pos(v.bottles)) e.bottles = 'How many bottles?';
                    if (!(Number(v.volume_ml) >= 50 && Number(v.volume_ml) <= 5000)) e.volume_ml = '50–5000 ml';
                    if (!pos(v.bottle_price)) e.bottle_price = 'Bottle price';
                    if (v.sells_tots && !(Number(v.tot_ml) >= 10)) e.tot_ml = 'Tot size in ml';
                    if (v.sells_tots && !pos(v.tot_price)) e.tot_price = 'Tot price';
                }
                return e;
            }}
            onSubmit={async (v, helpers) => {
                setSaving(true);
                setError(null);
                try {
                    const product = v.product || undefined;
                    const title = v.title.trim() || undefined;
                    const details =
                        v.target === 'SUPPLY'
                            ? {
                                target: 'SUPPLY' as const,
                                draft_id: draft.current,
                                product,
                                title,
                                category: v.category,
                                unit: v.unit.trim(),
                                quantity: Number(v.quantity),
                                unit_cost: String(Number(v.unit_cost || 0)),
                                ...(v.batch.trim() ? { batch: v.batch.trim() } : {}),
                                ...(v.expiry ? { expiry_date: v.expiry.slice(0, 10) } : {}),
                            }
                            : {
                                target: 'DRINK' as const,
                                draft_id: draft.current,
                                product,
                                title,
                                volume_ml: Number(v.volume_ml),
                                bottle_price: String(Number(v.bottle_price)),
                                bottle_cost: String(Number(v.bottle_cost || 0)),
                                sells_tots: !!v.sells_tots,
                                ...(v.sells_tots ? { tot_ml: Number(v.tot_ml), tot_price: String(Number(v.tot_price)) } : {}),
                                bottles: Number(v.bottles),
                            };
                    const res: any = await onboardersApi.createReceipt(assignment.entity, details);
                    if (ok(res)) {
                        onAdded(res.data.receipt);
                        setAdded((n) => n + 1);
                        draft.current = newDraftId();
                        helpers.resetForm({ values: { ...blank, target: v.target, category: v.category, unit: v.unit } });
                    } else {
                        const text = errorText(res, 'Could not record the stock.');
                        if (String(res?.data?.response_message) === 'No access') {
                            alert('Access ended', text, undefined, 'danger');
                            onAccessLost();
                        } else setError(text);
                    }
                } catch (e: any) {
                    setError(e?.message || 'Could not reach the server.');
                } finally {
                    setSaving(false);
                }
            }}
        >
            {(f) => {
                const v = f.values;
                return (
                    <AdminFormSheet
                        visible={visible}
                        onClose={onClose}
                        title="Add stock"
                        subtitle={`${assignment.entity_title}${added ? ` · ${added} added` : ''}`}
                        icon="cube-outline"
                        submitLabel="Save & next"
                        submitIcon="checkmark"
                        submitting={saving}
                        onSubmit={() => f.handleSubmit()}
                        cancelLabel="Done"
                        error={error}
                        width={580}
                    >
                        <FormSection title="What are you counting?">
                            <ChoiceChips<'SUPPLY' | 'DRINK'>
                                options={[
                                    { value: 'SUPPLY', label: 'Supplies & utilities', icon: 'basket-outline' },
                                    { value: 'DRINK', label: 'Bar drinks', icon: 'wine-outline' },
                                ]}
                                value={v.target}
                                onChange={(x) => {
                                    f.setFieldValue('target', x);
                                    if (x === 'SUPPLY' && !v.unit) f.setFieldValue('unit', 'kg');
                                }}
                            />
                            {v.target === 'SUPPLY' ? (
                                <ChoiceChips<SupplyCategory>
                                    label="Category"
                                    options={SUPPLY_CATEGORIES}
                                    value={v.category}
                                    onChange={(x) => f.setFieldValue('category', x)}
                                />
                            ) : (
                                <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12 }}>
                                    Adds a new drink to the bar with its prices and the bottles on the shelf.
                                </Text>
                            )}
                        </FormSection>

                        <FormSection title="Item" hint="Pick it from the catalogue, or type its name if it isn't there." zIndex={20}>
                            <LiveSearchAutocompletePicker
                                name="product"
                                label="From the catalogue"
                                options={products}
                                theme={theme}
                                isDarkMode={isDarkMode}
                                loading={searching}
                                placeholder="Type to search…"
                                loadingPlaceholder="Searching…"
                                noMatchText="Not in the catalogue — type the name below."
                                emptyText="Type at least 2 letters."
                                onSearch={(q) => void onSearch(q)}
                            />
                            <CustomTextField name="title" label="Or its name" placeholder={v.target === 'DRINK' ? 'e.g. Tusker 500ml' : 'e.g. Cooking gas 13kg'} />
                        </FormSection>

                        {v.target === 'SUPPLY' ? (
                            <>
                                <FormSection title="Count">
                                    <FormRow>
                                        <CustomTextField name="quantity" label="Quantity" required placeholder="e.g. 25" keyboardType="decimal-pad" />
                                        <CustomTextField name="unit" label="Unit" required placeholder="kg, litre, piece, cylinder" />
                                        <CustomTextField name="unit_cost" label="Cost per unit (KES)" placeholder="e.g. 120" keyboardType="decimal-pad" />
                                    </FormRow>
                                </FormSection>
                                <FormSection title="Batch" hint="Optional.">
                                    <FormRow>
                                        <CustomTextField name="batch" label="Batch number" autoCapitalize="characters" />
                                        <DateField name="expiry" label="Expires" />
                                    </FormRow>
                                </FormSection>
                            </>
                        ) : (
                            <>
                                <FormSection title="Bottles">
                                    <FormRow>
                                        <CustomTextField name="bottles" label="Bottles on the shelf" required placeholder="e.g. 12 (1.5 = one open)" keyboardType="decimal-pad" />
                                        <CustomTextField name="volume_ml" label="Bottle size (ml)" required keyboardType="number-pad" />
                                    </FormRow>
                                    <FormRow>
                                        <CustomTextField name="bottle_cost" label="Cost per bottle (KES)" keyboardType="decimal-pad" />
                                        <CustomTextField name="bottle_price" label="Bottle price (KES)" required keyboardType="decimal-pad" />
                                    </FormRow>
                                </FormSection>
                                <FormSection title="Tots" hint="Spirits sold by the tot.">
                                    <SwitchField name="sells_tots" label="Sold by the tot too" />
                                    {v.sells_tots ? (
                                        <FormRow>
                                            <CustomTextField name="tot_ml" label="Tot size (ml)" required placeholder="e.g. 25" keyboardType="number-pad" />
                                            <CustomTextField name="tot_price" label="Tot price (KES)" required keyboardType="decimal-pad" />
                                        </FormRow>
                                    ) : null}
                                </FormSection>
                            </>
                        )}
                    </AdminFormSheet>
                );
            }}
        </Formik>
    );
}
