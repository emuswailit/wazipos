// components/church/admin/ChurchAnnouncements.tsx
//
// Church admin → Announcements: post notices to the church page (everyone, via the
// public link too) or to members only; pin, schedule (publish from) and expire them.

import type { Announcement, Audience } from '@/api/churchesApi';
import { useAlert } from '@/components/common/AlertProvider';
import { CustomTextField } from '@/components/common/CustomTextField';
import { DateField } from '@/components/common/DateField';
import { AdminFormSheet, ChoiceChips, FormRow, FormSection } from '@/components/common/listScreen';
import { SelectDropdown } from '@/components/common/SelectDropdown';
import { InlineNotice, PosHeader, Segmented, SoftButton } from '@/components/ui/pos';
import { useAuth } from '@/context/AuthContext';
import { useCachedList } from '@/hooks/useCachedList';
import { Megaphone, Pencil, Plus, Share2, Trash2 } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, View } from 'react-native';

import { AnnouncementCard, ChurchAdminGate, ChurchSwitcher, EmptyNote, joinDateTime, runWrite, shareChurch, toLocalInput, useChurchAdmin, type ChurchAdminState } from '../churchShared';

export default function ChurchAnnouncements() {
    const state = useChurchAdmin();
    return <ChurchAdminGate state={state}>{(home) => <Body state={state} canPost={home.can.edit_register} code={home.church.code} title={home.church.title} />}</ChurchAdminGate>;
}

function Body({ state, canPost, code, title }: { state: ChurchAdminState; canPost: boolean; code: string | null; title: string }) {
    const { theme } = useAuth();
    const alert = useAlert();
    const [show, setShow] = useState<'LIVE' | 'ALL'>('LIVE');
    const [editing, setEditing] = useState<Announcement | 'new' | null>(null);
    const list = useCachedList<Announcement>({ key: `church_ann:${state.church}:${show}`, fetch: () => state.api('Announcements', { show }) as any, pick: (d) => d?.result?.announcements, enabled: !!state.church });

    const remove = (a: Announcement) =>
        alert('Remove this announcement?', a.title, [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Remove',
                style: 'destructive',
                onPress: async () => {
                    const { data } = await runWrite(state.api('DeleteAnnouncement', { announcement_id: a.id }), 'result', 'Announcement removed');
                    if (data) list.patch((rows) => rows.filter((r) => r.id !== a.id));
                },
            },
        ]);

    return (
        <View style={{ flex: 1 }}>
            <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, maxWidth: 860, width: '100%', alignSelf: 'center', gap: 10 }} refreshControl={<RefreshControl refreshing={list.refreshing} onRefresh={() => void list.refresh()} tintColor={theme.primary} />}>
                <ChurchSwitcher state={state} />
                <PosHeader
                    icon={Megaphone}
                    title="Announcements"
                    subtitle="On the church page and its public link"
                    right={
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                            {code ? <SoftButton label="Share page" icon={Share2} tone="neutral" onPress={() => void shareChurch({ code, title })} /> : null}
                            {canPost ? <SoftButton label="New" icon={Plus} tone="navy" onPress={() => setEditing('new')} /> : null}
                        </View>
                    }
                />
                <Segmented<'LIVE' | 'ALL'>
                    options={[
                        ['LIVE', 'Live & scheduled'],
                        ['ALL', 'All, incl. expired'],
                    ]}
                    value={show}
                    onChange={setShow}
                />
                {list.error ? <InlineNotice tone="warning" message={list.error} /> : null}
                {list.loading && !list.items.length ? <ActivityIndicator color={theme.primary} style={{ marginTop: 30 }} /> : null}
                {!list.loading && !list.items.length ? <EmptyNote icon={Megaphone} title="No announcements" text="Post notices: services, funerals, weddings, meetings, harambees." action={canPost ? <SoftButton label="New announcement" icon={Plus} onPress={() => setEditing('new')} /> : undefined} /> : null}
                {list.items.map((a) => (
                    <AnnouncementCard
                        key={a.id}
                        a={a}
                        footer={
                            canPost ? (
                                <View style={{ flexDirection: 'row', gap: 8 }}>
                                    <SoftButton label="Edit" icon={Pencil} tone="neutral" onPress={() => setEditing(a)} />
                                    <SoftButton label="Remove" icon={Trash2} tone="danger" onPress={() => remove(a)} />
                                </View>
                            ) : undefined
                        }
                    />
                ))}
            </ScrollView>
            <AnnouncementForm
                submit={(body) => state.api('SaveAnnouncement', body)}
                visible={!!editing}
                item={editing && editing !== 'new' ? editing : null}
                onClose={() => setEditing(null)}
                onSaved={(a) => {
                    setEditing(null);
                    list.patch((rows) => (rows.some((r) => r.id === a.id) ? rows.map((r) => (r.id === a.id ? a : r)) : [a, ...rows]));
                }}
            />
        </View>
    );
}

/** Notice form (parish, or head office via a different `submit`). */
export function AnnouncementForm({ submit, visible, item, onClose, onSaved, audienceHint, targets }: { submit: (body: Record<string, any>) => Promise<any>; visible: boolean; item: Announcement | null; onClose: () => void; onSaved: (a: Announcement) => void; audienceHint?: string; targets?: { value: string; label: string }[] }) {
    const [target, setTarget] = useState('');
    const [title, setTitle] = useState('');
    const [body, setBody] = useState('');
    const [audience, setAudience] = useState<Audience>('PUBLIC');
    const [pinned, setPinned] = useState(false);
    const [from, setFrom] = useState('');
    const [until, setUntil] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!visible) return;
        setTitle(item?.title ?? '');
        setBody(item?.body ?? '');
        setAudience(item?.audience ?? 'PUBLIC');
        setPinned(item?.pinned ?? false);
        setFrom(toLocalInput(item?.publish_at).slice(0, 10));
        setUntil(toLocalInput(item?.expires_at).slice(0, 10));
        setTarget(item?.region_id ?? targets?.[0]?.value ?? '');
        setError(null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visible, item]);

    const save = async () => {
        if (!title.trim() || !body.trim()) return setError('Add a title and the announcement.');
        if (from && until && until < from) return setError('It must expire after it is published.');
        setBusy(true);
        const { data, error: err } = await runWrite<Announcement>(
            submit({
                announcement_id: item?.id,
                title,
                body,
                audience,
                pinned,
                publish_at: from ? joinDateTime(from, '00:00') : '',
                expires_at: until ? joinDateTime(until, '23:59') : '',
                ...(targets ? { region_id: target } : {}),
            }),
            'announcement',
            item ? 'Announcement updated' : 'Announcement posted',
        );
        setBusy(false);
        if (data) onSaved(data);
        else setError(err);
    };

    return (
        <AdminFormSheet visible={visible} onClose={onClose} title={item ? 'Edit announcement' : 'New announcement'} icon="megaphone-outline" submitLabel={item ? 'Save' : 'Post'} submitting={busy} onSubmit={() => void save()} error={error} width={680}>
            <FormSection title="Announcement">
                <CustomTextField label="Title" required value={title} onChangeText={setTitle} placeholder="e.g. Funeral arrangements for the late …" />
                <CustomTextField label="Details" required value={body} onChangeText={setBody} multiline placeholder="Date, time, place and what members should know" />
            </FormSection>
            <FormSection title="Who and when">
                {targets ? <SelectDropdown label="Which parishes" options={targets} value={target} onChange={setTarget} /> : null}
                <ChoiceChips
                    label="Who sees it"
                    hint={audienceHint}
                    options={[
                        { value: 'PUBLIC', label: 'Everyone' },
                        { value: 'MEMBERS', label: 'Members only' },
                    ]}
                    value={audience}
                    onChange={setAudience}
                />
                <ChoiceChips
                    label="Pin to the top"
                    options={[
                        { value: 'no', label: 'No' },
                        { value: 'yes', label: 'Pin' },
                    ]}
                    value={pinned ? 'yes' : 'no'}
                    onChange={(v) => setPinned(v === 'yes')}
                />
                <FormRow>
                    <DateField label="Show from (blank: now)" value={from} onChangeText={setFrom} />
                    <DateField label="Show until (blank: until removed)" value={until} onChangeText={setUntil} />
                </FormRow>
            </FormSection>
        </AdminFormSheet>
    );
}
