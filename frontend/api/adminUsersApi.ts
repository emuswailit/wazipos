// api/adminUsersApi.ts
//
// Platform admins manage users — POST /authentication/users/admin
// (backend authentication/utils/admin_users.py):
//   AdminGetUsers, AdminCreateUser, AdminUpdateUser (multipart when an ID /
//   passport file is attached), AdminSendConsent, AdminConfirmConsent.
// The person confirms SMS/call consent themselves on /consent:
//   POST /authentication/users/consent  ConfirmContactConsent (no sign-in).

import { ApiResponse } from 'apisauce';

import { appendToFormData, type PickedImage } from '@/components/common/imagePicker';

import client from './client';
import clientOpen from './clientOpen';
import multipartClient from './multipartClient';

export type ConsentStatus = 'NONE' | 'PENDING' | 'EXPIRED' | 'CONFIRMED' | 'REVOKED';
export type IdentifierType = 'NationalId' | 'Passport';

export interface AdminUser {
    id: string;
    first_name: string;
    middle_name: string | null;
    last_name: string;
    name: string;
    email: string;
    phone: string | null;
    gender: 'Female' | 'Male' | 'Other' | null;
    date_of_birth: string | null;
    identifier_type: IdentifierType | null;
    identifier_number: string | null;
    document_url: string | null;
    document_type: string | null;
    entity: string | null;
    entity_title: string | null;
    roles: string[];
    is_active: boolean;
    is_staff: boolean;
    registration_method: 'Email' | 'Google' | 'Facebook' | 'Admin' | string;
    consent_status: ConsentStatus;
    consent_confirmed_at: string | null;
    consent_sms_error: string | null;
    /** Phone proven: the SMS code came back (read out or entered). */
    phone_verified?: boolean;
    phone_verified_at?: string | null;
    /** False when the login is a placeholder (<phone>@users.wazipos.co.ke). */
    has_email?: boolean;
    email_verified?: boolean;
    email_verified_at?: string | null;
    email_link_sent_at?: string | null;
    created: string | null;
    /** After a save: what happened with the consent SMS. */
    consent_note?: string | null;
}

export interface AdminUserDetails {
    first_name: string;
    middle_name?: string;
    last_name: string;
    email?: string;
    phone: string;
    gender?: string;
    date_of_birth?: string;
    identifier_type?: IdentifierType | '';
    identifier_number?: string;
    /** Optional: otherwise the user joins the default WAZIPOS entity. */
    entity?: string;
    is_active: boolean;
}

/** A picked ID / passport scan (components/common/imagePicker). */
export type PickedDocument = PickedImage;

const ENDPOINT = '/authentication/users/admin';
const call = (action: string, data: Record<string, any> = {}): Promise<ApiResponse<any>> => client.post(ENDPOINT, { action, ...data });

function asForm(action: string, details: Record<string, any>, doc: PickedDocument): FormData {
    const form = new FormData();
    form.append('action', action);
    for (const [k, v] of Object.entries(details)) {
        if (v === undefined || v === null) continue;
        form.append(k, typeof v === 'boolean' ? String(v) : String(v));
    }
    appendToFormData(form, 'document', doc);
    return form;
}

function save(action: 'AdminCreateUser' | 'AdminUpdateUser', details: Record<string, any>, doc?: PickedDocument | null) {
    return doc ? multipartClient.post(ENDPOINT, asForm(action, details, doc)) : call(action, details);
}

export default {
    getUsers: (params: { q?: string; entity?: string } = {}) => call('AdminGetUsers', params),
    createUser: (details: AdminUserDetails, doc?: PickedDocument | null) => save('AdminCreateUser', details as any, doc),
    updateUser: (id: string, details: AdminUserDetails, doc?: PickedDocument | null) => save('AdminUpdateUser', { user: id, ...details }, doc),
    sendConsent: (user: string) => call('AdminSendConsent', { user }),
    /** The person read their code out to the admin. */
    confirmConsent: (user: string, code: string) => call('AdminConfirmConsent', { user, code }),
    /** Email the user a one-time verification link (again). */
    sendEmailVerification: (user: string) => call('AdminSendEmailVerification', { user }),
    /** Public: the person opened the emailed link (/verify-email?u=&t=). */
    confirmEmail: (user: string, token: string): Promise<ApiResponse<any>> =>
        clientOpen.post('/authentication/users/consent', { action: 'ConfirmEmail', user, token }),
    /** Public: the person enters the code themselves. */
    confirmOwnConsent: (phone: string, code: string): Promise<ApiResponse<any>> =>
        clientOpen.post('/authentication/users/consent', { action: 'ConfirmContactConsent', phone, code }),
};
