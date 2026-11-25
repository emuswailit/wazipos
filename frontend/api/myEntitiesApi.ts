// api/myEntitiesApi.ts — "My businesses" (POST /authentication/users,
// backend authentication/utils/my_entities.py):
//   GetMyEntities                        strictly the businesses the signed-in user owns
//   SendSwitchCode {entity}              SMS code, for accounts without a password
//   SwitchMyEntity {entity, password|code} sign in again -> fresh tokens for the new business

import { ApiResponse } from 'apisauce';

import client from './client';

export interface MyEntity {
    id: string;
    title: string;
    entity_type: string;
    type_label: string;
    town: string | null;
    road: string | null;
    phone: string | null;
    email: string | null;
    is_verified: boolean;
    /** false = deactivated by WaziPOS: can't be switched into. */
    is_active?: boolean;
    approval: 'SETUP' | 'PENDING' | 'APPROVED' | 'REJECTED' | null;
    has_location: boolean;
    current: boolean;
    created: string | null;
}

export interface MyEntities {
    entities: MyEntity[];
    current: string | null;
    /** How the user confirms a switch: their password, or an SMS code (Google / Facebook sign-ups). */
    confirm_with: 'password' | 'code';
    phone_hint: string | null;
}

export interface SwitchResult {
    entity: { id: string; title: string; entity_type: string; type_label: string };
    tokens: { access: string; refresh: string };
}

const PATH = '/authentication/users';
const call = (action: string, data: Record<string, any> = {}): Promise<ApiResponse<any>> => client.post(PATH, { action, ...data });

export default {
    list: () => call('GetMyEntities'),
    sendCode: (entity: string) => call('SendSwitchCode', { entity }),
    switchTo: (entity: string, confirm: { password?: string; code?: string }) => call('SwitchMyEntity', { entity, ...confirm }),
};
