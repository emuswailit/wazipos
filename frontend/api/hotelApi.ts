// api/hotelApi.ts
//
// Accommodation — hotels only (backend restaurants/services/accommodation.py),
// POST /restaurants/dining. A hotel is an entity of type "Hotel": it has every
// restaurant feature (api/diningApi.ts) plus rooms and stays. Restaurants have
// neither; the server refuses these actions for them.
//
// Guests: rooms for dates, book, pay by mobile money, follow / cancel stays.
// Hotel staff: rooms (with a photo), the stays board, walk-in bookings,
//   confirm / check in / check out, payment at the desk.

import type { ApiResponse } from 'apisauce';

import { appendToFormData, type PickedImage } from '@/components/common/imagePicker';

import client from './client';
import multipartClient from './multipartClient';

export type Amenity = 'free_wifi' | 'free_breakfast' | 'free_parking' | 'free_cancellation';
export type StayStatus = 'BOOKED' | 'CONFIRMED' | 'CHECKED_IN' | 'CHECKED_OUT' | 'CANCELLED' | 'NO_SHOW';

export const AMENITY_META: Record<Amenity, { label: string; icon: string }> = {
    free_wifi: { label: 'Wi-Fi', icon: 'wifi-outline' },
    free_breakfast: { label: 'Breakfast', icon: 'cafe-outline' },
    free_parking: { label: 'Parking', icon: 'car-outline' },
    free_cancellation: { label: 'Free cancellation', icon: 'refresh-outline' },
};

export const STAY_META: Record<string, { label: string; tone: 'info' | 'warning' | 'success' | 'danger' | 'violet' | 'primary' | 'neutral' }> = {
    BOOKED: { label: 'New', tone: 'info' },
    CONFIRMED: { label: 'Confirmed', tone: 'primary' },
    CHECKED_IN: { label: 'In house', tone: 'violet' },
    CHECKED_OUT: { label: 'Checked out', tone: 'success' },
    CANCELLED: { label: 'Cancelled', tone: 'danger' },
    NO_SHOW: { label: 'No show', tone: 'neutral' },
};

export interface HotelRoom {
    id: string;
    title: string;
    room_type: string | null;
    about: string | null;
    max_guests: number;
    /** Per night. */
    price: string;
    is_available: boolean;
    amenities: Amenity[];
    stars: number;
    image_url: string | null;
    /** Only when dates were given: free for those nights? */
    is_free?: boolean;
}

export interface HotelRooms {
    hotel: { id: string; title: string; town: string | null; road: string | null; building: string | null; phone: string | null };
    checkin_date: string | null;
    checkout_date: string | null;
    nights: number;
    rooms: HotelRoom[];
}

export interface RoomBooking {
    id: string;
    reference: string;
    hotel: string;
    hotel_title: string | null;
    room: string | null;
    room_title: string | null;
    room_type: string | null;
    room_image_url: string | null;
    free_cancellation: boolean;
    status: StayStatus;
    status_label: string;
    checkin_date: string;
    checkout_date: string;
    nights: number;
    guests: number;
    guest_name: string | null;
    guest_phone: string | null;
    nightly_rate: string;
    total: string;
    paid: string;
    amount_due: string;
    is_paid: boolean;
    notes: string | null;
    origin: 'CUSTOMER' | 'STAFF';
    last_payment: { reference: string; status: string; description: string } | null;
    created: string | null;
    checked_in_at: string | null;
    checked_out_at: string | null;
}

export interface BookRoomInput {
    room: string;
    checkin_date: string;
    checkout_date: string;
    guests: number;
    guest_name?: string;
    guest_phone?: string;
    notes?: string;
    draft_id: string;
}

const ENDPOINT = '/restaurants/dining';
const call = (action: string, data: Record<string, any> = {}): Promise<ApiResponse<any>> => client.post(ENDPOINT, { action, ...data });

/** Local calendar date as YYYY-MM-DD (toISOString() is UTC — "yesterday" before 3am in Nairobi). */
export const isoDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const addDays = (iso: string, days: number) => {
    const d = new Date(`${iso}T12:00:00`);
    d.setDate(d.getDate() + days);
    return isoDate(d);
};
export const nightsBetween = (a: string, b: string) => Math.round((new Date(`${b}T12:00:00`).getTime() - new Date(`${a}T12:00:00`).getTime()) / 86400000);
export const prettyDate = (iso?: string | null) => {
    if (!iso) return '';
    const d = new Date(`${iso}T12:00:00`);
    return isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
};

const hotelApi = {
    // guests
    rooms: (entity: string, checkin_date?: string, checkout_date?: string) => call('GetHotelRooms', { entity, checkin_date, checkout_date }),
    book: (input: BookRoomInput) => call('BookRoom', input),
    myBookings: () => call('GetMyRoomBookings'),
    cancelMyBooking: (booking: string) => call('CancelMyRoomBooking', { booking }),
    pay: (booking: string, mobile_money_phone: string) => call('PayRoomBooking', { booking, mobile_money_phone }),
    refreshPayment: (reference: string) => call('RefreshRoomPayment', { reference }),

    // hotel staff
    myRooms: () => call('GetRooms'),
    saveRoom: (details: Record<string, any>, image?: PickedImage | null) => {
        if (!image) return call('SaveRoom', details);
        const form = new FormData();
        form.append('action', 'SaveRoom');
        for (const [k, v] of Object.entries(details)) if (v !== undefined && v !== null) form.append(k, String(v));
        appendToFormData(form, 'image', image);
        return multipartClient.post(ENDPOINT, form);
    },
    bookings: (scope: 'open' | 'done' = 'open') => call('GetRoomBookings', { scope }),
    updateBooking: (booking: string, status: StayStatus) => call('UpdateRoomBooking', { booking, status }),
    recordPayment: (booking: string, payment_method?: string | null) => call('RecordRoomPayment', { booking, payment_method }),
};

export default hotelApi;
