// components/restaurants/owner/RestaurantRecipeRequests.tsx
//
// Customers' custom dishes waiting for a price. The kitchen reads the
// ingredients + instructions and sends a price and time (or declines). When
// the customer accepts, it lands on the Orders & bookings board.

import diningApi, { errorText, isOk, RECIPE_STATUS_META, SERVICE_META, type CustomRecipe } from '@/api/diningApi';
import { AdminListView, AdminSheet, FormRow, SheetButton, useListTokens, type AdminListConfig } from '@/components/common/listScreen';
import { CustomTextField } from '@/components/common/CustomTextField';
import type { PageSize } from '@/components/common/PaginationBar';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { Text, useWindowDimensions, View } from 'react-native';

import { kes, when } from '../shared';

type Filter = 'OPEN' | 'REQUESTED' | 'QUOTED' | 'DONE';

const config: AdminListConfig<CustomRecipe> = {
    title: 'Custom dish requests',
    noun: ['request', 'requests'],
    icon: 'color-wand-outline',
    searchPlaceholder: 'Search dish or customer…',
    emptyTitle: 'No custom requests',
    emptyMessage: 'When customers design their own dish, it shows here for you to price.',
    keyOf: (r) => r.id,
    titleOf: (r) => `${r.title} × ${r.servings}`,
    subtitleOf: (r) => [r.customer_name, SERVICE_META[r.service_type]?.label, r.reservation_at ? when(r.reservation_at) : null].filter(Boolean).join(' · '),
    avatarOf: () => ({ icon: 'color-wand-outline' }),
    badgesOf: (r) => [{ label: RECIPE_STATUS_META[r.status].label, tone: RECIPE_STATUS_META[r.status].tone }],
    metaOf: (r) => when(r.created),
    metaIcon: 'time-outline',
    metricOf: (r) => ({ value: r.quoted_price ? kes(r.quoted_price) : `~${kes(r.estimate)}`, label: r.quoted_price ? 'quoted' : 'estimate' }),
    primaryColumn: { label: 'Dish', flex: 2 },
    columns: [
        { key: 'cust', label: 'Customer', flex: 1.4, render: (r) => r.customer_name || '—' },
        { key: 'svc', label: 'Service', flex: 1.2, render: (r) => SERVICE_META[r.service_type]?.label ?? r.service_type },
        { key: 'ing', label: 'Ingredients', flex: 2.2, render: (r) => r.ingredients.map((i) => i.name).join(', ') },
        { key: 'status', label: 'Status', flex: 1.4, render: (r) => RECIPE_STATUS_META[r.status].label },
    ],
};

export default function RestaurantRecipeRequests() {
    const { width } = useWindowDimensions();
    const [open, setOpen] = useState<CustomRecipe[]>([]);
    const [done, setDone] = useState<CustomRecipe[]>([]);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [query, setQuery] = useState('');
    const [filter, setFilter] = useState<Filter>('OPEN');
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState<PageSize>(25);
    const [selected, setSelected] = useState<CustomRecipe | null>(null);

    const load = useCallback(async () => {
        setRefreshing(true);
        try {
            const [a, b]: any[] = await Promise.all([diningApi.recipeRequests('open'), diningApi.recipeRequests('done')]);
            if (isOk(a)) {
                setOpen(a.data.recipes ?? []);
                setError(null);
            } else setError(errorText(a, 'Could not load requests.'));
            if (isOk(b)) setDone(b.data.recipes ?? []);
        } catch (e: any) {
            setError(e?.message || 'Could not reach the server.');
        } finally {
            setRefreshing(false);
        }
    }, []);
    useFocusEffect(
        useCallback(() => {
            void load();
            const t = setInterval(load, 30000);
            return () => clearInterval(t);
        }, [load]),
    );

    const base = filter === 'DONE' ? done : filter === 'OPEN' ? open : open.filter((r) => r.status === filter);
    const q = query.trim().toLowerCase();
    const filtered = q ? base.filter((r) => `${r.title} ${r.customer_name ?? ''}`.toLowerCase().includes(q)) : base;
    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
    useEffect(() => setPage(1), [query, filter, pageSize]);
    const start = (page - 1) * pageSize;
    const end = Math.min(start + pageSize, filtered.length);

    return (
        <>
            <AdminListView<CustomRecipe, Filter>
                variant={width >= 900 ? 'web' : 'mobile'}
                config={config}
                query={query}
                setQuery={setQuery}
                onRefresh={load}
                refreshing={refreshing}
                error={error}
                items={filtered.slice(start, end)}
                allItems={filtered}
                onPressItem={setSelected}
                stats={[
                    { label: 'To price', value: String(open.filter((r) => r.status === 'REQUESTED').length), color: '#3b82f6' },
                    { label: 'Waiting for customer', value: String(open.filter((r) => r.status === 'QUOTED').length) },
                ]}
                filters={{
                    options: [
                        { key: 'OPEN', label: 'Open', icon: 'apps-outline', count: open.length },
                        { key: 'REQUESTED', label: 'To price', icon: 'pricetag-outline', count: open.filter((r) => r.status === 'REQUESTED').length },
                        { key: 'QUOTED', label: 'Priced', icon: 'hourglass-outline', count: open.filter((r) => r.status === 'QUOTED').length },
                        { key: 'DONE', label: 'Closed', icon: 'archive-outline', count: done.length },
                    ],
                    value: filter,
                    onChange: setFilter,
                    allKey: 'OPEN',
                }}
                page={page}
                pageSize={pageSize}
                totalItems={filtered.length}
                totalPages={totalPages}
                pageStart={start}
                pageEnd={end}
                onPrev={() => setPage((p) => Math.max(1, p - 1))}
                onNext={() => setPage((p) => Math.min(totalPages, p + 1))}
                onPageSizeChange={(s) => {
                    setPageSize(s);
                    setPage(1);
                }}
            />
            {selected ? <QuoteSheet recipe={selected} onClose={() => setSelected(null)} onDone={() => { setSelected(null); void load(); }} /> : null}
        </>
    );
}

function QuoteSheet({ recipe: r, onClose, onDone }: { recipe: CustomRecipe; onClose: () => void; onDone: () => void }) {
    const { theme, border } = useListTokens();
    const [price, setPrice] = useState(r.quoted_price ? String(Number(r.quoted_price)) : Number(r.estimate) > 0 ? String(Number(r.estimate)) : '');
    const [minutes, setMinutes] = useState(r.ready_in_minutes ? String(r.ready_in_minutes) : '');
    const [note, setNote] = useState(r.restaurant_note ?? '');
    const [busy, setBusy] = useState<'quote' | 'decline' | null>(null);
    const [error, setError] = useState<string | null>(null);
    const editable = ['REQUESTED', 'QUOTED'].includes(r.status);

    const run = async (kind: 'quote' | 'decline') => {
        setBusy(kind);
        setError(null);
        try {
            const res: any = kind === 'quote' ? await diningApi.quoteRecipe(r.id, price, minutes, note) : await diningApi.declineRecipe(r.id, note);
            if (isOk(res)) onDone();
            else setError(errorText(res, 'That did not work.'));
        } catch (e: any) {
            setError(e?.message || 'Could not reach the server.');
        } finally {
            setBusy(null);
        }
    };

    return (
        <AdminSheet visible onClose={onClose} title={`${r.title} × ${r.servings}`} subtitle={`${r.customer_name ?? 'Customer'} · ${SERVICE_META[r.service_type]?.label}`} icon="color-wand-outline" width={600}>
            <View style={{ gap: 14 }}>
                {r.service_type === 'DINE_IN' ? (
                    <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 13.5 }}>Table for {r.party_size} · {when(r.reservation_at)}</Text>
                ) : null}
                <View className="rounded-2xl p-3" style={{ borderWidth: 1, borderColor: border, gap: 6 }}>
                    <Text style={{ color: theme.textDark, fontFamily: theme.font.bold, fontSize: 11, letterSpacing: 0.5 }}>INGREDIENTS</Text>
                    {r.ingredients.map((i, k) => (
                        <Text key={k} style={{ color: theme.text, fontFamily: theme.font.medium, fontSize: 13.5 }}>
                            • {i.name} — {i.portions} portion{i.portions === 1 ? '' : 's'} per serving{i.from_list ? '' : '  (customer added)'}
                        </Text>
                    ))}
                    <Text style={{ color: theme.textDark, fontFamily: theme.font.bold, fontSize: 11, letterSpacing: 0.5, marginTop: 6 }}>INSTRUCTIONS</Text>
                    <Text style={{ color: theme.text, fontFamily: theme.font.medium, fontSize: 13.5, lineHeight: 19 }}>{r.instructions}</Text>
                </View>
                {r.customer_phone ? <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12.5 }}>Phone {r.customer_phone} · estimate from your ingredient prices {kes(r.estimate)}</Text> : null}
                {editable ? (
                    <View style={{ gap: 10 }}>
                        <FormRow>
                            <CustomTextField label={`Price for ${r.servings} serving${r.servings === 1 ? '' : 's'} (KES)`} value={price} onChangeText={setPrice} keyboardType="decimal-pad" />
                            <CustomTextField label="Ready in (minutes)" value={minutes} onChangeText={(t) => setMinutes(t.replace(/[^0-9]/g, ''))} keyboardType="number-pad" placeholder="Optional" />
                        </FormRow>
                        <CustomTextField label="Note to the customer" value={note} onChangeText={setNote} placeholder="e.g. We'll use kienyeji chicken; or why you can't make it" multiline />
                        {error ? <Text style={{ color: '#f43f5e', fontFamily: theme.font.medium, fontSize: 12.5 }}>{error}</Text> : null}
                        <View className="flex-row flex-wrap" style={{ gap: 8 }}>
                            <SheetButton label={r.status === 'QUOTED' ? 'Update price' : 'Send price'} icon="pricetag-outline" loading={busy === 'quote'} loadingLabel="Sending…" disabled={!(Number(price) > 0)} onPress={() => void run('quote')} />
                            <SheetButton label="Can't make it" icon="close-circle-outline" variant="danger" loading={busy === 'decline'} loadingLabel="Declining…" onPress={() => void run('decline')} />
                        </View>
                    </View>
                ) : (
                    <Text style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 13 }}>
                        {RECIPE_STATUS_META[r.status].label}
                        {r.quoted_price ? ` · ${kes(r.quoted_price)}` : ''}
                        {r.status === 'ACCEPTED' ? ' — it is on your Orders & bookings board.' : ''}
                    </Text>
                )}
            </View>
        </AdminSheet>
    );
}
