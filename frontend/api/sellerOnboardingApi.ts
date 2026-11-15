// api/sellerOnboardingApi.ts
//
// From shopper to seller — POST /authentication/users
// (backend authentication/utils/seller_onboarding.py):
//   GetSellerReadiness     what's missing before opening a shop
//   CompleteSellerProfile  phone + ID / passport type & number + a copy (mandatory)
//   CreateMyBusiness       open the shop; replies with fresh tokens (new roles)

import { ApiResponse } from 'apisauce';

import { appendToFormData, type PickedImage } from '@/components/common/imagePicker';

import client from './client';
import multipartClient from './multipartClient';

export type SellerRequirement = 'phone' | 'identifier_type' | 'identifier_number' | 'document';

export interface SellerReadiness {
    ready: boolean;
    missing: SellerRequirement[];
    phone: string | null;
    identifier_type: 'NationalId' | 'Passport' | null;
    identifier_number: string | null;
    document_url: string | null;
    consent_status: string;
    /** Every business the user owns; `current` is the one they're working in. */
    businesses: { id: string; title: string; entity_type: string; type_label: string; town: string | null; current: boolean; has_location: boolean }[];
    business_types: { value: string; label: string }[];
    consent_note?: string | null;
}

export interface SellerProfileInput {
    phone: string;
    identifier_type: 'NationalId' | 'Passport';
    identifier_number: string;
}

export interface MyBusinessInput {
    title: string;
    entity_type: string;
    town: string;
    road: string;
    building: string;
    description?: string;
    /** Required: where buyers and deliveries find the business. */
    latitude: number;
    longitude: number;
}

const ENDPOINT = '/authentication/users';

export default {
    getReadiness: (): Promise<ApiResponse<any>> => client.post(ENDPOINT, { action: 'GetSellerReadiness' }),
    completeProfile: (input: SellerProfileInput, document: PickedImage | null): Promise<ApiResponse<any>> => {
        if (!document) return client.post(ENDPOINT, { action: 'CompleteSellerProfile', ...input });
        const form = new FormData();
        form.append('action', 'CompleteSellerProfile');
        for (const [k, v] of Object.entries(input)) form.append(k, String(v));
        appendToFormData(form, 'document', document);
        return multipartClient.post(ENDPOINT, form);
    },
    createBusiness: (details: MyBusinessInput): Promise<ApiResponse<any>> => client.post(ENDPOINT, { action: 'CreateMyBusiness', entity_details: details }),
};
