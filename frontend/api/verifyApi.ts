// api/verifyApi.ts
//
// The signed-in person verifies their own contacts — POST /authentication/users:
//   GetMyVerification   where phone and email stand
//   SendMyPhoneCode     text a new 6-digit code to my phone
//   ConfirmMyPhone      {code} → phone verified (+ SMS/call consent)
//   SendMyEmailLink     email me a new confirmation link (email is verified only
//                       by opening it: /verify-email)
// Right after sign-up the app isn't signed in yet, so pass the new account's
// access token explicitly.

import { ApiResponse } from 'apisauce';

import client from './client';
import clientOpen from './clientOpen';

export interface MyVerification {
    phone: string | null;
    phone_verified: boolean;
    phone_code_pending: boolean;
    phone_sms_error: string | null;
    email: string | null;
    has_email: boolean;
    email_verified: boolean;
    email_link_sent_at: string | null;
}

const PATH = '/authentication/users';
const call = (action: string, data: Record<string, any> = {}, token?: string): Promise<ApiResponse<any>> =>
    token ? clientOpen.post(PATH, { action, ...data }, { headers: { Authorization: `Bearer ${token}` } }) : client.post(PATH, { action, ...data });

export default {
    status: (token?: string) => call('GetMyVerification', {}, token),
    sendPhoneCode: (token?: string) => call('SendMyPhoneCode', {}, token),
    confirmPhone: (code: string, token?: string) => call('ConfirmMyPhone', { code }, token),
    sendEmailLink: (token?: string) => call('SendMyEmailLink', {}, token),
};
