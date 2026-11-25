// components/church/admin/ChurchSchedule.tsx
//
// Church admin → Programme & events:
//   Weekly programme   what happens every week (services, fellowships, choir practice)
//   Events             dated: conferences, weddings, funerals, retreats, special services
// Both appear on the church page ("This week"). Group leaders add their group's items.

import type { Audience, ChurchEvent, Group, ScheduleItem } from '@/api/churchesApi';
import { useAlert } from '@/components/common/AlertProvider';
import { CustomTextField } from '@/components/common/CustomTextField';
import { DateField } from '@/components/common/DateField';
import { AdminFormSheet, ChoiceChips, FormRow, FormSection } from '@/components/common/listScreen';
import { SelectDropdown } from '@/components/common/SelectDropdown';
import { InlineNotice, PosHeader, Segmented, SoftButton } from '@/components/ui/pos';
import { useAuth } from '@/context/AuthContext';
import { useCachedList } from '@/hooks/useCachedList';
import { isServerOk } from '@/utils/serverResponse';
import { CalendarDays, Pencil, Plus, Trash2 } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from 'react-native';

import { ChurchAdminGate, ChurchSwitcher, EmptyNote, EventCard, joinDateTime, runWrite, ScheduleList, toLocalInput, useChurchAdmin, type ChurchAdminState } from '../churchShared';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((label, i) => ({ value: String(i), label }));
const isTime = (t: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t);

export default function ChurchSchedule() {
    const state = useChurchAdmin();
    return <ChurchAdminGate state={state}>{(home) => <Body state={state} canPost={home.can.post} isLeader={home.office === 'GROUP_LEADER'} />}</ChurchAdminGate>;
}

function useGroupOptions(state: ChurchAdminState, isLeader: boolean) {
    const [groups, setGroups] = useState<{ value: string; label: string }[]>([]);
    useEffect(() => {
        if (!state.church) return;
        state.api('Groups').then((res: any) => {
            if (isServerOk(res)) setGroups([...(isLeader ? [] : [{ value: '', label: 'Whole church' }]), ...res.data.result.groups.map((g: Group) => ({ value: g.id, label: g.name }))]);
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [state.church]);
    return groups;
}

function Body({ state, canPost, isLeader }: { state: ChurchAdminState; canPost: boolean; isLeader: boolean }) {
    const { theme } = useAuth();
    const alert = useAlert();
    const [tab, setTab] = useState<'week' | 'events' | 'past'>('week');
    const [editItem, setEditItem] = useState<ScheduleItem | 'new' | null>(null);
    const [editEvent, setEditEvent] = useState<ChurchEvent | 'new' | null>(null);
    const groups = useGroupOptions(state, isLeader);

    const week = useCachedList<ScheduleItem>({ key: `church_week:${state.church}`, fetch: () => state.api('Schedule', { show: 'ALL' }) as any, pick: (d) => d?.result?.schedule, enabled: !!state.church });
    const events = useCachedList<ChurchEvent>({ key: `church_events:${state.church}:${tab}`, fetch: () => state.api('Events', { when: tab === 'past' ? 'PAST' : 'UPCOMING' }) as any, pick: (d) => d?.result?.events, enabled: !!state.church && tab !== 'week' });
    const list = tab === 'week' ? week : events;

    const removeEvent = (e: ChurchEvent) =>
        alert('Remove this event?', `${e.title}. To keep it visible as cancelled, edit it and mark it cancelled instead.`, [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Remove',
                style: 'destructive',
                onPress: async () => {
                    const { data } = await runWrite(state.api('DeleteEvent', { event_id: e.id }), 'result', 'Event removed');
                    if (data) events.patch((rows) => rows.filter((r) => r.id !== e.id));
                },
            },
        ]);

    return (
        <View style={{ flex: 1 }}>
            <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, maxWidth: 860, width: '100%', alignSelf: 'center', gap: 10 }} refreshControl={<RefreshControl refreshing={list.refreshing} onRefresh={() => void list.refresh()} tintColor={theme.primary} />}>
                <ChurchSwitcher state={state} />
                <PosHeader
                    icon={CalendarDays}
                    title="Programme & events"
                    subtitle="Shown on the church page under This week"
                    right={canPost ? <SoftButton label={tab === 'week' ? 'Add to programme' : 'New event'} icon={Plus} tone="navy" onPress={() => (tab === 'week' ? setEditItem('new') : setEditEvent('new'))} /> : null}
                />
                <Segmented<'week' | 'events' | 'past'>
                    options={[
                        ['week', 'Weekly programme'],
                        ['events', 'Upcoming events'],
                        ['past', 'Past events'],
                    ]}
                    value={tab}
                    onChange={setTab}
                />
                {list.error ? <InlineNotice tone="warning" message={list.error} /> : null}
                {list.loading && !list.items.length ? <ActivityIndicator color={theme.primary} style={{ marginTop: 30 }} /> : null}

                {tab === 'week' ? (
                    week.items.length ? (
                        <>
                            <ScheduleList items={week.items} onPress={canPost ? (s) => setEditItem(s) : undefined} />
                            {canPost ? <Text style={{ color: theme.textMuted, fontFamily: theme.font.regular, fontSize: 12.5 }}>Tap an item to edit or remove it. Faded items are switched off.</Text> : null}
                        </>
                    ) : !week.loading ? (
                        <EmptyNote icon={CalendarDays} title="No weekly programme yet" text="Add your services and weekly meetings: e.g. Sunday 9:00 English service, Wednesday 6:00pm Bible study." />
                    ) : null
                ) : events.items.length ? (
                    events.items.map((e) => (
                        <EventCard
                            key={e.id}
                            e={e}
                            footer={
                                canPost ? (
                                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                                        <SoftButton label="Edit" icon={Pencil} tone="neutral" onPress={() => setEditEvent(e)} />
                                        <SoftButton label="Remove" icon={Trash2} tone="danger" onPress={() => removeEvent(e)} />
                                    </View>
                                ) : undefined
                            }
                        />
                    ))
                ) : !events.loading ? (
                    <EmptyNote icon={CalendarDays} title={tab === 'past' ? 'No past events' : 'No upcoming events'} />
                ) : null}
            </ScrollView>

            <ScheduleForm
                state={state}
                groups={groups}
                visible={!!editItem}
                item={editItem && editItem !== 'new' ? editItem : null}
                onClose={() => setEditItem(null)}
                onSaved={(s, removed) => {
                    setEditItem(null);
                    week.patch((rows) => (removed ? rows.filter((r) => r.id !== s.id) : rows.some((r) => r.id === s.id) ? rows.map((r) => (r.id === s.id ? s : r)) : [...rows, s].sort((a, b) => a.day - b.day || a.starts.localeCompare(b.starts))));
                }}
            />
            <EventForm
                submit={(body) => state.api('SaveEvent', body)}
                groups={groups}
                visible={!!editEvent}
                item={editEvent && editEvent !== 'new' ? editEvent : null}
                onClose={() => setEditEvent(null)}
                onSaved={(e) => {
                    setEditEvent(null);
                    events.patch((rows) => (rows.some((r) => r.id === e.id) ? rows.map((r) => (r.id === e.id ? e : r)) : [...rows, e].sort((a, b) => a.starts_at.localeCompare(b.starts_at))));
                }}
            />
        </View>
    );
}

function ScheduleForm({ state, groups, visible, item, onClose, onSaved }: { state: ChurchAdminState; groups: { value: string; label: string }[]; visible: boolean; item: ScheduleItem | null; onClose: () => void; onSaved: (s: ScheduleItem, removed?: boolean) => void }) {
    const alert = useAlert();
    const [day, setDay] = useState('6');
    const [starts, setStarts] = useState('09:00');
    const [ends, setEnds] = useState('');
    const [title, setTitle] = useState('');
    const [venue, setVenue] = useState('');
    const [notes, setNotes] = useState('');
    const [group, setGroup] = useState('');
    const [active, setActive] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!visible) return;
        setDay(String(item?.day ?? 6));
        setStarts(item?.starts ?? '09:00');
        setEnds(item?.ends ?? '');
        setTitle(item?.title ?? '');
        setVenue(item?.venue ?? '');
        setNotes(item?.notes ?? '');
        setGroup(item?.group?.id ?? groups[0]?.value ?? '');
        setActive(item?.is_active ?? true);
        setError(null);
    }, [visible, item, groups]);

    const save = async () => {
        if (!title.trim()) return setError('Name it, e.g. English service.');
        if (!isTime(starts) || (ends && !isTime(ends))) return setError('Use 24-hour times like 09:30 or 18:00.');
        if (ends && ends <= starts) return setError('It must end after it starts.');
        setBusy(true);
        const { data, error: err } = await runWrite<ScheduleItem>(state.api('SaveScheduleItem', { item_id: item?.id, day: Number(day), starts, ends, title, venue, notes, group_id: group, is_active: active }), 'item', item ? 'Programme updated' : 'Added to the programme');
        setBusy(false);
        if (data) onSaved(data);
        else setError(err);
    };

    const remove = () =>
        alert('Remove from the programme?', item?.title, [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Remove',
                style: 'destructive',
                onPress: async () => {
                    const { data, error: err } = await runWrite(state.api('DeleteScheduleItem', { item_id: item?.id }), 'result', 'Removed');
                    if (data && item) onSaved(item, true);
                    else if (err) setError(err);
                },
            },
        ]);

    return (
        <AdminFormSheet visible={visible} onClose={onClose} title={item ? 'Edit programme item' : 'Add to the weekly programme'} icon="calendar-outline" submitLabel="Save" submitting={busy} onSubmit={() => void save()} error={error} cancelLabel={item ? 'Remove' : 'Cancel'} onCancel={item ? remove : undefined}>
            <FormSection title="Every week">
                <CustomTextField label="What" required value={title} onChangeText={setTitle} placeholder="e.g. English service, Bible study, Choir practice" />
                <SelectDropdown label="Day" options={DAYS} value={day} onChange={setDay} />
                <FormRow>
                    <CustomTextField label="Starts (24h)" value={starts} onChangeText={setStarts} placeholder="09:00" />
                    <CustomTextField label="Ends (24h)" value={ends} onChangeText={setEnds} placeholder="11:00" />
                </FormRow>
                <FormRow>
                    <CustomTextField label="Where" value={venue} onChangeText={setVenue} placeholder="Main sanctuary" />
                    <SelectDropdown label="For" options={groups} value={group} onChange={setGroup} placeholder="Whole church" />
                </FormRow>
                <CustomTextField label="Notes" value={notes} onChangeText={setNotes} placeholder="e.g. Holy Communion on the first Sunday" />
                {item ? (
                    <ChoiceChips
                        label="Status"
                        options={[
                            { value: 'on', label: 'On' },
                            { value: 'off', label: 'Paused' },
                        ]}
                        value={active ? 'on' : 'off'}
                        onChange={(v) => setActive(v === 'on')}
                    />
                ) : null}
            </FormSection>
        </AdminFormSheet>
    );
}

/** Event form (parish with its groups, or head office via a different `submit` and no groups). */
export function EventForm({ submit, groups, targets, visible, item, onClose, onSaved }: { submit: (body: Record<string, any>) => Promise<any>; groups?: { value: string; label: string }[]; targets?: { value: string; label: string }[]; visible: boolean; item: ChurchEvent | null; onClose: () => void; onSaved: (e: ChurchEvent) => void }) {
    const [target, setTarget] = useState('');
    const [title, setTitle] = useState('');
    const [date, setDate] = useState('');
    const [start, setStart] = useState('10:00');
    const [end, setEnd] = useState('');
    const [venue, setVenue] = useState('');
    const [leader, setLeader] = useState('');
    const [description, setDescription] = useState('');
    const [audience, setAudience] = useState<Audience>('PUBLIC');
    const [group, setGroup] = useState('');
    const [cancelled, setCancelled] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!visible) return;
        const s = toLocalInput(item?.starts_at);
        const e = toLocalInput(item?.ends_at);
        setTitle(item?.title ?? '');
        setDate(s.slice(0, 10));
        setStart(s.slice(11, 16) || '10:00');
        setEnd(e.slice(11, 16));
        setVenue(item?.venue ?? '');
        setLeader(item?.leader ?? '');
        setDescription(item?.description ?? '');
        setAudience(item?.audience ?? 'PUBLIC');
        setGroup(item?.group?.id ?? groups?.[0]?.value ?? '');
        setCancelled(item?.is_cancelled ?? false);
        setTarget(item?.region_id ?? targets?.[0]?.value ?? '');
        setError(null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visible, item, groups]);

    const save = async () => {
        if (!title.trim()) return setError('Give the event a title.');
        if (!date) return setError('Pick the date.');
        if (!isTime(start) || (end && !isTime(end))) return setError('Use 24-hour times like 10:00 or 14:30.');
        if (end && end <= start) return setError('It must end after it starts (same day).');
        setBusy(true);
        const { data, error: err } = await runWrite<ChurchEvent>(
            submit({
                event_id: item?.id, title, venue, leader, description, audience, ...(groups ? { group_id: group } : {}), ...(targets ? { region_id: target } : {}), is_cancelled: cancelled,
                starts_at: joinDateTime(date, start), ends_at: end ? joinDateTime(date, end) : '',
            }),
            'event',
            item ? 'Event updated' : 'Event added',
        );
        setBusy(false);
        if (data) onSaved(data);
        else setError(err);
    };

    return (
        <AdminFormSheet visible={visible} onClose={onClose} title={item ? 'Edit event' : 'New event'} icon="calendar-outline" submitLabel="Save" submitting={busy} onSubmit={() => void save()} error={error} width={680}>
            <FormSection title="Event">
                <CustomTextField label="Title" required value={title} onChangeText={setTitle} placeholder="e.g. Youth conference, Wedding of …" />
                <FormRow>
                    <DateField label="Date" required value={date} onChangeText={setDate} />
                    <CustomTextField label="Starts (24h)" value={start} onChangeText={setStart} placeholder="10:00" />
                    <CustomTextField label="Ends (24h)" value={end} onChangeText={setEnd} placeholder="13:00" />
                </FormRow>
                <FormRow>
                    <CustomTextField label="Where" value={venue} onChangeText={setVenue} />
                    <CustomTextField label="Speaker / officiating" value={leader} onChangeText={setLeader} />
                </FormRow>
                <CustomTextField label="Details" value={description} onChangeText={setDescription} multiline />
            </FormSection>
            <FormSection title="Who">
                {targets ? <SelectDropdown label="Which parishes" options={targets} value={target} onChange={setTarget} /> : null}
                {groups ? (
                    <FormRow>
                        <SelectDropdown label="For" options={groups} value={group} onChange={setGroup} placeholder="Whole church" />
                    </FormRow>
                ) : null}
                <ChoiceChips
                    label="Who sees it"
                    options={[
                        { value: 'PUBLIC', label: 'Everyone' },
                        { value: 'MEMBERS', label: 'Members only' },
                    ]}
                    value={audience}
                    onChange={setAudience}
                />
                {item ? (
                    <ChoiceChips
                        label="Status"
                        options={[
                            { value: 'on', label: 'Going ahead' },
                            { value: 'off', label: 'Cancelled' },
                        ]}
                        value={cancelled ? 'off' : 'on'}
                        onChange={(v) => setCancelled(v === 'off')}
                    />
                ) : null}
            </FormSection>
        </AdminFormSheet>
    );
}
