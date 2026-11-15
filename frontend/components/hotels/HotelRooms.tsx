// components/hotels/HotelRooms.tsx
//
// The hotel's rooms: name, type, how many it sleeps, price per night, what's
// included and a photo. Guests see the ones that are on offer. Hotels only.

import { errorText, isOk } from '@/api/diningApi';
import hotelApi, { AMENITY_META, type Amenity, type HotelRoom } from '@/api/hotelApi';
import { AdminFormSheet, AdminListView, FormRow, FormSection, SheetButton, type AdminListConfig } from '@/components/common/listScreen';
import { CustomTextField } from '@/components/common/CustomTextField';
import { pickImage, previewUri, type PickedImage } from '@/components/common/imagePicker';
import type { PageSize } from '@/components/common/PaginationBar';
import { SwitchField } from '@/components/common/SwitchField';
import { kes } from '@/components/restaurants/shared';
import { useAuth } from '@/context/AuthContext';
import { useFocusEffect } from 'expo-router';
import { Formik } from 'formik';
import React, { useCallback, useEffect, useState } from 'react';
import { Image, Text, useWindowDimensions, View } from 'react-native';
import * as Yup from 'yup';

const AMENITIES = Object.keys(AMENITY_META) as Amenity[];
const included = (r: HotelRoom) => r.amenities.map((a) => AMENITY_META[a].label).join(', ');

const config: AdminListConfig<HotelRoom> = {
    title: 'Rooms',
    noun: ['room', 'rooms'],
    icon: 'bed-outline',
    searchPlaceholder: 'Search rooms…',
    addLabel: 'Add room',
    emptyMessage: 'Add your rooms so guests can book a stay.',
    keyOf: (r) => r.id,
    titleOf: (r) => r.title,
    subtitleOf: (r) => [r.room_type, `Sleeps ${r.max_guests}`, included(r)].filter(Boolean).join(' · '),
    avatarOf: (r) => ({ uri: r.image_url, icon: 'bed-outline' }),
    badgesOf: (r) => [r.is_available ? { label: 'On offer', tone: 'success' } : { label: 'Off', tone: 'neutral' }],
    metricOf: (r) => ({ value: kes(r.price), label: 'per night' }),
    primaryColumn: { label: 'Room', flex: 2 },
    columns: [
        { key: 'type', label: 'Type', flex: 1, render: (r) => r.room_type || '—' },
        { key: 'sleeps', label: 'Sleeps', flex: 0.7, render: (r) => String(r.max_guests) },
        { key: 'incl', label: 'Included', flex: 2, render: (r) => included(r) || '—' },
        { key: 'price', label: 'Per night', flex: 1, align: 'right', render: (r) => kes(r.price) },
        { key: 'avail', label: 'Status', flex: 0.8, render: (r) => (r.is_available ? 'On offer' : 'Off') },
    ],
};

const schema = Yup.object({
    title: Yup.string().trim().required('Name the room, e.g. Room 101'),
    price: Yup.number().typeError('Enter a number').moreThan(0, 'Enter the price per night').required('Enter the price per night'),
    max_guests: Yup.number().typeError('Enter a number').integer().min(1).max(20).required('How many does it sleep?'),
    about: Yup.string().trim().max(300, 'Keep it under 300 characters').optional(),
});

export default function HotelRooms() {
    const { width } = useWindowDimensions();
    const [rooms, setRooms] = useState<HotelRoom[]>([]);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [query, setQuery] = useState('');
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState<PageSize>(25);
    const [editing, setEditing] = useState<HotelRoom | null>(null);
    const [formOpen, setFormOpen] = useState(false);

    const load = useCallback(async () => {
        setRefreshing(true);
        try {
            const res: any = await hotelApi.myRooms();
            if (isOk(res)) {
                setRooms(res.data.rooms ?? []);
                setError(null);
            } else setError(errorText(res, 'Could not load rooms.'));
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

    const q = query.trim().toLowerCase();
    const filtered = rooms.filter((r) => !q || `${r.title} ${r.room_type ?? ''}`.toLowerCase().includes(q));
    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
    const start = (page - 1) * pageSize;
    const end = Math.min(start + pageSize, filtered.length);
    const open = (r: HotelRoom | null) => {
        setEditing(r);
        setFormOpen(true);
    };
    const onOffer = rooms.filter((r) => r.is_available);

    return (
        <>
            <AdminListView<HotelRoom>
                variant={width >= 900 ? 'web' : 'mobile'}
                config={config}
                query={query}
                setQuery={setQuery}
                onRefresh={load}
                refreshing={refreshing}
                error={error}
                items={filtered.slice(start, end)}
                allItems={filtered}
                onOpenCreate={() => open(null)}
                onPressItem={open}
                stats={[
                    { label: 'Rooms', value: String(rooms.length) },
                    { label: 'On offer', value: String(onOffer.length) },
                    { label: 'Beds', value: String(onOffer.reduce((s, r) => s + r.max_guests, 0)) },
                ]}
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
            <RoomForm
                visible={formOpen}
                room={editing}
                onClose={() => setFormOpen(false)}
                onSaved={(r) => {
                    setRooms((prev) => (prev.some((x) => x.id === r.id) ? prev.map((x) => (x.id === r.id ? r : x)) : [...prev, r]));
                    setFormOpen(false);
                }}
            />
        </>
    );
}

function RoomForm({ visible, room, onClose, onSaved }: { visible: boolean; room: HotelRoom | null; onClose: () => void; onSaved: (r: HotelRoom) => void }) {
    const { theme } = useAuth();
    const [image, setImage] = useState<PickedImage | null>(null);
    const [error, setError] = useState<string | null>(null);
    useEffect(() => {
        if (visible) {
            setImage(null);
            setError(null);
        }
    }, [visible]);
    const shown = image ? previewUri(image) : room?.image_url;

    return (
        <Formik
            key={`${visible}-${room?.id ?? 'new'}`}
            initialValues={{
                title: room?.title ?? '',
                room_type: room?.room_type ?? '',
                max_guests: room ? String(room.max_guests) : '2',
                price: room ? String(Number(room.price)) : '',
                about: room?.about ?? '',
                is_available: room ? room.is_available : true,
                ...(Object.fromEntries(AMENITIES.map((a) => [a, room ? room.amenities.includes(a) : a === 'free_wifi'])) as Record<Amenity, boolean>),
            }}
            validationSchema={schema}
            onSubmit={async (v) => {
                setError(null);
                const res: any = await hotelApi.saveRoom({ ...(room ? { id: room.id } : {}), ...v }, image);
                if (isOk(res)) onSaved(res.data.room);
                else setError(errorText(res, 'The room could not be saved.'));
            }}
        >
            {(f) => (
                <AdminFormSheet
                    visible={visible}
                    onClose={onClose}
                    title={room ? 'Edit room' : 'New room'}
                    subtitle="What guests see when they book"
                    icon="bed-outline"
                    submitLabel={room ? 'Save room' : 'Add room'}
                    submitting={f.isSubmitting}
                    error={error}
                    onSubmit={() => f.handleSubmit()}
                >
                    <FormSection title="Room" hint="Add each room you let out — two identical rooms are two entries (Room 101, Room 102).">
                        <FormRow>
                            <CustomTextField name="title" label="Name / number" required placeholder="e.g. Room 101" autoCapitalize="characters" />
                            <CustomTextField name="room_type" label="Type" placeholder="Single, Double, Twin, Suite…" autoCapitalize="words" />
                        </FormRow>
                        <FormRow>
                            <CustomTextField name="price" label="Price per night (KES)" required placeholder="3500" keyboardType="decimal-pad" />
                            <CustomTextField name="max_guests" label="Sleeps" required keyboardType="number-pad" />
                        </FormRow>
                        <CustomTextField name="about" label="About the room" placeholder="Bed size, view, bathroom — optional" multiline />
                    </FormSection>
                    <FormSection title="Included">
                        {AMENITIES.map((a) => (
                            <SwitchField key={a} name={a} label={AMENITY_META[a].label} row />
                        ))}
                    </FormSection>
                    <FormSection title="Photo" hint="A bright photo of the room gets more bookings.">
                        <View className="flex-row items-center" style={{ gap: 12 }}>
                            <View style={{ width: 96, height: 72, borderRadius: 12, overflow: 'hidden', backgroundColor: `${theme.primary}10`, alignItems: 'center', justifyContent: 'center' }}>
                                {shown ? <Image source={{ uri: shown }} style={{ width: 96, height: 72 }} /> : <Text style={{ fontSize: 26 }}>🛏</Text>}
                            </View>
                            <SheetButton label={shown ? 'Change photo' : 'Add photo'} icon="camera-outline" variant="secondary" onPress={async () => { const p = await pickImage({ aspect: [4, 3] }); if (p) setImage(p); }} />
                        </View>
                    </FormSection>
                    <FormSection title="Availability">
                        <SwitchField name="is_available" label="On offer" hint="Turn off while the room is being repaired or kept back." />
                    </FormSection>
                </AdminFormSheet>
            )}
        </Formik>
    );
}
