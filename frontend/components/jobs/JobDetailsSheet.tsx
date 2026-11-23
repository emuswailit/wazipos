// components/jobs/JobDetailsSheet.tsx
//
// One job: full details, share / save, and the application form (step two of the
// same sheet). Details are saved on the device, so a job opened before still
// shows offline; applying needs a connection and says so.

import jobsApi, { type CvSummary, type JobCard, type JobDetails } from '@/api/jobsApi';
import { useRouter } from 'expo-router';
import { pickImage } from '@/components/common/imagePicker';
import { AdminSheet, SheetButton } from '@/components/common/listScreen';
import { CustomTextField } from '@/components/common/CustomTextField';
import { toast } from '@/components/common/Toast';
import { InlineNotice, OfflineNotice, PrimaryCTA } from '@/components/ui/pos';
import { useAuth } from '@/context/AuthContext';
import { useNetworkStatus } from '@/context/NetworkMonitorContext';
import { describeResponse } from '@/utils/apiFeedback';
import { isServerOk } from '@/utils/serverResponse';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Briefcase, CalendarClock, Sparkles, Clock, FileText, GraduationCap, MapPin, Paperclip, Send, ShieldCheck, Users, Wallet, X } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, Text, View } from 'react-native';

import { APP_STATUS_META, Badge, closesLabel, EntityAvatar, fmtDate, fmtDateTime, pointer, shareJob, toneColor, TYPE_META } from './jobsShared';

const detailKey = (id: string) => `wazipos_job_detail_v1:${id}`;

interface Props {
    visible: boolean;
    /** Open by id (from the board) or by share code (from a link). */
    advertId?: string | null;
    code?: string | null;
    /** The card already on screen — shown at once while details load (and offline). */
    initial?: JobCard | null;
    onClose: () => void;
    onApplied?: (advertId: string) => void;
    saved?: boolean;
    onToggleSave?: (job: JobCard) => void;
}

export default function JobDetailsSheet({ visible, advertId, code, initial, onClose, onApplied, saved, onToggleSave }: Props) {
    const { theme, user } = useAuth() as any;
    const router = useRouter();
    const { isOnline } = useNetworkStatus();
    const [job, setJob] = useState<JobDetails | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [step, setStep] = useState<'view' | 'apply'>('view');

    const load = async () => {
        const id = advertId ?? initial?.id ?? null;
        setError(null);
        // Saved copy first (instant, and the offline view).
        if (id) {
            const raw = await AsyncStorage.getItem(detailKey(id)).catch(() => null);
            if (raw) {
                try {
                    setJob(JSON.parse(raw));
                } catch {
                    /* stale copy */
                }
            }
        }
        if (!isOnline) return;
        setLoading(true);
        try {
            const res: any = await jobsApi.details(id ? { advert_id: id } : { code: code ?? undefined });
            if (isServerOk(res)) {
                const d: JobDetails = res.data.job;
                setJob(d);
                AsyncStorage.setItem(detailKey(d.id), JSON.stringify(d)).catch(() => undefined);
            } else {
                setError(describeResponse(res, 'Could not open this job.').message);
            }
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!visible) return;
        setStep('view');
        setJob(null);
        void load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visible, advertId, code]);

    const card: JobCard | null = job ?? initial ?? null;
    const type = card ? TYPE_META[card.employment_type] ?? TYPE_META.PERMANENT : null;
    const mine = job?.my_application && job.my_application.status !== 'WITHDRAWN' ? job.my_application : null;
    const canApply = !!job && job.is_open && !mine && !job.is_employer;

    const footer =
        step === 'apply' || !card ? undefined : (
            <View style={{ flexDirection: 'row', gap: 8, flex: 1 }}>
                <SheetButton label="Share" icon="share-social-outline" variant="ghost" onPress={() => void shareJob(card)} />
                {onToggleSave ? <SheetButton label={saved ? 'Saved' : 'Save'} icon={saved ? 'bookmark' : 'bookmark-outline'} variant="secondary" onPress={() => onToggleSave(card)} /> : null}
                <View style={{ flex: 1 }}>
                    {mine ? (
                        <SheetButton label={`Applied · ${APP_STATUS_META[mine.status].label}`} icon="checkmark-circle" variant="secondary" onPress={onClose} grow />
                    ) : (
                        <SheetButton
                            label={job?.is_employer ? 'Your business’s advert' : !job ? (isOnline ? 'Loading…' : 'Connect to apply') : job.is_open ? 'Apply now' : 'Closed'}
                            icon="send"
                            disabled={!canApply}
                            onPress={() => setStep('apply')}
                            grow
                        />
                    )}
                </View>
            </View>
        );

    return (
        <AdminSheet
            visible={visible}
            onClose={onClose}
            title={step === 'apply' ? 'Apply' : card?.title ?? 'Job'}
            subtitle={card?.entity.title}
            icon="briefcase-outline"
            width={680}
            footer={footer}
        >
            {!card ? (
                <View style={{ paddingVertical: 40, alignItems: 'center', gap: 12 }}>
                    {error ? <InlineNotice tone="danger" message={error} /> : !isOnline ? <OfflineNotice title="You're offline" message="Connect to open this job — it will be saved on this device for next time." /> : <ActivityIndicator color={theme.primary} />}
                </View>
            ) : step === 'apply' && job ? (
                <ApplyForm job={job} user={user} onBack={() => setStep('view')} onDone={() => { onApplied?.(job.id); void load(); }} />
            ) : (
                <View style={{ gap: 18 }}>
                    {/* Hero */}
                    <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
                        <EntityAvatar title={card.entity.title} logo={card.entity.logo} size={58} />
                        <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
                            <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 20, letterSpacing: -0.3 }}>{card.title}</Text>
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                                {type ? <Badge label={type.label} color={type.color} /> : null}
                                {card.cadre ? <Badge label={card.cadre.title} color={theme.textMuted} /> : null}
                                <Badge label={closesLabel(card.closes)} color={card.is_open ? theme.warning : theme.danger} />
                            </View>
                        </View>
                    </View>

                    {!isOnline && !job ? <OfflineNotice title="Saved details only" message="You're offline — this is what was saved on this device. Connect to see everything and apply." /> : null}
                    {error ? <InlineNotice tone="danger" message={error} /> : null}
                    {job?.closed_notice ? <InlineNotice tone="warning" message={job.closed_notice} /> : null}

                    {mine ? (
                        <View style={{ padding: 14, borderRadius: 16, backgroundColor: `${toneColor(theme, APP_STATUS_META[mine.status].tone)}14`, gap: 4 }}>
                            <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 14 }}>Your application · {APP_STATUS_META[mine.status].label}</Text>
                            {mine.status === 'INTERVIEW' && mine.interview_at ? (
                                <Text style={{ color: theme.text, fontFamily: theme.font.medium, fontSize: 13 }}>
                                    Interview {fmtDateTime(mine.interview_at)}{mine.interview_location ? ` · ${mine.interview_location}` : ''}
                                </Text>
                            ) : (
                                <Text style={{ color: theme.textMuted, fontFamily: theme.font.regular, fontSize: 12.5 }}>Sent {fmtDate(mine.created, true)} · we'll tell you by email and notification when it moves.</Text>
                            )}
                            {mine.message ? <Text style={{ color: theme.text, fontFamily: theme.font.regular, fontSize: 13, marginTop: 4 }}>“{mine.message}”</Text> : null}
                        </View>
                    ) : null}

                    {/* Facts grid */}
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                        <Fact icon={MapPin} label="Location" value={card.location || '—'} />
                        <Fact icon={Wallet} label="Pay" value={card.pay || 'Not disclosed'} />
                        <Fact icon={Users} label="Positions" value={String(card.vacancies)} />
                        <Fact icon={GraduationCap} label="Experience" value={card.min_experience_years ? `${card.min_experience_years}+ years` : 'Any'} />
                        {card.employment_type === 'LOCUM' || card.starts_on ? (
                            <Fact icon={CalendarClock} label="Dates" value={card.starts_on ? `${fmtDate(card.starts_on)}${card.ends_on ? ` – ${fmtDate(card.ends_on)}` : ''}` : '—'} />
                        ) : null}
                        {card.shift_hours ? <Fact icon={Clock} label="Hours" value={card.shift_hours} /> : null}
                        {card.requires_license ? <Fact icon={ShieldCheck} label="Licence" value={card.license_body ? `${card.license_body} practising licence` : 'Practising licence'} /> : null}
                    </View>

                    {loading && !job ? <ActivityIndicator color={theme.primary} /> : null}
                    <Section title="About the role" body={job?.description ?? card.excerpt} />
                    <Section title="What you'll do" body={job?.responsibilities} />
                    <Section title="What we're looking for" body={job?.requirements} />
                    <Section title="Benefits" body={job?.benefits} />
                    {job && job.is_open && !job.is_employer ? (
                        <Pressable onPress={() => { onClose(); router.push(`/myCv?advert=${job.id}&title=${encodeURIComponent(job.title)}` as any); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 16, backgroundColor: '#8b5cf614', ...pointer }}>
                            <Sparkles size={18} color="#8b5cf6" />
                            <Text style={{ flex: 1, color: theme.text, fontFamily: theme.font.semibold, fontSize: 13.5 }}>Tailor my CV to this job with the AI assistant</Text>
                        </Pressable>
                    ) : null}
                </View>
            )}
        </AdminSheet>
    );
}

function Fact({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
    const { theme } = useAuth();
    return (
        <View style={{ flexGrow: 1, flexBasis: '45%', minWidth: 140, flexDirection: 'row', gap: 10, padding: 12, borderRadius: 14, backgroundColor: theme.surfaceAlt }}>
            <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: theme.panel, alignItems: 'center', justifyContent: 'center' }}>
                <Icon size={16} color={theme.primary} strokeWidth={2.2} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ color: theme.textMuted, fontFamily: theme.font.semibold, fontSize: 10.5, letterSpacing: 0.5, textTransform: 'uppercase' }}>{label}</Text>
                <Text style={{ color: theme.text, fontFamily: theme.font.semibold, fontSize: 13.5, marginTop: 1 }}>{value}</Text>
            </View>
        </View>
    );
}

function Section({ title, body }: { title: string; body?: string | null }) {
    const { theme } = useAuth();
    if (!body || !body.trim()) return null;
    return (
        <View style={{ gap: 6 }}>
            <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 15 }}>{title}</Text>
            <Text style={{ color: theme.textMuted, fontFamily: theme.font.regular, fontSize: 14, lineHeight: 21 }}>{body.trim()}</Text>
        </View>
    );
}

/* -------------------------------------------------------------- apply */

function ApplyForm({ job, user, onBack, onDone }: { job: JobDetails; user: any; onBack: () => void; onDone: () => void }) {
    const { theme } = useAuth();
    const router = useRouter();
    const { isOnline } = useNetworkStatus();
    const [phone, setPhone] = useState(String(user?.phone ?? ''));
    const [email, setEmail] = useState(String(user?.email ?? ''));
    const [license, setLicense] = useState('');
    const [years, setYears] = useState('');
    const [available, setAvailable] = useState('');
    const [pay, setPay] = useState('');
    const [cover, setCover] = useState('');
    const [cv, setCv] = useState<{ file: any; name: string } | null>(null);
    const [myCvs, setMyCvs] = useState<CvSummary[]>([]);
    const [waziCv, setWaziCv] = useState<string | null>(null);
    useEffect(() => {
        jobsApi.myCvs().then((res: any) => {
            if (isServerOk(res)) {
                setMyCvs(res.data.cvs);
                if (res.data.cvs[0]) setWaziCv(res.data.cvs[0].id);
            }
        }).catch(() => undefined);
    }, []);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [fieldErr, setFieldErr] = useState<Record<string, string>>({});

    const pickCv = async () => {
        if (Platform.OS === 'web') {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.pdf,.doc,.docx,image/*';
            input.onchange = () => {
                const f = input.files?.[0];
                if (!f) return;
                if (f.size > 5 * 1024 * 1024) return toast.warning('CV too large', 'Choose a file of 5 MB or less.');
                setCv({ file: f, name: f.name });
            };
            input.click();
            return;
        }
        const img = await pickImage({ allowsEditing: false, quality: 0.8 });
        if (img) setCv({ file: img.file, name: img.name });
    };

    const submit = async () => {
        const errs: Record<string, string> = {};
        const digits = phone.replace(/\D/g, '');
        if (digits.length < 9) errs.phone = 'Enter a phone number employers can call';
        if (job.requires_license && !license.trim()) errs.license = `Enter your ${job.license_body ? `${job.license_body} ` : ''}licence number`;
        if (years && !/^\d{1,2}$/.test(years.trim())) errs.years = 'Whole years, e.g. 3';
        if (available && !/^\d{4}-\d{2}-\d{2}$/.test(available.trim())) errs.available = 'Use YYYY-MM-DD';
        setFieldErr(errs);
        if (Object.keys(errs).length) return;
        if (!isOnline) {
            setError("You're offline. Your answers stay here — send when you're back online.");
            return;
        }
        setBusy(true);
        setError(null);
        try {
            const res: any = await jobsApi.apply({
                advert_id: job.id,
                phone: phone.trim(),
                email: email.trim() || undefined,
                license_number: license.trim() || undefined,
                years_experience: years.trim() || undefined,
                available_from: available.trim() || undefined,
                expected_pay: pay.trim() || undefined,
                cover_note: cover.trim() || undefined,
                cv: cv?.file,
                cv_id: waziCv ?? undefined,
            });
            if (isServerOk(res)) {
                toast.success('Application sent', `${job.entity.title} will be in touch. Follow it under My applications.`);
                onDone();
            } else {
                const d = describeResponse(res, 'Your application was not sent.');
                setError(d.message);
                if (d.tone !== 'offline') toast.fromResponse(res, 'Your application was not sent.');
            }
        } finally {
            setBusy(false);
        }
    };

    return (
        <View style={{ gap: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 16, backgroundColor: theme.primarySoft }}>
                <Briefcase size={18} color={theme.primary} />
                <Text style={{ flex: 1, color: theme.text, fontFamily: theme.font.semibold, fontSize: 13.5 }} numberOfLines={2}>
                    {job.title} · {job.entity.title}
                </Text>
                <Pressable onPress={onBack} hitSlop={8} accessibilityLabel="Back to the job" style={pointer}>
                    <X size={18} color={theme.textMuted} />
                </Pressable>
            </View>

            <CustomTextField label="Phone" required value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="07…" error={fieldErr.phone} />
            <CustomTextField label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" placeholder="you@example.com" />
            {job.requires_license ? (
                <CustomTextField label={`${job.license_body ? `${job.license_body} ` : ''}licence number`} required value={license} onChangeText={setLicense} autoCapitalize="characters" error={fieldErr.license} />
            ) : (
                <CustomTextField label="Professional registration (optional)" value={license} onChangeText={setLicense} autoCapitalize="characters" />
            )}
            <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}>
                    <CustomTextField label="Years of experience" value={years} onChangeText={setYears} keyboardType="number-pad" placeholder="e.g. 3" error={fieldErr.years} hint={job.min_experience_years ? `Asks for ${job.min_experience_years}+` : undefined} />
                </View>
                <View style={{ flex: 1 }}>
                    <CustomTextField label="Available from" value={available} onChangeText={setAvailable} placeholder="YYYY-MM-DD" error={fieldErr.available} />
                </View>
            </View>
            <CustomTextField label={`Expected pay (KES${job.pay_period ? ` per ${job.pay_period.toLowerCase()}` : ''})`} value={pay} onChangeText={setPay} keyboardType="numeric" placeholder="Optional" />
            <CustomTextField label="Why you're a great fit" value={cover} onChangeText={setCover} multiline numberOfLines={5} maxLength={3000} placeholder="A few lines about your experience and why this role." />

            {myCvs.length ? (
                <View style={{ gap: 8 }}>
                    <Text style={{ color: theme.textDark, fontFamily: theme.font.bold, fontSize: 11, letterSpacing: 0.6 }}>ATTACH YOUR WAZIPOS CV</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                        {[...myCvs.map((c) => ({ id: c.id as string | null, label: c.title })), { id: null, label: 'None' }].map((o) => {
                            const on = waziCv === o.id;
                            return (
                                <Pressable key={o.id ?? 'none'} onPress={() => setWaziCv(o.id)} style={{ height: 36, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1.5, borderColor: on ? theme.primary : theme.border, backgroundColor: on ? theme.primarySoft : theme.panel, justifyContent: 'center', ...pointer }}>
                                    <Text style={{ color: on ? theme.primary : theme.text, fontFamily: theme.font.bold, fontSize: 12.5 }}>{o.label}</Text>
                                </Pressable>
                            );
                        })}
                    </View>
                    <Text style={{ color: theme.textMuted, fontFamily: theme.font.regular, fontSize: 11.5 }}>The employer gets a link to view and print it.</Text>
                </View>
            ) : (
                <Pressable onPress={() => router.push('/myCv' as any)} style={{ ...pointer }}>
                    <Text style={{ color: theme.primary, fontFamily: theme.font.bold, fontSize: 13 }}>No CV yet? Build one with the AI assistant →</Text>
                </Pressable>
            )}

            <Pressable onPress={() => void pickCv()} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, borderWidth: 1.5, borderStyle: 'dashed', borderColor: cv ? theme.success : theme.border, backgroundColor: cv ? `${theme.success}10` : 'transparent', ...pointer }}>
                {cv ? <FileText size={20} color={theme.success} /> : <Paperclip size={20} color={theme.textMuted} />}
                <View style={{ flex: 1 }}>
                    <Text style={{ color: theme.text, fontFamily: theme.font.semibold, fontSize: 13.5 }} numberOfLines={1}>{cv ? cv.name : 'Attach your CV (optional)'}</Text>
                    <Text style={{ color: theme.textMuted, fontFamily: theme.font.regular, fontSize: 12 }}>{Platform.OS === 'web' ? 'PDF, Word or a photo · up to 5 MB' : 'A clear photo of your CV · up to 5 MB'}</Text>
                </View>
                {cv ? (
                    <Pressable onPress={() => setCv(null)} hitSlop={8} accessibilityLabel="Remove CV" style={pointer}>
                        <X size={16} color={theme.textMuted} />
                    </Pressable>
                ) : null}
            </Pressable>

            {error ? <InlineNotice tone="danger" message={error} /> : null}
            <PrimaryCTA label={isOnline ? 'Send application' : 'Offline — connect to send'} icon={Send} onPress={() => void submit()} loading={busy} disabled={!isOnline} />
            <Text style={{ color: theme.textMuted, fontFamily: theme.font.regular, fontSize: 11.5, textAlign: 'center' }}>
                {job.entity.title} sees your name, contacts and what you enter here.
            </Text>
        </View>
    );
}

