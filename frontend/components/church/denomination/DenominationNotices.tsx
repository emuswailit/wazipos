// components/church/denomination/DenominationNotices.tsx
//
// Denomination → Notices & events (head office): notices and events posted here show
// on the page of every parish of the denomination (marked as from head office).

import type { Announcement, ChurchEvent } from '@/api/churchesApi';
import { useAlert } from '@/components/common/AlertProvider';
import { InlineNotice, PosHeader, Segmented, SoftButton } from '@/components/ui/pos';
import { useAuth } from '@/context/AuthContext';
import { useCachedList } from '@/hooks/useCachedList';
import { Megaphone, Pencil, Plus, Trash2 } from 'lucide-react-native';
import React, { useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, View } from 'react-native';

import { AnnouncementForm } from '../admin/ChurchAnnouncements';
import { EventForm } from '../admin/ChurchSchedule';
import { AnnouncementCard, EmptyNote, EventCard, runWrite } from '../churchShared';
import { DenominationGate, useDenomination, type DenominationState } from './denominationShared';

type Tab = 'notices' | 'events' | 'past';

export default function DenominationNotices() {
    const state = useDenomination();
    return (
        <DenominationGate state={state}>
            {(home) => (
                <Body
                    state={state}
                    canPost={home.can.post}
                    targets={
                        home.level === 'REGION'
                            ? home.my_regions.map((r) => ({ value: r.id, label: r.name }))
                            : [{ value: '', label: 'Every parish' }, ...home.regions.filter((r) => r.id && r.is_active).map((r) => ({ value: r.id, label: `${r.name} only` }))]
                    }
                />
            )}
        </DenominationGate>
    );
}

function Body({ state, canPost, targets }: { state: DenominationState; canPost: boolean; targets: { value: string; label: string }[] }) {
    const { theme } = useAuth();
    const alert = useAlert();
    const [tab, setTab] = useState<Tab>('notices');
    const [editNotice, setEditNotice] = useState<Announcement | 'new' | null>(null);
    const [editEvent, setEditEvent] = useState<ChurchEvent | 'new' | null>(null);

    const notices = useCachedList<Announcement>({ key: `denom_notices:${state.org}`, fetch: () => state.api('DenominationAnnouncements') as any, pick: (d) => d?.result?.announcements, enabled: !!state.org && tab === 'notices' });
    const events = useCachedList<ChurchEvent>({ key: `denom_events:${state.org}:${tab}`, fetch: () => state.api('DenominationEvents', { when: tab === 'past' ? 'PAST' : 'UPCOMING' }) as any, pick: (d) => d?.result?.events, enabled: !!state.org && tab !== 'notices' });
    const list = tab === 'notices' ? notices : events;

    const confirmRemove = (title: string, run: () => Promise<void>) =>
        alert('Remove it?', `${title}. It disappears from every parish page.`, [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Remove', style: 'destructive', onPress: () => void run() },
        ]);

    return (
        <View style={{ flex: 1 }}>
            <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, maxWidth: 860, width: '100%', alignSelf: 'center', gap: 10 }} refreshControl={<RefreshControl refreshing={list.refreshing} onRefresh={() => void list.refresh()} tintColor={theme.primary} />}>
                <PosHeader
                    icon={Megaphone}
                    title="Notices & events"
                    subtitle="Shown on the pages of the parishes they're for"
                    right={canPost ? <SoftButton label={tab === 'notices' ? 'New notice' : 'New event'} icon={Plus} tone="navy" onPress={() => (tab === 'notices' ? setEditNotice('new') : setEditEvent('new'))} /> : null}
                />
                <Segmented<Tab>
                    options={[
                        ['notices', 'Notices'],
                        ['events', 'Upcoming events'],
                        ['past', 'Past events'],
                    ]}
                    value={tab}
                    onChange={setTab}
                />
                {list.error ? <InlineNotice tone="warning" message={list.error} /> : null}
                {list.loading && !list.items.length ? <ActivityIndicator color={theme.primary} style={{ marginTop: 30 }} /> : null}
                {tab === 'notices'
                    ? notices.items.map((a) => (
                          <AnnouncementCard
                              key={a.id}
                              a={a}
                              footer={
                                  canPost ? (
                                      <View style={{ flexDirection: 'row', gap: 8 }}>
                                          <SoftButton label="Edit" icon={Pencil} tone="neutral" onPress={() => setEditNotice(a)} />
                                          <SoftButton
                                              label="Remove"
                                              icon={Trash2}
                                              tone="danger"
                                              onPress={() =>
                                                  confirmRemove(a.title, async () => {
                                                      const { data } = await runWrite(state.api('DeleteDenominationAnnouncement', { announcement_id: a.id }), 'result', 'Notice removed');
                                                      if (data) notices.patch((rows) => rows.filter((r) => r.id !== a.id));
                                                  })
                                              }
                                          />
                                      </View>
                                  ) : undefined
                              }
                          />
                      ))
                    : events.items.map((e) => (
                          <EventCard
                              key={e.id}
                              e={e}
                              footer={
                                  canPost ? (
                                      <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                                          <SoftButton label="Edit" icon={Pencil} tone="neutral" onPress={() => setEditEvent(e)} />
                                          <SoftButton
                                              label="Remove"
                                              icon={Trash2}
                                              tone="danger"
                                              onPress={() =>
                                                  confirmRemove(e.title, async () => {
                                                      const { data } = await runWrite(state.api('DeleteDenominationEvent', { event_id: e.id }), 'result', 'Event removed');
                                                      if (data) events.patch((rows) => rows.filter((r) => r.id !== e.id));
                                                  })
                                              }
                                          />
                                      </View>
                                  ) : undefined
                              }
                          />
                      ))}
                {!list.loading && !list.items.length ? (
                    <EmptyNote icon={Megaphone} title={tab === 'notices' ? 'No notices' : tab === 'past' ? 'No past events' : 'No upcoming events'} text={tab === 'notices' ? 'Circulars, conventions, appointments and condolences: posted once, shown in every parish.' : undefined} />
                ) : null}
            </ScrollView>

            <AnnouncementForm
                submit={(body) => state.api('SaveDenominationAnnouncement', body)}
                visible={!!editNotice}
                item={editNotice && editNotice !== 'new' ? editNotice : null}
                audienceHint="Everyone: also on parishes' public pages. Members only: members of your parishes."
                targets={targets}
                onClose={() => setEditNotice(null)}
                onSaved={(a) => {
                    setEditNotice(null);
                    notices.patch((rows) => (rows.some((r) => r.id === a.id) ? rows.map((r) => (r.id === a.id ? a : r)) : [a, ...rows]));
                }}
            />
            <EventForm
                submit={(body) => state.api('SaveDenominationEvent', body)}
                targets={targets}
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
