// api/churchesApi.ts
//
// Churches (backend churches app, POST /api/v1/churches/).
//   Everyone signed in: find churches, open a church page, see their own family.
//   Church officials: the family register, groups, officials, announcements,
//   weekly programme, events and SMS. Every admin call takes an optional `church`
//   (default: the church you're signed in to, else the first one you help run).
//   Shared links (/church/<code>) use the open endpoint: public notices only.
//   Denominations (e.g. Free Pentecostal Fellowship in Kenya) sit above parishes:
//   a parish asks to join from its settings, head office approves; head office
//   posts notices / events for all its parishes. WaziPOS admins create denominations.

import { ApiResponse } from 'apisauce';

import client from './client';
import openClient from './clientOpen';

export type Office = 'SUPER' | 'ADMIN' | 'PASTOR' | 'SECRETARY' | 'TREASURER' | 'WELFARE' | 'GROUP_LEADER';
export type MemberStatus = 'ACTIVE' | 'VISITOR' | 'TRANSFERRED' | 'DECEASED';
export type FamilyRole = 'HEAD' | 'SPOUSE' | 'CHILD' | 'DEPENDANT';
export type Audience = 'PUBLIC' | 'MEMBERS';
export type GroupKind = 'MINISTRY' | 'CELL' | 'CHOIR' | 'YOUTH' | 'WOMEN' | 'MEN' | 'CHILDREN' | 'OTHER';

export type OrgStatus = 'NONE' | 'PENDING' | 'APPROVED' | 'REJECTED';
export type HqRole = 'PLATFORM' | 'HEAD' | 'ADMIN' | 'COMMUNICATIONS' | 'REGION_ADMIN';

export interface ChurchCard {
    id: string;
    title: string;
    town: string;
    road: string;
    phone?: string;
    /** The denomination it belongs to (approved), else what the parish typed. */
    denomination: string;
    denomination_id?: string | null;
    /** Region name (parish of a denomination). */
    region?: string;
    region_id?: string | null;
    // AdminHome only
    free_denomination?: string;
    org_status?: OrgStatus;
    org_note?: string;
    org_request?: { id: string; title: string } | null;
    code: string | null;
    distance_km: number | null;
    is_member: boolean;
    services?: string[];
    about?: string;
    email?: string;
    is_listed?: boolean;
    // MyChurches
    family_id?: string;
    family_name?: string;
    family_number?: string;
    role_label?: string;
}

export interface Announcement {
    id: string;
    title: string;
    body: string;
    audience: Audience;
    pinned: boolean;
    /** Set on head-office notices shown on a parish page. */
    from_denomination?: string | null;
    region_id?: string | null;
    publish_at: string | null;
    expires_at: string | null;
    created: string;
}

export interface ScheduleItem {
    id: string;
    day: number;
    day_label: string;
    starts: string;
    ends: string | null;
    title: string;
    venue: string;
    notes: string;
    group: { id: string; name: string } | null;
    is_active: boolean;
}

export interface ChurchEvent {
    id: string;
    title: string;
    starts_at: string;
    ends_at: string | null;
    venue: string;
    description: string;
    leader: string;
    audience: Audience;
    is_cancelled: boolean;
    from_denomination?: string | null;
    region_id?: string | null;
    group: { id: string; name: string } | null;
}

export interface ChurchPage {
    church: ChurchCard;
    denomination?: { id: string; title: string } | null;
    announcements: Announcement[];
    schedule: ScheduleItem[];
    events: ChurchEvent[];
    is_member?: boolean;
    my_family_id?: string | null;
    can_manage?: boolean;
    share_url?: string;
}

export interface MemberBrief {
    id: string;
    family_id: string;
    first_name: string;
    last_name: string;
    name: string;
    gender: string;
    date_of_birth: string | null;
    age: number | null;
    role_in_family: FamilyRole;
    role_label: string;
    status: MemberStatus;
    status_label: string;
    phone?: string;
    has_account: boolean;
    family_name?: string;
    family_number?: string;
    baptised_on?: string | null;
    confirmed_on?: string | null;
    married_on?: string | null;
}

export interface MemberEvent {
    id: string;
    kind: string;
    kind_label: string;
    date: string | null;
    details: string;
}

export interface MemberFull extends MemberBrief {
    id_number: string;
    baptised_on: string | null;
    confirmed_on: string | null;
    married_on: string | null;
    died_on: string | null;
    notes: string;
    origin_family: { id: string; name: string; number: string } | null;
    family_name: string;
    family_number: string;
    groups: { id: string; name: string }[];
    events?: MemberEvent[];
}

export interface Family {
    id: string;
    number: string;
    name: string;
    area: string;
    status: 'ACTIVE' | 'TRANSFERRED' | 'INACTIVE';
    joined_on: string | null;
    notes: string;
    cell_group: { id: string; name: string } | null;
    parent_family: { id: string; name: string; number: string } | null;
    head: string;
    phone: string;
    size: number;
    members?: MemberBrief[];
    branch_families?: { id: string; name: string; number: string }[];
    church?: ChurchCard;
    me?: string;
}

export interface Group {
    id: string;
    name: string;
    kind: GroupKind;
    kind_label: string;
    description: string;
    meets: string;
    is_active: boolean;
    members: number | null;
    leaders: { id: string; user_id: string; name: string }[];
}

export interface Official {
    id: string;
    user_id: string;
    name: string;
    phone: string;
    office: Exclude<Office, 'SUPER'>;
    office_label: string;
    group: { id: string; name: string } | null;
    since: string;
    added_by?: string;
}

export interface SmsAudience {
    kind: 'ALL' | 'HEADS' | 'GROUP' | 'FAMILY' | 'AGE' | 'GENDER';
    group_id?: string;
    family_id?: string;
    min_age?: string;
    max_age?: string;
    gender?: 'Female' | 'Male';
    include_visitors?: boolean;
}

export interface SmsPreview {
    label: string;
    recipients: number;
    without_phone: number;
    quota: number;
    used: number;
    left: number;
    parts: number;
}

export interface SmsMessage {
    id: string;
    body: string;
    audience: SmsAudience;
    audience_label: string;
    recipients: number;
    sent: number;
    failed: number;
    status: 'QUEUED' | 'SENDING' | 'SENT' | 'PARTIAL' | 'FAILED';
    sent_by: string;
    created: string;
    finished_at: string | null;
}

export interface AdminHome {
    church: ChurchCard;
    office: Office;
    office_label: string;
    my_groups: string[];
    churches: { id: string; title: string }[];
    counts: { families: number | null; members: number; visitors: number; groups: number; announcements: number };
    sms: { used: number; quota: number };
    birthdays: { id: string; name: string; date: string; turns: number }[];
    upcoming: ChurchEvent[];
    /** officials: may appoint group leaders; appoint_offices: an independent church's owner appoints parish offices too. */
    can: { edit_register: boolean; view_register: boolean; manage_groups: boolean; send_sms: boolean; post: boolean; officials: boolean; appoint_offices: boolean; settings: boolean };
}

export interface Denomination {
    id: string;
    title: string;
    description: string;
    parishes: number;
    // desk only
    heads?: string[];
    pending?: number;
    regions?: number;
}

export interface Region {
    /** "" = parishes with no region (overview only). */
    id: string;
    name: string;
    description: string;
    is_active: boolean;
    parishes: number;
    members: number;
    families: number;
    admins: { id: string; user_id: string; name: string; phone: string; since: string }[];
}

export interface Parish {
    id: string;
    title: string;
    town: string;
    region: { id: string; name: string } | null;
    phone: string;
    members: number;
    families: number;
    admin: string;
    admin_phone: string;
    org_status: OrgStatus;
    org_note: string;
    updated: string | null;
    is_active: boolean;
}

export interface HqAdmin {
    id: string;
    user_id: string;
    name: string;
    phone: string;
    role: Exclude<HqRole, 'PLATFORM'>;
    role_label: string;
    since: string;
}

export interface DenominationHome {
    organization: { id: string; title: string; description: string; email: string };
    role: HqRole;
    role_label: string;
    /** DENOMINATION: the whole denomination; REGION: a region admin's region(s) only. */
    level: 'DENOMINATION' | 'REGION';
    my_regions: { id: string; name: string }[];
    organizations: { id: string; title: string }[];
    counts: { parishes: number; pending: number; members: number; families: number; regions: number; notices: number };
    regions: Region[];
    upcoming: ChurchEvent[];
    can: { manage_regions: boolean; decide_parishes: boolean; appoint_officials: boolean; move_parishes: boolean; post: boolean; denomination_roles: boolean };
}

const PATH = '/churches/';
const call = (action: string, data: Record<string, any> = {}): Promise<ApiResponse<any>> => client.post(PATH, { action, ...data });

/** Admin calls carry the church being managed (when the official helps run more than one). */
const admin = (church: string | null | undefined) => (action: string, data: Record<string, any> = {}) =>
    call(action, church ? { church, ...data } : data);

export default {
    // everyone
    find: (params: { q?: string; denomination_id?: string; region_id?: string; latitude?: number; longitude?: number; page?: number }) => call('FindChurches', params),
    page: (params: { church_id?: string; code?: string }) => call('ChurchPage', params),
    myChurches: () => call('MyChurches'),
    myFamily: (church_id?: string) => call('MyFamily', church_id ? { church_id } : {}),
    publicChurch: (code: string) => openClient.post('churches/public', { action: 'PublicChurch', code }),
    denominations: (q?: string) => call('Denominations', q ? { q } : {}),
    regionsOf: (organization_id: string) => call('DenominationRegions', { organization_id }),

    // officials
    admin,

    // denomination head office (every call takes the denomination being run)
    hq: (organization: string | null | undefined) => (action: string, data: Record<string, any> = {}) =>
        call(action, organization ? { organization, ...data } : data),

    // WaziPOS admins
    desk: (q?: string) => call('DeskDenominations', q ? { q } : {}),
    saveDenomination: (data: { organization_id?: string; title: string; description?: string; email?: string; head_phone?: string }) => call('SaveDenomination', data),
};
