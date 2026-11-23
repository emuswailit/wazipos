// api/jobsApi.ts
//
// WaziPOS jobs board (backend employees/jobs.py, POST /api/v1/employees/jobs).
//   Everyone signed in: browse, view, save (on device), apply, follow applications.
//   A business's super admin: post adverts (permanent / locum / contract…), run the
//   applicant pipeline. Shared links open /job/<code>: a public teaser only.

import { ApiResponse } from 'apisauce';
import { Platform } from 'react-native';

import client from './client';
import openClient from './clientOpen';
import multipartClient from './multipartClient';

export type EmploymentType = 'PERMANENT' | 'LOCUM' | 'CONTRACT' | 'INTERNSHIP' | 'TEMPORARY';
export type AdvertStatus = 'DRAFT' | 'OPEN' | 'PAUSED' | 'CLOSED' | 'FILLED';
export type PayPeriod = 'HOUR' | 'SHIFT' | 'DAY' | 'WEEK' | 'MONTH' | 'YEAR';
export type ApplicationStatus = 'SUBMITTED' | 'SHORTLISTED' | 'INTERVIEW' | 'OFFERED' | 'HIRED' | 'REJECTED' | 'WITHDRAWN';

export interface JobCard {
    id: string;
    code: string;
    title: string;
    entity: { id: string; title: string; type: string; logo: string | null };
    designation: string | null;
    cadre: { id: string; title: string } | null;
    employment_type: EmploymentType;
    location: string | null;
    county: { id: string; title: string } | null;
    pay: string | null;
    vacancies: number;
    closes: string;
    starts_on: string | null;
    ends_on: string | null;
    shift_hours: string | null;
    requires_license: boolean;
    license_body: string | null;
    min_experience_years: number;
    excerpt: string;
    status: AdvertStatus;
    is_open: boolean;
    applied: boolean;
    created: string;
}

export interface JobDetails extends JobCard {
    description: string | null;
    responsibilities: string | null;
    requirements: string | null;
    benefits: string | null;
    pay_min: string | null;
    pay_max: string | null;
    pay_period: PayPeriod;
    my_application: JobApplication | null;
    is_employer: boolean;
    share_url: string;
    closed_notice?: string;
}

export interface EmployerAdvert extends JobDetails {
    show_pay: boolean;
    work_location: string | null;
    contact_email: string | null;
    designation_id: string;
    cadre_id: string | null;
    filled: number;
    views: number;
    applications: number;
    pipeline: Partial<Record<ApplicationStatus, number>>;
}

export interface JobApplication {
    id: string;
    status: ApplicationStatus;
    advert: { id: string; title: string; code: string; entity: string };
    cover_note: string | null;
    phone: string;
    email: string | null;
    license_number: string | null;
    years_experience: number;
    available_from: string | null;
    expected_pay: string | null;
    cv: string | null;
    /** Link to the WaziPOS CV attached to the application. */
    wazi_cv: string | null;
    interview_at: string | null;
    interview_location: string | null;
    message: string | null;
    created: string;
    updated: string;
    applicant?: { id: string; name: string; email: string; phone: string | null; education_level: string | null };
    employer_notes?: string | null;
}

export interface JobsPage {
    results: JobCard[];
    count: number;
    page: number;
    pages: number;
}

export interface JobLookups {
    cadres: { id: string; title: string }[];
    employment_types: EmploymentType[];
    pay_periods: PayPeriod[];
    can_post: boolean;
    designations: { id: string; title: string; tenure: string; cadre_id: string | null }[];
}

export interface PublicJob {
    code: string;
    title: string;
    entity: { title: string; logo: string | null };
    employment_type: EmploymentType;
    location: string | null;
    cadre: string | null;
    closes: string;
    vacancies: number;
    pay: string | null;
    excerpt: string | null;
    is_open: boolean;
}

export interface ApplyInput {
    advert_id: string;
    phone: string;
    email?: string;
    cover_note?: string;
    license_number?: string;
    years_experience?: number | string;
    available_from?: string;
    expected_pay?: string;
    /** Native: { uri, name, type } from the image picker. Web: a File. */
    cv?: any;
    /** Attach a WaziPOS CV (built under Jobs → My CV) instead of / as well as a file. */
    cv_id?: string;
}

export interface AdvertInput {
    advert_id?: string;
    title: string;
    employment_type: EmploymentType;
    vacancies: number | string;
    closes: string;
    status?: AdvertStatus;
    designation_id?: string;
    designation_title?: string;
    cadre_id?: string;
    description?: string;
    responsibilities?: string;
    requirements?: string;
    benefits?: string;
    work_location?: string;
    pay_min?: string;
    pay_max?: string;
    pay_period?: PayPeriod;
    show_pay?: boolean;
    starts_on?: string;
    ends_on?: string;
    shift_hours?: string;
    min_experience_years?: number | string;
    requires_license?: boolean;
    license_body?: string;
    contact_email?: string;
}

/* ---------------------------------------------------------------- My CV */

export interface CvExperience { role: string; employer: string; location: string; start: string; end: string; current: boolean; bullets: string[] }
export interface CvEducation { qualification: string; institution: string; start: string; end: string; grade: string }
export interface CvCertification { name: string; issuer: string; year: string; number: string }
export interface CvLanguage { language: string; level: string }
export interface CvReferee { name: string; title: string; organisation: string; phone: string; email: string }
export interface CvExtra { title: string; items: string[] }

export interface CvData {
    personal: { full_name: string; headline: string; email: string; phone: string; location: string; linkedin: string; website: string };
    summary: string;
    experience: CvExperience[];
    education: CvEducation[];
    skills: string[];
    certifications: CvCertification[];
    languages: CvLanguage[];
    referees: CvReferee[];
    extras: CvExtra[];
}

export type CvTemplate = 'modern' | 'classic' | 'compact';

export interface CvSummary {
    id: string;
    title: string;
    template: CvTemplate;
    accent: string;
    is_public: boolean;
    share_url: string | null;
    updated: string;
    created: string;
    full_name: string | null;
}

export interface CvRecord extends CvSummary {
    data: CvData;
}

export type CvTask = 'draft' | 'summary' | 'bullets' | 'skills' | 'tailor' | 'review';

const PATH = 'employees/jobs';
const post = <T = any>(action: string, body: Record<string, any> = {}): Promise<ApiResponse<T>> => client.post(PATH, { action, ...body });

const jobsApi = {
    browse: (f: { q?: string; employment_type?: EmploymentType | ''; cadre?: string; county?: string; page?: number }) =>
        post<{ jobs: JobsPage }>('Browse', f),
    details: (ref: { advert_id?: string; code?: string }) => post<{ job: JobDetails }>('JobDetails', ref),
    lookups: () => post<{ lookups: JobLookups }>('Lookups'),
    myApplications: () => post<{ applications: JobApplication[] }>('MyApplications'),
    withdraw: (application_id: string) => post<{ application: JobApplication }>('WithdrawApplication', { application_id }),

    apply: (input: ApplyInput): Promise<ApiResponse<{ application: JobApplication }>> => {
        const { cv, ...rest } = input;
        if (!cv) return post('Apply', rest);
        const form = new FormData();
        form.append('action', 'Apply');
        Object.entries(rest).forEach(([k, v]) => {
            if (v !== undefined && v !== null && v !== '') form.append(k, String(v));
        });
        if (Platform.OS === 'web') form.append('cv', cv as any);
        else form.append('cv', { uri: cv.uri, name: cv.name ?? 'cv.jpg', type: cv.type ?? 'image/jpeg' } as any);
        return multipartClient.post(PATH, form) as any;
    },

    // employers
    employerAdverts: () => post<{ adverts: EmployerAdvert[] }>('EmployerAdverts'),
    saveAdvert: (input: AdvertInput) => post<{ advert: EmployerAdvert }>('SaveAdvert', input),
    setStatus: (advert_id: string, status: AdvertStatus) => post<{ advert: EmployerAdvert }>('SetAdvertStatus', { advert_id, status }),
    applications: (advert_id: string, status?: ApplicationStatus) =>
        post<{ pipeline: { advert: EmployerAdvert; applications: JobApplication[] } }>('AdvertApplications', { advert_id, status }),
    updateApplication: (body: {
        application_id: string;
        status?: ApplicationStatus;
        employer_notes?: string;
        interview_at?: string;
        interview_location?: string;
        message?: string;
    }) => post<{ application: JobApplication }>('UpdateApplication', body),

    // My CV
    myCvs: () => post<{ cvs: CvSummary[] }>('MyCVs'),
    getCv: (cv_id: string) => post<{ cv: CvRecord }>('GetCV', { cv_id }),
    saveCv: (body: { cv_id?: string; title: string; template: CvTemplate; accent: string; data: CvData; html?: string }) => post<{ cv: CvRecord }>('SaveCV', body),
    deleteCv: (cv_id: string) => post('DeleteCV', { cv_id }),
    shareCv: (cv_id: string, is_public: boolean, rotate = false) => post<{ cv: CvRecord }>('ShareCV', { cv_id, is_public, rotate }),
    cvAssist: (body: { task: CvTask; data?: CvData; notes?: string; index?: number; target_role?: string; advert_id?: string }) =>
        post<{ assist: { task: CvTask; result: any; uses_left_today: number } }>('CVAssist', body),

    // no account
    publicJob: (code: string) => openClient.post<{ job: PublicJob }>(`${PATH}/public`, { code }),
};

export default jobsApi;
