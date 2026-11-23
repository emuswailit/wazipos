// components/jobs/EmployerJobs.tsx
//
// Hiring, for a business's own admins (super admin, owner, administrator): post and edit job adverts (permanent,
// locum, contract, internship, temporary), pause / close / re-open them, share the
// link, and move applicants through the pipeline:
//   Sent → Shortlisted → Interview (date, place) → Offer → Hired   (or Not selected)
// The advert list is saved on the device (opens offline); changes need a connection.

import jobsApi, { type AdvertInput, type AdvertStatus, type ApplicationStatus, type EmployerAdvert, type EmploymentType, type JobApplication, type JobLookups, type PayPeriod } from '@/api/jobsApi';
import { useAlert } from '@/components/common/AlertProvider';
import { CustomTextField } from '@/components/common/CustomTextField';
import { DateField } from '@/components/common/DateField';
import { AdminFormSheet, AdminSheet, ChoiceChips, FormRow, FormSection } from '@/components/common/listScreen';
import { SelectDropdown } from '@/components/common/SelectDropdown';
import { SwitchField } from '@/components/common/SwitchField';
import { toast } from '@/components/common/Toast';
import { InlineNotice, OfflineNotice, PosHeader, SoftButton, StatusPill } from '@/components/ui/pos';
import { useAuth } from '@/context/AuthContext';
import { useNetworkStatus } from '@/context/NetworkMonitorContext';
import { useCachedList } from '@/hooks/useCachedList';
import { describeResponse } from '@/utils/apiFeedback';
import { isServerOk } from '@/utils/serverResponse';
import { Eye, FileText, Inbox, Mail, Megaphone, Pause, Pencil, Phone, Play, Plus, Share2, Users, XCircle } from 'lucide-react-native';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, RefreshControl, ScrollView, Text, useWindowDimensions, View } from 'react-native';

import { APP_STATUS_META, Badge, closesLabel, fmtDate, fmtDateTime, PIPELINE, pointer, shareJob, toneColor, TYPE_META } from './jobsShared';

const STATUS_META: Record<AdvertStatus, { label: string; tone: 'success' | 'warning' | 'danger' | 'info' }> = {
    DRAFT: { label: 'Draft', tone: 'info' },
    OPEN: { label: 'Open', tone: 'success' },
    PAUSED: { label: 'Paused', tone: 'warning' },
    CLOSED: { label: 'Closed', tone: 'danger' },
    FILLED: { label: 'Filled', tone: 'success' },
};

/** Next moves the employer can make (mirrors the backend TRANSITIONS). */
const NEXT: Record<ApplicationStatus, ApplicationStatus[]> = {
    SUBMITTED: ['SHORTLISTED', 'INTERVIEW', 'REJECTED'],
    SHORTLISTED: ['INTERVIEW', 'OFFERED', 'REJECTED'],
    INTERVIEW: ['OFFERED', 'REJECTED'],
    OFFERED: ['HIRED', 'REJECTED'],
    HIRED: [],
    REJECTED: ['SHORTLISTED'],
    WITHDRAWN: [],
};
const ACTION_LABEL: Partial<Record<ApplicationStatus, string>> = {
    SHORTLISTED: 'Shortlist',
    INTERVIEW: 'Invite to interview',
    OFFERED: 'Make offer',
    HIRED: 'Mark hired',
    REJECTED: 'Not selected',
};

export default function EmployerJobs() {
    const { theme } = useAuth();
    const { width } = useWindowDimensions();
    const { isOnline } = useNetworkStatus();
    const appAlert = useAlert();
    const cols = width >= 1100 ? 2 : 1;

    const adverts = useCachedList<EmployerAdvert>({ key: 'employer_job_adverts', fetch: () => jobsApi.employerAdverts() as any, pick: (d) => d?.adverts });
    const [lookups, setLookups] = useState<JobLookups | null>(null);
    const [editing, setEditing] = useState<EmployerAdvert | 'new' | null>(null);
    const [pipelineFor, setPipelineFor] = useState<EmployerAdvert | null>(null);

    useEffect(() => {
        jobsApi.lookups().then((res: any) => isServerOk(res) && setLookups(res.data.lookups)).catch(() => undefined);
    }, []);

    const upsert = (a: EmployerAdvert) => adverts.patch((rows) => (rows.some((r) => r.id === a.id) ? rows.map((r) => (r.id === a.id ? { ...r, ...a } : r)) : [a, ...rows]));

    const setStatus = async (a: EmployerAdvert, status: AdvertStatus) => {
        if (!isOnline) return toast.show({ tone: 'offline', title: "You're offline", message: 'Connect to change the advert.' });
        const res: any = await jobsApi.setStatus(a.id, status);
        if (isServerOk(res)) {
            upsert(res.data.advert);
            toast.success(status === 'OPEN' ? 'Advert is live' : `Advert ${STATUS_META[status].label.toLowerCase()}`);
        } else toast.fromResponse(res, 'Could not update the advert.');
    };

    const confirmClose = (a: EmployerAdvert) =>
        appAlert('Close this advert?', 'It stops taking applications. You can re-open it later.', [
            { text: 'Keep open', style: 'cancel' },
            { text: 'Close advert', style: 'destructive', onPress: () => void setStatus(a, 'CLOSED') },
        ]);

    const totals = useMemo(() => {
        const open = adverts.items.filter((a) => a.status === 'OPEN').length;
        const apps = adverts.items.reduce((n, a) => n + (a.applications || 0), 0);
        return { open, apps };
    }, [adverts.items]);

    if (lookups && !lookups.can_post) {
        return (
            <View style={{ flex: 1, padding: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.background }}>
                <InlineNotice tone="warning" message="Only your business's admins can post and manage its job adverts. Sign in to the business you run to hire for it." />
            </View>
        );
    }

    return (
        <View style={{ flex: 1, backgroundColor: theme.background }}>
            <ScrollView
                contentContainerStyle={{ padding: 16, paddingBottom: 40, maxWidth: 1240, width: '100%', alignSelf: 'center' }}
                refreshControl={<RefreshControl refreshing={adverts.refreshing} onRefresh={() => void adverts.refresh()} tintColor={theme.primary} />}
            >
                <PosHeader
                    icon={Megaphone}
                    title="Hiring"
                    subtitle={`${totals.open} open ${totals.open === 1 ? 'advert' : 'adverts'} · ${totals.apps} applications`}
                    right={<SoftButton label={width >= 520 ? 'New advert' : 'New'} icon={Plus} tone="navy" onPress={() => setEditing('new')} />}
                />
                {!isOnline ? <OfflineNotice title="Offline" message="Showing adverts saved on this device. Posting and reviewing applicants needs a connection." /> : null}
                {adverts.error ? <View style={{ marginBottom: 12 }}><InlineNotice tone="danger" message={adverts.error} /></View> : null}
                {adverts.loading && !adverts.items.length ? <ActivityIndicator color={theme.primary} style={{ marginTop: 40 }} /> : null}

                {!adverts.loading && !adverts.items.length ? (
                    <View style={{ alignItems: 'center', paddingVertical: 48, gap: 10 }}>
                        <View style={{ width: 60, height: 60, borderRadius: 20, backgroundColor: theme.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
                            <Megaphone size={26} color={theme.primary} />
                        </View>
                        <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 16 }}>Post your first job</Text>
                        <Text style={{ color: theme.textMuted, fontFamily: theme.font.regular, fontSize: 13.5, textAlign: 'center', maxWidth: 360 }}>
                            Permanent staff or locum cover — every WaziPOS user can see it, and you can share the link anywhere.
                        </Text>
                        <SoftButton label="New advert" icon={Plus} onPress={() => setEditing('new')} />
                    </View>
                ) : null}

                <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -6 }}>
                    {adverts.items.map((a) => (
                        <View key={a.id} style={{ width: `${100 / cols}%` as any, padding: 6 }}>
                            <AdvertCard
                                advert={a}
                                onApplicants={() => setPipelineFor(a)}
                                onEdit={() => setEditing(a)}
                                onShare={() => void shareJob(a)}
                                onPause={() => void setStatus(a, 'PAUSED')}
                                onOpen={() => void setStatus(a, 'OPEN')}
                                onClose={() => confirmClose(a)}
                            />
                        </View>
                    ))}
                </View>
            </ScrollView>

            <AdvertForm
                visible={!!editing}
                advert={editing && editing !== 'new' ? editing : null}
                lookups={lookups}
                onClose={() => setEditing(null)}
                onSaved={(a) => {
                    upsert(a);
                    setEditing(null);
                }}
            />
            <ApplicantsSheet advert={pipelineFor} onClose={() => setPipelineFor(null)} onChanged={() => void adverts.refresh()} />
        </View>
    );
}

/* -------------------------------------------------------------- advert card */

function AdvertCard({ advert: a, onApplicants, onEdit, onShare, onPause, onOpen, onClose }: { advert: EmployerAdvert; onApplicants: () => void; onEdit: () => void; onShare: () => void; onPause: () => void; onOpen: () => void; onClose: () => void }) {
    const { theme } = useAuth();
    const type = TYPE_META[a.employment_type] ?? TYPE_META.PERMANENT;
    const st = STATUS_META[a.status];
    const newOnes = a.pipeline?.SUBMITTED ?? 0;
    return (
        <View style={{ backgroundColor: theme.panel, borderRadius: 20, borderWidth: 1, borderColor: theme.border, padding: 16, gap: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
                    <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 16 }} numberOfLines={2}>{a.title}</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                        <Badge label={type.label} color={type.color} />
                        <Badge label={`${a.filled}/${a.vacancies} filled`} color={theme.textMuted} />
                        {a.status === 'OPEN' ? <Badge label={closesLabel(a.closes)} color={theme.warning} /> : null}
                    </View>
                </View>
                <StatusPill tone={st.tone} label={st.label} />
            </View>

            {/* Funnel */}
            <View style={{ flexDirection: 'row', gap: 6 }}>
                {PIPELINE.map((s) => (
                    <View key={s} style={{ flex: 1, padding: 8, borderRadius: 12, backgroundColor: theme.surfaceAlt, alignItems: 'center' }}>
                        <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 16 }}>{a.pipeline?.[s] ?? 0}</Text>
                        <Text numberOfLines={1} style={{ color: theme.textMuted, fontFamily: theme.font.medium, fontSize: 10.5 }}>{APP_STATUS_META[s].label}</Text>
                    </View>
                ))}
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                    <Eye size={14} color={theme.textMuted} />
                    <Text style={{ color: theme.textMuted, fontFamily: theme.font.medium, fontSize: 12.5 }}>{a.views} views</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                    <Users size={14} color={theme.textMuted} />
                    <Text style={{ color: theme.textMuted, fontFamily: theme.font.medium, fontSize: 12.5 }}>{a.applications} applied</Text>
                </View>
                <Text style={{ color: theme.textMuted, fontFamily: theme.font.medium, fontSize: 12.5, marginLeft: 'auto' }}>Posted {fmtDate(a.created)}</Text>
            </View>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                <SoftButton label={newOnes ? `Applicants · ${newOnes} new` : 'Applicants'} icon={Inbox} onPress={onApplicants} style={{ flexGrow: 1 }} />
                <IconBtn icon={Pencil} label="Edit" onPress={onEdit} />
                <IconBtn icon={Share2} label="Share" onPress={onShare} />
                {a.status === 'OPEN' ? <IconBtn icon={Pause} label="Pause" onPress={onPause} /> : a.status !== 'FILLED' ? <IconBtn icon={Play} label="Open" onPress={onOpen} /> : null}
                {a.status === 'OPEN' || a.status === 'PAUSED' ? <IconBtn icon={XCircle} label="Close" onPress={onClose} danger /> : null}
            </View>
        </View>
    );
}

function IconBtn({ icon: Icon, label, onPress, danger }: { icon: any; label: string; onPress: () => void; danger?: boolean }) {
    const { theme } = useAuth();
    return (
        <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={{ height: 46, width: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: danger ? theme.dangerSoft : theme.surfaceAlt, ...pointer }}>
            <Icon size={17} color={danger ? theme.danger : theme.text} strokeWidth={2.2} />
        </Pressable>
    );
}

/* -------------------------------------------------------------- advert form */

const TYPE_OPTIONS: { value: EmploymentType; label: string }[] = [
    { value: 'PERMANENT', label: 'Permanent' },
    { value: 'LOCUM', label: 'Locum' },
    { value: 'CONTRACT', label: 'Contract' },
    { value: 'INTERNSHIP', label: 'Internship' },
    { value: 'TEMPORARY', label: 'Temporary' },
];
const PERIOD_OPTIONS: { value: PayPeriod; label: string }[] = [
    { value: 'HOUR', label: 'Hour' },
    { value: 'SHIFT', label: 'Shift' },
    { value: 'DAY', label: 'Day' },
    { value: 'WEEK', label: 'Week' },
    { value: 'MONTH', label: 'Month' },
    { value: 'YEAR', label: 'Year' },
];

const inDays = (n: number) => {
    const d = new Date(Date.now() + n * 86400000);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function blank(): AdvertInput {
    return { title: '', employment_type: 'PERMANENT', vacancies: '1', closes: inDays(21), status: 'OPEN', pay_period: 'MONTH', show_pay: true, requires_license: false, min_experience_years: '0' };
}

function fromAdvert(a: EmployerAdvert): AdvertInput {
    return {
        advert_id: a.id, title: a.title, employment_type: a.employment_type, vacancies: String(a.vacancies), closes: a.closes, status: a.status,
        designation_id: a.designation_id, cadre_id: a.cadre_id ?? undefined, description: a.description ?? '', responsibilities: a.responsibilities ?? '',
        requirements: a.requirements ?? '', benefits: a.benefits ?? '', work_location: a.work_location ?? '', pay_min: a.pay_min ?? '', pay_max: a.pay_max ?? '',
        pay_period: a.pay_period, show_pay: a.show_pay, starts_on: a.starts_on ?? '', ends_on: a.ends_on ?? '', shift_hours: a.shift_hours ?? '',
        min_experience_years: String(a.min_experience_years ?? 0), requires_license: a.requires_license, license_body: a.license_body ?? '', contact_email: a.contact_email ?? '',
    };
}

function AdvertForm({ visible, advert, lookups, onClose, onSaved }: { visible: boolean; advert: EmployerAdvert | null; lookups: JobLookups | null; onClose: () => void; onSaved: (a: EmployerAdvert) => void }) {
    const { isOnline } = useNetworkStatus();
    const [f, setF] = useState<AdvertInput>(blank());
    const [newRole, setNewRole] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [errs, setErrs] = useState<Record<string, string>>({});

    useEffect(() => {
        if (!visible) return;
        setF(advert ? fromAdvert(advert) : blank());
        setNewRole(!advert && !(lookups?.designations?.length));
        setError(null);
        setErrs({});
    }, [visible, advert, lookups]);

    const set = <K extends keyof AdvertInput>(k: K, v: AdvertInput[K]) => setF((p) => ({ ...p, [k]: v }));
    const locum = f.employment_type === 'LOCUM';

    const save = async (status?: AdvertStatus) => {
        const e: Record<string, string> = {};
        if (!f.title.trim()) e.title = 'Give the job a title';
        if (!(Number(f.vacancies) >= 1)) e.vacancies = 'At least 1';
        if (!f.closes) e.closes = 'Pick a closing date';
        if (newRole ? !f.designation_title?.trim() : !f.designation_id) e.designation = newRole ? 'Name the role' : 'Pick a role';
        if (locum && !f.starts_on) e.starts_on = 'Locum cover needs a start date';
        if (f.pay_min && f.pay_max && Number(f.pay_min) > Number(f.pay_max)) e.pay_max = 'Must be at least the minimum';
        if (f.requires_license && !f.license_body?.trim()) e.license_body = 'e.g. PPB, KMPDC, NCK';
        setErrs(e);
        if (Object.keys(e).length) {
            setError('Fix the highlighted fields.');
            return;
        }
        if (!isOnline) {
            setError("You're offline. Your draft stays here — save when you're back online.");
            return;
        }
        setBusy(true);
        setError(null);
        try {
            const body: AdvertInput = { ...f, status: status ?? f.status };
            if (newRole) delete body.designation_id;
            else delete body.designation_title;
            const res: any = await jobsApi.saveAdvert(body);
            if (isServerOk(res)) {
                toast.success(advert ? 'Advert updated' : body.status === 'DRAFT' ? 'Draft saved' : 'Advert is live', body.status === 'OPEN' ? 'Every WaziPOS user can see and share it now.' : undefined);
                onSaved(res.data.advert);
            } else setError(describeResponse(res, 'The advert was not saved.').message);
        } finally {
            setBusy(false);
        }
    };

    const roleOptions = (lookups?.designations ?? []).map((d) => ({ value: d.id, label: d.title, description: d.tenure }));
    const cadreOptions = [{ value: '', label: 'Any cadre' }, ...(lookups?.cadres ?? []).map((c) => ({ value: c.id, label: c.title }))];

    return (
        <AdminFormSheet
            visible={visible}
            onClose={onClose}
            title={advert ? 'Edit advert' : 'New job advert'}
            subtitle={advert ? advert.title : 'Permanent posts or locum cover'}
            icon="megaphone-outline"
            submitLabel={advert ? 'Save changes' : f.status === 'DRAFT' ? 'Save draft' : 'Publish'}
            submitting={busy}
            onSubmit={() => void save()}
            error={error}
            width={720}
        >
            <FormSection title="The role">
                <CustomTextField label="Job title" required value={f.title} onChangeText={(v) => set('title', v)} placeholder="e.g. Pharmaceutical Technologist" error={errs.title} />
                <ChoiceChips<EmploymentType> label="Type" required options={TYPE_OPTIONS} value={f.employment_type} onChange={(v) => { set('employment_type', v); set('pay_period', v === 'LOCUM' ? 'DAY' : 'MONTH'); }} />
                {newRole ? (
                    <CustomTextField label="Role / designation" required value={f.designation_title ?? ''} onChangeText={(v) => set('designation_title', v)} placeholder="e.g. Pharmacist" error={errs.designation} hint={roleOptions.length ? undefined : 'Added to your designations'} />
                ) : (
                    <SelectDropdown label="Role / designation" required options={roleOptions} value={f.designation_id ?? ''} onChange={(v) => set('designation_id', v)} error={errs.designation} placeholder="Pick one of your designations" />
                )}
                {roleOptions.length ? (
                    <Pressable onPress={() => setNewRole((n) => !n)} style={pointer}>
                        <Text style={{ color: '#2a6ff3', fontWeight: '700', fontSize: 12.5 }}>{newRole ? 'Pick an existing designation instead' : '+ A new role not in the list'}</Text>
                    </Pressable>
                ) : null}
                <FormRow>
                    <SelectDropdown label="Cadre" options={cadreOptions} value={f.cadre_id ?? ''} onChange={(v) => set('cadre_id', v || undefined)} placeholder="Any cadre" />
                    <CustomTextField label="Positions" required value={String(f.vacancies)} onChangeText={(v) => set('vacancies', v.replace(/\D/g, ''))} keyboardType="number-pad" error={errs.vacancies} />
                </FormRow>
                <FormRow>
                    <DateField label="Applications close" required value={f.closes} onChangeText={(v) => set('closes', v)} error={errs.closes} />
                    <CustomTextField label="Work location" value={f.work_location ?? ''} onChangeText={(v) => set('work_location', v)} placeholder="Defaults to your shop's town" />
                </FormRow>
            </FormSection>

            {locum ? (
                <FormSection title="Locum cover" hint="When you need someone, and the hours.">
                    <FormRow>
                        <DateField label="Starts" required value={f.starts_on ?? ''} onChangeText={(v) => set('starts_on', v)} error={errs.starts_on} />
                        <DateField label="Ends" value={f.ends_on ?? ''} onChangeText={(v) => set('ends_on', v)} />
                    </FormRow>
                    <CustomTextField label="Hours / shifts" value={f.shift_hours ?? ''} onChangeText={(v) => set('shift_hours', v)} placeholder="e.g. Weekends 8am – 6pm" />
                </FormSection>
            ) : null}

            <FormSection title="Pay">
                <FormRow>
                    <CustomTextField label="From (KES)" value={f.pay_min ?? ''} onChangeText={(v) => set('pay_min', v.replace(/[^\d.]/g, ''))} keyboardType="numeric" placeholder="Optional" />
                    <CustomTextField label="To (KES)" value={f.pay_max ?? ''} onChangeText={(v) => set('pay_max', v.replace(/[^\d.]/g, ''))} keyboardType="numeric" placeholder="Optional" error={errs.pay_max} />
                </FormRow>
                <ChoiceChips<PayPeriod> label="Per" options={PERIOD_OPTIONS} value={f.pay_period} onChange={(v) => set('pay_period', v)} />
                <SwitchField label="Show pay on the board" value={!!f.show_pay} onChange={(v) => set('show_pay', v)} hint="Adverts with pay get more applicants." />
            </FormSection>

            <FormSection title="Who you're looking for">
                <FormRow>
                    <CustomTextField label="Minimum experience (years)" value={String(f.min_experience_years ?? '0')} onChangeText={(v) => set('min_experience_years', v.replace(/\D/g, ''))} keyboardType="number-pad" />
                    <CustomTextField label="Contact email (optional)" value={f.contact_email ?? ''} onChangeText={(v) => set('contact_email', v)} keyboardType="email-address" autoCapitalize="none" />
                </FormRow>
                <SwitchField label="Needs a practising licence" value={!!f.requires_license} onChange={(v) => set('requires_license', v)} hint="Applicants must give their licence number." />
                {f.requires_license ? <CustomTextField label="Licensing body" required value={f.license_body ?? ''} onChangeText={(v) => set('license_body', v)} placeholder="e.g. PPB, KMPDC, NCK" error={errs.license_body} /> : null}
                <CustomTextField label="About the role" value={f.description ?? ''} onChangeText={(v) => set('description', v)} multiline numberOfLines={4} maxLength={8000} placeholder="What the business does and what this person will be part of." />
                <CustomTextField label="Responsibilities" value={f.responsibilities ?? ''} onChangeText={(v) => set('responsibilities', v)} multiline numberOfLines={4} maxLength={6000} placeholder="One per line" />
                <CustomTextField label="Requirements" value={f.requirements ?? ''} onChangeText={(v) => set('requirements', v)} multiline numberOfLines={4} maxLength={6000} placeholder="Qualifications, skills, registration" />
                <CustomTextField label="Benefits" value={f.benefits ?? ''} onChangeText={(v) => set('benefits', v)} multiline numberOfLines={3} maxLength={4000} placeholder="Optional" />
            </FormSection>

            <FormSection title="Publishing">
                <ChoiceChips<AdvertStatus>
                    options={[{ value: 'OPEN', label: 'Publish now' }, { value: 'DRAFT', label: 'Save as draft' }, ...(advert && advert.status !== 'OPEN' && advert.status !== 'DRAFT' ? [{ value: advert.status, label: STATUS_META[advert.status].label }] : [])]}
                    value={f.status}
                    onChange={(v) => set('status', v)}
                />
            </FormSection>
        </AdminFormSheet>
    );
}

/* -------------------------------------------------------------- applicants */

function ApplicantsSheet({ advert, onClose, onChanged }: { advert: EmployerAdvert | null; onClose: () => void; onChanged: () => void }) {
    const { theme } = useAuth();
    const { isOnline } = useNetworkStatus();
    const [rows, setRows] = useState<JobApplication[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [filter, setFilter] = useState<'ALL' | ApplicationStatus>('ALL');
    const [openId, setOpenId] = useState<string | null>(null);

    const load = async () => {
        if (!advert) return;
        setError(null);
        const res: any = await jobsApi.applications(advert.id).catch(() => null);
        if (isServerOk(res)) setRows(res.data.pipeline.applications);
        else {
            setRows((r) => r ?? []);
            setError(describeResponse(res, 'Could not load applicants.').message);
        }
    };

    useEffect(() => {
        setRows(null);
        setFilter('ALL');
        setOpenId(null);
        if (advert) void load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [advert?.id]);

    const counts = useMemo(() => {
        const c: Record<string, number> = {};
        (rows ?? []).forEach((r) => (c[r.status] = (c[r.status] ?? 0) + 1));
        return c;
    }, [rows]);
    const shown = (rows ?? []).filter((r) => filter === 'ALL' || r.status === filter);

    return (
        <AdminSheet visible={!!advert} onClose={onClose} title="Applicants" subtitle={advert?.title} icon="people-outline" width={760}>
            <View style={{ gap: 12 }}>
                {!isOnline ? <OfflineNotice title="Offline" message="Reviewing applicants needs a connection." /> : null}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                    {(['ALL', ...PIPELINE, 'REJECTED'] as ('ALL' | ApplicationStatus)[]).map((s) => {
                        const on = filter === s;
                        const n = s === 'ALL' ? rows?.length ?? 0 : counts[s] ?? 0;
                        return (
                            <Pressable key={s} onPress={() => setFilter(s)} style={{ height: 34, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1.5, borderColor: on ? theme.primary : theme.border, backgroundColor: on ? theme.primarySoft : theme.panel, justifyContent: 'center', ...pointer }}>
                                <Text style={{ color: on ? theme.primary : theme.text, fontFamily: theme.font.bold, fontSize: 12.5 }}>{s === 'ALL' ? 'All' : APP_STATUS_META[s].label} · {n}</Text>
                            </Pressable>
                        );
                    })}
                </ScrollView>
                {error ? <InlineNotice tone="danger" message={error} /> : null}
                {rows === null ? <ActivityIndicator color={theme.primary} style={{ marginVertical: 30 }} /> : null}
                {rows && !shown.length ? (
                    <Text style={{ color: theme.textMuted, fontFamily: theme.font.medium, textAlign: 'center', paddingVertical: 30 }}>
                        {rows.length ? 'Nobody at this stage.' : 'No applications yet — share the advert to reach more people.'}
                    </Text>
                ) : null}
                {shown.map((app) => (
                    <ApplicantRow
                        key={app.id}
                        app={app}
                        open={openId === app.id}
                        onToggle={() => setOpenId((id) => (id === app.id ? null : app.id))}
                        onUpdated={(next) => {
                            setRows((r) => (r ?? []).map((x) => (x.id === next.id ? next : x)));
                            onChanged();
                        }}
                    />
                ))}
            </View>
        </AdminSheet>
    );
}

function ApplicantRow({ app, open, onToggle, onUpdated }: { app: JobApplication; open: boolean; onToggle: () => void; onUpdated: (a: JobApplication) => void }) {
    const { theme } = useAuth();
    const { isOnline } = useNetworkStatus();
    const meta = APP_STATUS_META[app.status];
    const [notes, setNotes] = useState(app.employer_notes ?? '');
    const [message, setMessage] = useState('');
    const [when, setWhen] = useState(localInput(app.interview_at));
    const [where, setWhere] = useState(app.interview_location ?? '');
    const [busy, setBusy] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const name = app.applicant?.name ?? 'Applicant';

    const move = async (status?: ApplicationStatus) => {
        if (!isOnline) return setError("You're offline — connect to update this applicant.");
        if (status === 'INTERVIEW' && !/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(when.trim())) return setError('Set the interview date and time as YYYY-MM-DD HH:MM.');
        setBusy(status ?? 'save');
        setError(null);
        try {
            const res: any = await jobsApi.updateApplication({
                application_id: app.id,
                status,
                employer_notes: notes,
                ...(status === 'INTERVIEW' || when ? { interview_at: when ? new Date(when.trim().replace(' ', 'T')).toISOString() : undefined, interview_location: where } : {}),
                ...(message.trim() ? { message: message.trim() } : {}),
            });
            if (isServerOk(res)) {
                onUpdated(res.data.application);
                setMessage('');
                toast.success(status ? `${name}: ${APP_STATUS_META[status].label}` : 'Saved', status && status !== 'REJECTED' ? `${name} was notified.` : undefined);
            } else setError(describeResponse(res, 'Not updated.').message);
        } finally {
            setBusy(null);
        }
    };

    return (
        <View style={{ borderRadius: 18, borderWidth: 1, borderColor: open ? theme.primary : theme.border, backgroundColor: theme.panel, overflow: 'hidden' }}>
            <Pressable onPress={onToggle} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, ...pointer }}>
                <View style={{ width: 40, height: 40, borderRadius: 13, backgroundColor: theme.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: theme.primary, fontFamily: theme.font.bold, fontSize: 15 }}>{name.charAt(0).toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                    <Text numberOfLines={1} style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 14.5 }}>{name}</Text>
                    <Text numberOfLines={1} style={{ color: theme.textMuted, fontFamily: theme.font.medium, fontSize: 12.5 }}>
                        {app.years_experience} yrs{app.license_number ? ` · Lic ${app.license_number}` : ''} · {fmtDate(app.created)}
                    </Text>
                </View>
                <StatusPill tone={meta.tone === 'muted' ? 'info' : meta.tone} label={meta.label} />
            </Pressable>

            {open ? (
                <View style={{ paddingHorizontal: 14, paddingBottom: 14, gap: 12 }}>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                        <Contact icon={Phone} label={app.phone} onPress={() => Linking.openURL(`tel:${app.phone}`)} />
                        {app.email ? <Contact icon={Mail} label={app.email} onPress={() => Linking.openURL(`mailto:${app.email}`)} /> : null}
                        {app.cv ? <Contact icon={FileText} label="Open CV" onPress={() => Linking.openURL(app.cv!)} /> : null}
                        {app.wazi_cv ? <Contact icon={FileText} label="WaziPOS CV" onPress={() => Linking.openURL(app.wazi_cv!)} /> : null}
                    </View>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
                        {app.available_from ? <Detail label="Available" value={fmtDate(app.available_from, true)} /> : null}
                        {app.expected_pay ? <Detail label="Expects" value={`KES ${Number(app.expected_pay).toLocaleString('en-KE')}`} /> : null}
                        {app.applicant?.education_level && app.applicant.education_level !== 'Not-Specified' ? <Detail label="Education" value={app.applicant.education_level} /> : null}
                        {app.interview_at ? <Detail label="Interview" value={`${fmtDateTime(app.interview_at)}${app.interview_location ? ` · ${app.interview_location}` : ''}`} /> : null}
                    </View>
                    {app.cover_note ? (
                        <View style={{ padding: 12, borderRadius: 14, backgroundColor: theme.surfaceAlt }}>
                            <Text style={{ color: theme.text, fontFamily: theme.font.regular, fontSize: 13.5, lineHeight: 20 }}>{app.cover_note}</Text>
                        </View>
                    ) : null}

                    {NEXT[app.status].includes('INTERVIEW') || app.status === 'INTERVIEW' ? (
                        <FormRow>
                            <CustomTextField label="Interview (YYYY-MM-DD HH:MM)" value={when} onChangeText={setWhen} placeholder="2026-12-01 10:00" />
                            <CustomTextField label="Where" value={where} onChangeText={setWhere} placeholder="e.g. Main branch, or a Google Meet link" />
                        </FormRow>
                    ) : null}
                    <CustomTextField label="Private notes" value={notes} onChangeText={setNotes} multiline numberOfLines={2} placeholder="Only your team sees these" />
                    {NEXT[app.status].length ? <CustomTextField label="Message to the applicant (optional)" value={message} onChangeText={setMessage} multiline numberOfLines={2} placeholder="Sent with the update" /> : null}
                    {error ? <InlineNotice tone="danger" message={error} /> : null}

                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                        {NEXT[app.status].map((s) => (
                            <SoftButton
                                key={s}
                                label={busy === s ? 'Saving…' : ACTION_LABEL[s] ?? s}
                                tone={s === 'REJECTED' ? 'danger' : s === 'HIRED' || s === 'OFFERED' ? 'navy' : 'primary'}
                                onPress={() => void move(s)}
                                disabled={!!busy}
                                style={{ flexGrow: 1 }}
                            />
                        ))}
                        <SoftButton label={busy === 'save' ? 'Saving…' : 'Save notes'} tone="neutral" onPress={() => void move()} disabled={!!busy} />
                    </View>
                    {app.status === 'HIRED' ? (
                        <InlineNotice tone="success" message={`Hired. Add ${name} as an employee under Administration → Employees to give them a login role at your shop.`} />
                    ) : null}
                </View>
            ) : null}
        </View>
    );
}

/** ISO → "YYYY-MM-DD HH:MM" in local time (what the field shows and sends back). */
function localInput(iso?: string | null) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function Contact({ icon: Icon, label, onPress }: { icon: any; label: string; onPress: () => void }) {
    const { theme } = useAuth();
    return (
        <Pressable onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, paddingHorizontal: 12, borderRadius: 12, backgroundColor: theme.primarySoft, ...pointer }}>
            <Icon size={14} color={theme.primary} strokeWidth={2.3} />
            <Text numberOfLines={1} style={{ color: theme.primary, fontFamily: theme.font.semibold, fontSize: 12.5, maxWidth: 220 }}>{label}</Text>
        </Pressable>
    );
}

function Detail({ label, value }: { label: string; value: string }) {
    const { theme } = useAuth();
    return (
        <View>
            <Text style={{ color: theme.textMuted, fontFamily: theme.font.semibold, fontSize: 10.5, letterSpacing: 0.5, textTransform: 'uppercase' }}>{label}</Text>
            <Text style={{ color: theme.text, fontFamily: theme.font.semibold, fontSize: 13.5 }}>{value}</Text>
        </View>
    );
}


