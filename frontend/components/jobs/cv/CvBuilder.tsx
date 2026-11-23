// components/jobs/cv/CvBuilder.tsx
//
// Jobs → My CV. Build a CV from a form of repeatable sections, with an AI assistant:
//   ✨ Draft my CV from notes · ✨ Write my summary · ✨ Improve bullets · ✨ Suggest skills
//   ✨ Tailor to a job (?advert=<id>) · ✨ Review my CV
// Then preview, save as PDF, print, and share — the PDF itself on phones (WhatsApp,
// email…), or a link on any device. Drafts autosave on the device, so the form works
// offline; saving to WaziPOS (and the assistant) needs a connection.

import jobsApi, { type CvData, type CvExtra, type CvRecord, type CvSummary, type CvTask, type CvTemplate } from '@/api/jobsApi';
import { useAlert } from '@/components/common/AlertProvider';
import { CustomTextField } from '@/components/common/CustomTextField';
import { AdminSheet, FormRow } from '@/components/common/listScreen';
import { SwitchField } from '@/components/common/SwitchField';
import { toast } from '@/components/common/Toast';
import { InlineNotice, OfflineNotice, PosHeader, PrimaryCTA, SoftButton } from '@/components/ui/pos';
import { useAuth } from '@/context/AuthContext';
import { useNetworkStatus } from '@/context/NetworkMonitorContext';
import { describeResponse } from '@/utils/apiFeedback';
import { isServerOk } from '@/utils/serverResponse';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowDown, ArrowUp, Eye, FileDown, FileText, Link2, Mail, MessageCircle, Plus, Printer, Save, Sparkles, Trash2, Wand2, X } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, Text, View } from 'react-native';

import { buildCvHtml, cvFileName, EMPTY_CV, normalizeCv } from './cvHtml';
import { printCv, shareLink, sharePdf } from './cvExport';

const isWeb = Platform.OS === 'web';
const pointer = isWeb ? ({ cursor: 'pointer' } as any) : null;
const AI = '#8b5cf6';
const ACCENTS = ['#2a6ff3', '#0f766e', '#7c3aed', '#be123c', '#c2410c', '#0b1733'];
const TEMPLATES: { key: CvTemplate; label: string }[] = [
    { key: 'modern', label: 'Modern' },
    { key: 'classic', label: 'Classic' },
    { key: 'compact', label: 'Compact' },
];
const draftKey = (id: string | null) => `wazipos_cv_draft_v1:${id ?? 'new'}`;
const lines = (t: string) => t.split('\n').map((x) => x.replace(/^[•\-*]\s*/, '').trim()).filter(Boolean);

interface Draft {
    title: string;
    template: CvTemplate;
    accent: string;
    data: CvData;
    saved_at: string;
}

export default function CvBuilder() {
    const { theme } = useAuth();
    const params = useLocalSearchParams<{ cv?: string; advert?: string; title?: string }>();
    const [list, setList] = useState<CvSummary[] | null>(null);
    const [openId, setOpenId] = useState<string | 'new' | null>(params.cv ? String(params.cv) : null);
    const { isOnline } = useNetworkStatus();

    const loadList = useCallback(async () => {
        const res: any = await jobsApi.myCvs().catch(() => null);
        if (isServerOk(res)) {
            setList(res.data.cvs);
            AsyncStorage.setItem('wazipos_cv_list_v1', JSON.stringify(res.data.cvs)).catch(() => undefined);
        } else {
            const raw = await AsyncStorage.getItem('wazipos_cv_list_v1').catch(() => null);
            setList(raw ? JSON.parse(raw) : []);
        }
    }, []);
    useEffect(() => {
        void loadList();
    }, [loadList, isOnline]);

    if (openId) {
        return <CvEditor cvId={openId === 'new' ? null : openId} advertId={params.advert ? String(params.advert) : null} advertTitle={params.title ? String(params.title) : null} onClose={() => { setOpenId(null); void loadList(); }} />;
    }

    return (
        <ScrollView style={{ flex: 1, backgroundColor: theme.background }} contentContainerStyle={{ padding: 16, paddingBottom: 40, maxWidth: 900, width: '100%', alignSelf: 'center' }}>
            <PosHeader icon={FileText} title="My CV" subtitle="Build it with the AI assistant, then save, print or share as PDF" right={<SoftButton label="New CV" icon={Plus} tone="navy" onPress={() => setOpenId('new')} />} />
            {!isOnline ? <OfflineNotice title="Offline" message="You can edit and make PDFs offline; saving and the assistant need a connection." /> : null}
            {list === null ? <ActivityIndicator color={theme.primary} style={{ marginTop: 40 }} /> : null}
            {list && !list.length ? (
                <Pressable onPress={() => setOpenId('new')} style={{ marginTop: 10, padding: 24, borderRadius: 24, borderWidth: 1.5, borderStyle: 'dashed', borderColor: AI, backgroundColor: `${AI}0d`, alignItems: 'center', gap: 10, ...pointer }}>
                    <View style={{ width: 60, height: 60, borderRadius: 20, backgroundColor: AI, alignItems: 'center', justifyContent: 'center' }}>
                        <Sparkles size={28} color="#fff" />
                    </View>
                    <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 17 }}>Create your CV in minutes</Text>
                    <Text style={{ color: theme.textMuted, fontFamily: theme.font.regular, fontSize: 13.5, textAlign: 'center', maxWidth: 380 }}>
                        Write a few lines about your work and studies — the assistant drafts the whole CV for you to check, then download or share it as a PDF.
                    </Text>
                </Pressable>
            ) : null}
            <View style={{ gap: 10 }}>
                {(list ?? []).map((c) => (
                    <Pressable key={c.id} onPress={() => setOpenId(c.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 18, backgroundColor: theme.panel, borderWidth: 1, borderColor: theme.border, ...pointer }}>
                        <View style={{ width: 44, height: 52, borderRadius: 8, backgroundColor: `${c.accent}1a`, borderWidth: 1, borderColor: `${c.accent}44`, alignItems: 'center', justifyContent: 'center' }}>
                            <FileText size={20} color={c.accent} />
                        </View>
                        <View style={{ flex: 1, minWidth: 0 }}>
                            <Text numberOfLines={1} style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 15 }}>{c.title}</Text>
                            <Text numberOfLines={1} style={{ color: theme.textMuted, fontFamily: theme.font.medium, fontSize: 12.5 }}>
                                {c.full_name ?? '—'} · {c.template} · updated {new Date(c.updated).toLocaleDateString('en-KE', { day: 'numeric', month: 'short' })}{c.is_public ? ' · link on' : ''}
                            </Text>
                        </View>
                    </Pressable>
                ))}
            </View>
        </ScrollView>
    );
}

/* ------------------------------------------------------------------ editor */

function CvEditor({ cvId, advertId, advertTitle, onClose }: { cvId: string | null; advertId: string | null; advertTitle: string | null; onClose: () => void }) {
    const { theme } = useAuth();
    const { isOnline } = useNetworkStatus();
    const appAlert = useAlert();
    const router = useRouter();
    const [id, setId] = useState<string | null>(cvId);
    const [title, setTitle] = useState('My CV');
    const [template, setTemplate] = useState<CvTemplate>('modern');
    const [accent, setAccent] = useState(ACCENTS[0]);
    const [cv, setCv] = useState<CvData>(EMPTY_CV);
    const [record, setRecord] = useState<CvRecord | null>(null);
    const [loading, setLoading] = useState(!!cvId);
    const [saving, setSaving] = useState(false);
    const [dirty, setDirty] = useState(false);
    const [busyTask, setBusyTask] = useState<string | null>(null);
    const [notes, setNotes] = useState('');
    const [targetRole, setTargetRole] = useState('');
    const [review, setReview] = useState<{ score: number; strengths: string[]; improvements: string[] } | null>(null);
    const [tips, setTips] = useState<string[] | null>(null);
    const [preview, setPreview] = useState(false);
    const [shareOpen, setShareOpen] = useState(false);
    const [newSkill, setNewSkill] = useState('');
    const timer = useRef<any>(null);

    const html = useMemo(() => buildCvHtml(cv, template, accent), [cv, template, accent]);
    const file = cvFileName(cv);

    // Load: the server copy, unless a newer draft is saved on this device.
    useEffect(() => {
        (async () => {
            const raw = await AsyncStorage.getItem(draftKey(cvId)).catch(() => null);
            const draft: Draft | null = raw ? JSON.parse(raw) : null;
            let server: CvRecord | null = null;
            if (cvId && isOnline) {
                const res: any = await jobsApi.getCv(cvId).catch(() => null);
                if (isServerOk(res)) server = res.data.cv;
            }
            const useDraft = draft && (!server || new Date(draft.saved_at) > new Date(server.updated));
            const src: any = useDraft ? draft : server;
            if (src) {
                setTitle(src.title);
                setTemplate(src.template);
                setAccent(src.accent);
                setCv(normalizeCv(src.data));
            }
            if (server) setRecord(server);
            if (useDraft && server) toast.info('Unsaved changes restored', 'Your latest edits on this device were kept.');
            setDirty(!!useDraft);
            setLoading(false);
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cvId]);

    // Autosave the draft on this device.
    useEffect(() => {
        if (loading) return;
        clearTimeout(timer.current);
        timer.current = setTimeout(() => {
            const d: Draft = { title, template, accent, data: cv, saved_at: new Date().toISOString() };
            AsyncStorage.setItem(draftKey(id), JSON.stringify(d)).catch(() => undefined);
        }, 600);
        return () => clearTimeout(timer.current);
    }, [title, template, accent, cv, id, loading]);

    const change = (next: CvData | ((c: CvData) => CvData)) => {
        setCv((c) => (typeof next === 'function' ? (next as any)(c) : next));
        setDirty(true);
    };
    const setPersonal = (k: keyof CvData['personal'], v: string) => change((c) => ({ ...c, personal: { ...c.personal, [k]: v } }));

    const save = async (): Promise<CvRecord | null> => {
        if (!cv.personal.full_name.trim()) {
            toast.warning('Add your name', 'Your full name is the one thing every CV needs.');
            return null;
        }
        if (!isOnline) {
            toast.show({ tone: 'offline', title: 'Saved on this device', message: 'It will save to WaziPOS when you tap Save online.' });
            return null;
        }
        setSaving(true);
        const res: any = await jobsApi.saveCv({ cv_id: id ?? undefined, title, template, accent, data: cv, html }).catch(() => null);
        setSaving(false);
        if (!isServerOk(res)) {
            toast.fromResponse(res, 'Your CV was not saved.');
            return null;
        }
        const r: CvRecord = res.data.cv;
        if (!id) AsyncStorage.removeItem(draftKey(null)).catch(() => undefined);
        setId(r.id);
        setRecord(r);
        setDirty(false);
        AsyncStorage.setItem(draftKey(r.id), JSON.stringify({ title, template, accent, data: cv, saved_at: r.updated })).catch(() => undefined);
        toast.success('CV saved');
        return r;
    };

    /* ---------------- AI assistant ---------------- */

    const assist = async (task: CvTask, extra: Record<string, any> = {}) => {
        if (!isOnline) return toast.show({ tone: 'offline', title: "You're offline", message: 'The assistant needs a connection.' });
        setBusyTask(task + (extra.index ?? ''));
        const res: any = await jobsApi.cvAssist({ task, data: task === 'draft' ? undefined : cv, ...extra }).catch(() => null);
        setBusyTask(null);
        if (!isServerOk(res)) return toast.fromResponse(res, 'The assistant couldn’t help just now.');
        const { result, uses_left_today } = res.data.assist;
        const before = cv;
        const undo = { label: 'Undo', onPress: () => change(before) };
        if (task === 'draft') {
            change(normalizeCv({ ...result, referees: cv.referees, extras: cv.extras, personal: { ...cv.personal, ...Object.fromEntries(Object.entries(result.personal ?? {}).filter(([, v]) => String(v).trim())) } }));
            toast.show({ tone: 'success', title: 'Draft ready', message: 'Check every detail — the assistant only used what you wrote.', action: undo, duration: 8000 });
        } else if (task === 'summary') {
            change((c) => ({ ...c, summary: result.summary }));
            toast.show({ tone: 'success', title: 'Summary written', action: undo, duration: 6000 });
        } else if (task === 'bullets') {
            change((c) => ({ ...c, experience: c.experience.map((e, i) => (i === extra.index ? { ...e, bullets: result.bullets } : e)) }));
            toast.show({ tone: 'success', title: 'Bullets improved', action: undo, duration: 6000 });
        } else if (task === 'skills') {
            const add = (result.skills as string[]).filter((s) => !cv.skills.some((x) => x.toLowerCase() === s.toLowerCase()));
            change((c) => ({ ...c, skills: [...c.skills, ...add] }));
            toast.show({ tone: 'success', title: `${add.length} skills added`, message: 'Remove any that don’t fit you.', action: undo, duration: 6000 });
        } else if (task === 'tailor') {
            change((c) => ({ ...c, summary: result.summary, skills: result.skills.length ? result.skills : c.skills }));
            setTips(result.tips);
            toast.show({ tone: 'success', title: 'Tailored to the job', action: undo, duration: 6000 });
        } else if (task === 'review') {
            setReview(result);
        }
        if (uses_left_today <= 5) toast.info(`${uses_left_today} assistant uses left today`);
    };

    const draftFromNotes = () => {
        const run = () => void assist('draft', { notes });
        const filled = cv.experience.length || cv.education.length || cv.summary;
        if (filled) appAlert('Replace your CV with a new draft?', 'Your referees and custom sections are kept. You can undo right after.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Draft it', onPress: run }]);
        else run();
    };

    /* ---------------- list helpers ---------------- */

    function listOps<K extends 'experience' | 'education' | 'certifications' | 'languages' | 'referees' | 'extras'>(key: K) {
        type Item = CvData[K][number];
        return {
            add: (blank: Item) => change((c) => ({ ...c, [key]: [...(c[key] as Item[]), blank] })),
            remove: (i: number) => change((c) => ({ ...c, [key]: (c[key] as Item[]).filter((_, j) => j !== i) })),
            set: (i: number, patch: Partial<Item>) => change((c) => ({ ...c, [key]: (c[key] as Item[]).map((x, j) => (j === i ? { ...x, ...patch } : x)) })),
            move: (i: number, d: -1 | 1) =>
                change((c) => {
                    const arr = [...(c[key] as Item[])];
                    const j = i + d;
                    if (j < 0 || j >= arr.length) return c;
                    [arr[i], arr[j]] = [arr[j], arr[i]];
                    return { ...c, [key]: arr };
                }),
        };
    }
    const exp = listOps('experience');
    const edu = listOps('education');
    const cert = listOps('certifications');
    const lang = listOps('languages');
    const ref = listOps('referees');
    const ext = listOps('extras');

    const leave = () => {
        if (!dirty) return onClose();
        appAlert('Leave without saving to WaziPOS?', 'Your edits stay on this device and will be here next time.', [{ text: 'Stay', style: 'cancel' }, { text: 'Leave', onPress: onClose }]);
    };

    const remove = () =>
        appAlert('Delete this CV?', 'Its share link stops working.', [
            { text: 'Keep', style: 'cancel' },
            {
                text: 'Delete',
                style: 'destructive',
                onPress: async () => {
                    if (id) {
                        const res: any = await jobsApi.deleteCv(id).catch(() => null);
                        if (!isServerOk(res)) return toast.fromResponse(res, 'Not deleted.');
                    }
                    AsyncStorage.removeItem(draftKey(id)).catch(() => undefined);
                    toast.success('CV deleted');
                    onClose();
                },
            },
        ]);

    if (loading) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.background }}><ActivityIndicator color={theme.primary} /></View>;

    return (
        <View style={{ flex: 1, backgroundColor: theme.background }}>
            <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 130, maxWidth: 900, width: '100%', alignSelf: 'center', gap: 14 }} keyboardShouldPersistTaps="handled">
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Pressable onPress={leave} hitSlop={8} style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: theme.surfaceAlt, alignItems: 'center', justifyContent: 'center', ...pointer }}>
                        <X size={18} color={theme.text} />
                    </Pressable>
                    <View style={{ flex: 1 }}>
                        <CustomTextField value={title} onChangeText={(t) => { setTitle(t); setDirty(true); }} placeholder="CV name, e.g. Pharmacist CV" />
                    </View>
                    {id ? <IconBtn icon={Trash2} label="Delete CV" onPress={remove} danger /> : null}
                </View>
                {!isOnline ? <OfflineNotice title="Offline" message="Edits are saved on this device. You can still make the PDF on a phone." /> : null}

                {/* Look */}
                <Card title="Look">
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                        {TEMPLATES.map((t) => {
                            const on = t.key === template;
                            return (
                                <Pressable key={t.key} onPress={() => { setTemplate(t.key); setDirty(true); }} style={{ flex: 1, height: 42, borderRadius: 12, borderWidth: 1.5, borderColor: on ? accent : theme.border, backgroundColor: on ? `${accent}14` : theme.panel, alignItems: 'center', justifyContent: 'center', ...pointer }}>
                                    <Text style={{ color: on ? accent : theme.text, fontFamily: theme.font.bold, fontSize: 13 }}>{t.label}</Text>
                                </Pressable>
                            );
                        })}
                    </View>
                    <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
                        {ACCENTS.map((c) => (
                            <Pressable key={c} onPress={() => { setAccent(c); setDirty(true); }} accessibilityLabel={`Colour ${c}`} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: c, borderWidth: 3, borderColor: c === accent ? theme.text : 'transparent', ...pointer }} />
                        ))}
                    </View>
                </Card>

                {/* AI: start from notes */}
                <View style={{ borderRadius: 20, padding: 16, gap: 10, backgroundColor: `${AI}0f`, borderWidth: 1.5, borderColor: `${AI}44` }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: AI, alignItems: 'center', justifyContent: 'center' }}>
                            <Sparkles size={18} color="#fff" />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 15 }}>Start from notes</Text>
                            <Text style={{ color: theme.textMuted, fontFamily: theme.font.regular, fontSize: 12.5 }}>Write in your own words — jobs, dates, studies, licences, skills. The assistant fills the form.</Text>
                        </View>
                    </View>
                    <CustomTextField value={notes} onChangeText={setNotes} multiline numberOfLines={5} placeholder="e.g. Pharmaceutical technologist, PPB licence 12345. Worked at Afya Chemists Nakuru 2020–now: dispensing, stock control, M-Pesa reconciliations. Diploma KMTC 2019…" />
                    <AiButton label="Draft my CV" busy={busyTask === 'draft'} onPress={draftFromNotes} disabled={notes.trim().length < 30} />
                    <Text style={{ color: theme.textMuted, fontFamily: theme.font.regular, fontSize: 11 }}>Your CV details are sent to our AI provider to write suggestions. Always check them before sending.</Text>
                </View>

                {/* Personal */}
                <Card title="Personal details">
                    <CustomTextField label="Full name" required value={cv.personal.full_name} onChangeText={(t) => setPersonal('full_name', t)} autoCapitalize="words" />
                    <CustomTextField label="Headline" value={cv.personal.headline} onChangeText={(t) => setPersonal('headline', t)} placeholder="e.g. Registered Pharmacist · 5 years in community pharmacy" />
                    <FormRow>
                        <CustomTextField label="Phone" value={cv.personal.phone} onChangeText={(t) => setPersonal('phone', t)} keyboardType="phone-pad" />
                        <CustomTextField label="Email" value={cv.personal.email} onChangeText={(t) => setPersonal('email', t)} keyboardType="email-address" autoCapitalize="none" />
                    </FormRow>
                    <FormRow>
                        <CustomTextField label="Location" value={cv.personal.location} onChangeText={(t) => setPersonal('location', t)} placeholder="Town, County" />
                        <CustomTextField label="LinkedIn / website" value={cv.personal.linkedin} onChangeText={(t) => setPersonal('linkedin', t)} autoCapitalize="none" />
                    </FormRow>
                </Card>

                {/* Summary */}
                <Card title="Profile summary">
                    <CustomTextField value={cv.summary} onChangeText={(t) => change((c) => ({ ...c, summary: t }))} multiline numberOfLines={4} placeholder="3–4 sentences about who you are and what you're great at." />
                    <FormRow>
                        <CustomTextField value={targetRole} onChangeText={setTargetRole} placeholder="Role you're aiming for (optional)" />
                        <AiButton label="Write it for me" busy={busyTask === 'summary'} onPress={() => void assist('summary', { target_role: targetRole || undefined })} />
                    </FormRow>
                    {advertId ? <AiButton label={`Tailor to ${advertTitle ?? 'this job'}`} icon={Wand2} busy={busyTask === 'tailor'} onPress={() => void assist('tailor', { advert_id: advertId })} /> : null}
                    {tips?.length ? (
                        <View style={{ padding: 12, borderRadius: 14, backgroundColor: `${AI}10`, gap: 4 }}>
                            <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 13 }}>To stand out for this job</Text>
                            {tips.map((t) => (
                                <Text key={t} style={{ color: theme.text, fontFamily: theme.font.regular, fontSize: 13 }}>• {t}</Text>
                            ))}
                        </View>
                    ) : null}
                </Card>

                {/* Experience */}
                <Card title="Experience" onAdd={() => exp.add({ role: '', employer: '', location: '', start: '', end: '', current: false, bullets: [] })} addLabel="Add job">
                    {cv.experience.map((e, i) => (
                        <Entry key={i} index={i} total={cv.experience.length} onUp={() => exp.move(i, -1)} onDown={() => exp.move(i, 1)} onRemove={() => exp.remove(i)}>
                            <FormRow>
                                <CustomTextField label="Role" value={e.role} onChangeText={(t) => exp.set(i, { role: t })} />
                                <CustomTextField label="Employer" value={e.employer} onChangeText={(t) => exp.set(i, { employer: t })} />
                            </FormRow>
                            <FormRow>
                                <CustomTextField label="Start" value={e.start} onChangeText={(t) => exp.set(i, { start: t })} placeholder="Mar 2021" />
                                {e.current ? <View /> : <CustomTextField label="End" value={e.end} onChangeText={(t) => exp.set(i, { end: t })} placeholder="Jun 2024" />}
                                <CustomTextField label="Location" value={e.location} onChangeText={(t) => exp.set(i, { location: t })} />
                            </FormRow>
                            <SwitchField label="I work here now" value={e.current} onChange={(v) => exp.set(i, { current: v })} />
                            <CustomTextField label="What you did (one per line)" value={e.bullets.join('\n')} onChangeText={(t) => exp.set(i, { bullets: t.split('\n') })} onBlur={() => exp.set(i, { bullets: lines(e.bullets.join('\n')) })} multiline numberOfLines={4} />
                            <AiButton label="Improve these bullets" busy={busyTask === `bullets${i}`} onPress={() => void assist('bullets', { index: i })} disabled={!e.role && !e.bullets.length} />
                        </Entry>
                    ))}
                </Card>

                {/* Education */}
                <Card title="Education" onAdd={() => edu.add({ qualification: '', institution: '', start: '', end: '', grade: '' })} addLabel="Add education">
                    {cv.education.map((e, i) => (
                        <Entry key={i} index={i} total={cv.education.length} onUp={() => edu.move(i, -1)} onDown={() => edu.move(i, 1)} onRemove={() => edu.remove(i)}>
                            <FormRow>
                                <CustomTextField label="Qualification" value={e.qualification} onChangeText={(t) => edu.set(i, { qualification: t })} placeholder="Diploma in Pharmacy" />
                                <CustomTextField label="Institution" value={e.institution} onChangeText={(t) => edu.set(i, { institution: t })} placeholder="KMTC" />
                            </FormRow>
                            <FormRow>
                                <CustomTextField label="Start" value={e.start} onChangeText={(t) => edu.set(i, { start: t })} />
                                <CustomTextField label="End" value={e.end} onChangeText={(t) => edu.set(i, { end: t })} />
                                <CustomTextField label="Grade" value={e.grade} onChangeText={(t) => edu.set(i, { grade: t })} placeholder="Credit / B+" />
                            </FormRow>
                        </Entry>
                    ))}
                </Card>

                {/* Skills */}
                <Card title="Skills">
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                        {cv.skills.map((s, i) => (
                            <Pressable key={`${s}-${i}`} onPress={() => change((c) => ({ ...c, skills: c.skills.filter((_, j) => j !== i) }))} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 32, paddingHorizontal: 12, borderRadius: 999, backgroundColor: `${accent}14`, ...pointer }}>
                                <Text style={{ color: accent, fontFamily: theme.font.semibold, fontSize: 12.5 }}>{s}</Text>
                                <X size={12} color={accent} />
                            </Pressable>
                        ))}
                    </View>
                    <FormRow>
                        <CustomTextField
                            value={newSkill}
                            onChangeText={setNewSkill}
                            placeholder="Add a skill and press enter"
                            onSubmitEditing={() => {
                                const s = newSkill.trim();
                                if (s) change((c) => ({ ...c, skills: [...c.skills, s] }));
                                setNewSkill('');
                            }}
                            blurOnSubmit={false}
                        />
                        <AiButton label="Suggest skills" busy={busyTask === 'skills'} onPress={() => void assist('skills', { target_role: targetRole || undefined })} />
                    </FormRow>
                </Card>

                {/* Licences */}
                <Card title="Licences & certifications" onAdd={() => cert.add({ name: '', issuer: '', year: '', number: '' })} addLabel="Add licence">
                    {cv.certifications.map((c, i) => (
                        <Entry key={i} index={i} total={cv.certifications.length} onUp={() => cert.move(i, -1)} onDown={() => cert.move(i, 1)} onRemove={() => cert.remove(i)}>
                            <FormRow>
                                <CustomTextField label="Name" value={c.name} onChangeText={(t) => cert.set(i, { name: t })} placeholder="Practising licence" />
                                <CustomTextField label="Issued by" value={c.issuer} onChangeText={(t) => cert.set(i, { issuer: t })} placeholder="PPB / KMPDC / NCK" />
                            </FormRow>
                            <FormRow>
                                <CustomTextField label="Number" value={c.number} onChangeText={(t) => cert.set(i, { number: t })} />
                                <CustomTextField label="Year" value={c.year} onChangeText={(t) => cert.set(i, { year: t })} keyboardType="number-pad" />
                            </FormRow>
                        </Entry>
                    ))}
                </Card>

                {/* Languages */}
                <Card title="Languages" onAdd={() => lang.add({ language: '', level: '' })} addLabel="Add language">
                    {cv.languages.map((l, i) => (
                        <Entry key={i} index={i} total={cv.languages.length} onRemove={() => lang.remove(i)}>
                            <FormRow>
                                <CustomTextField label="Language" value={l.language} onChangeText={(t) => lang.set(i, { language: t })} placeholder="English, Kiswahili…" />
                                <CustomTextField label="Level" value={l.level} onChangeText={(t) => lang.set(i, { level: t })} placeholder="Fluent" />
                            </FormRow>
                        </Entry>
                    ))}
                </Card>

                {/* Referees */}
                <Card title="Referees" onAdd={() => ref.add({ name: '', title: '', organisation: '', phone: '', email: '' })} addLabel="Add referee">
                    {cv.referees.map((r, i) => (
                        <Entry key={i} index={i} total={cv.referees.length} onUp={() => ref.move(i, -1)} onDown={() => ref.move(i, 1)} onRemove={() => ref.remove(i)}>
                            <FormRow>
                                <CustomTextField label="Name" value={r.name} onChangeText={(t) => ref.set(i, { name: t })} />
                                <CustomTextField label="Title" value={r.title} onChangeText={(t) => ref.set(i, { title: t })} />
                            </FormRow>
                            <FormRow>
                                <CustomTextField label="Organisation" value={r.organisation} onChangeText={(t) => ref.set(i, { organisation: t })} />
                                <CustomTextField label="Phone" value={r.phone} onChangeText={(t) => ref.set(i, { phone: t })} keyboardType="phone-pad" />
                                <CustomTextField label="Email" value={r.email} onChangeText={(t) => ref.set(i, { email: t })} keyboardType="email-address" autoCapitalize="none" />
                            </FormRow>
                        </Entry>
                    ))}
                </Card>

                {/* Custom sections */}
                <Card title="More sections" hint="Volunteering, awards, projects, hobbies — anything else." onAdd={() => ext.add({ title: '', items: [] } as CvExtra)} addLabel="Add section">
                    {cv.extras.map((x, i) => (
                        <Entry key={i} index={i} total={cv.extras.length} onUp={() => ext.move(i, -1)} onDown={() => ext.move(i, 1)} onRemove={() => ext.remove(i)}>
                            <CustomTextField label="Section title" value={x.title} onChangeText={(t) => ext.set(i, { title: t })} placeholder="Volunteering" />
                            <CustomTextField label="Items (one per line)" value={x.items.join('\n')} onChangeText={(t) => ext.set(i, { items: t.split('\n') })} onBlur={() => ext.set(i, { items: lines(x.items.join('\n')) })} multiline numberOfLines={3} />
                        </Entry>
                    ))}
                </Card>

                {/* Review */}
                <Card title="Check my CV">
                    <AiButton label="Review my CV" busy={busyTask === 'review'} onPress={() => void assist('review')} />
                    {review ? (
                        <View style={{ gap: 8 }}>
                            <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 22 }}>
                                {review.score}
                                <Text style={{ color: theme.textMuted, fontSize: 13 }}> / 100</Text>
                            </Text>
                            {review.strengths.map((s) => (
                                <Text key={s} style={{ color: theme.success, fontFamily: theme.font.medium, fontSize: 13 }}>✓ {s}</Text>
                            ))}
                            {review.improvements.map((s) => (
                                <Text key={s} style={{ color: theme.text, fontFamily: theme.font.regular, fontSize: 13 }}>→ {s}</Text>
                            ))}
                        </View>
                    ) : null}
                </Card>
            </ScrollView>

            {/* Action bar */}
            <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: 12, paddingBottom: 16, backgroundColor: theme.panel, borderTopWidth: 1, borderColor: theme.border, shadowColor: '#0b1733', shadowOpacity: 0.12, shadowRadius: 18, shadowOffset: { width: 0, height: -4 }, elevation: 12 }}>
                <View style={{ flexDirection: 'row', gap: 8, maxWidth: 900, width: '100%', alignSelf: 'center' }}>
                    <IconBtn icon={Eye} label="Preview" onPress={() => setPreview(true)} />
                    <IconBtn icon={Printer} label="Print" onPress={() => void printCv(html, file)} />
                    <IconBtn icon={Link2} label="Share" onPress={() => setShareOpen(true)} />
                    <SoftButton label={isWeb ? 'PDF' : 'PDF · share'} icon={FileDown} tone="neutral" onPress={() => void sharePdf(html, file)} style={{ flexGrow: 1 }} />
                    <PrimaryCTA label={dirty ? 'Save' : 'Saved'} icon={Save} onPress={() => void save()} loading={saving} height={46} style={{ flexGrow: 1 }} />
                </View>
            </View>

            <PreviewSheet visible={preview} html={html} onClose={() => setPreview(false)} onPdf={() => void sharePdf(html, file)} />
            <ShareSheet visible={shareOpen} record={record} dirty={dirty} name={cv.personal.full_name} onSave={save} onClose={() => setShareOpen(false)} onPdf={() => void sharePdf(html, file)} onRecord={setRecord} onJobs={() => router.push('/jobs' as any)} />
        </View>
    );
}

/* ------------------------------------------------------------------ pieces */

function Card({ title, hint, children, onAdd, addLabel }: { title: string; hint?: string; children?: React.ReactNode; onAdd?: () => void; addLabel?: string }) {
    const { theme } = useAuth();
    return (
        <View style={{ borderRadius: 20, backgroundColor: theme.panel, borderWidth: 1, borderColor: theme.border, padding: 16, gap: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ flex: 1 }}>
                    <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 15.5 }}>{title}</Text>
                    {hint ? <Text style={{ color: theme.textMuted, fontFamily: theme.font.regular, fontSize: 12 }}>{hint}</Text> : null}
                </View>
                {onAdd ? <SoftButton label={addLabel ?? 'Add'} icon={Plus} onPress={onAdd} /> : null}
            </View>
            {children}
        </View>
    );
}

function Entry({ children, index, total, onUp, onDown, onRemove }: { children: React.ReactNode; index: number; total: number; onUp?: () => void; onDown?: () => void; onRemove: () => void }) {
    const { theme } = useAuth();
    return (
        <View style={{ borderRadius: 16, backgroundColor: theme.surfaceAlt, padding: 12, gap: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={{ flex: 1, color: theme.textMuted, fontFamily: theme.font.bold, fontSize: 11, letterSpacing: 0.6 }}>#{index + 1}</Text>
                {onUp && index > 0 ? <Mini icon={ArrowUp} label="Move up" onPress={onUp} /> : null}
                {onDown && index < total - 1 ? <Mini icon={ArrowDown} label="Move down" onPress={onDown} /> : null}
                <Mini icon={Trash2} label="Remove" onPress={onRemove} danger />
            </View>
            {children}
        </View>
    );
}

function Mini({ icon: Icon, label, onPress, danger }: { icon: any; label: string; onPress: () => void; danger?: boolean }) {
    const { theme } = useAuth();
    return (
        <Pressable onPress={onPress} accessibilityLabel={label} hitSlop={6} style={{ width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: danger ? theme.dangerSoft : theme.panel, ...pointer }}>
            <Icon size={14} color={danger ? theme.danger : theme.text} />
        </Pressable>
    );
}

function IconBtn({ icon: Icon, label, onPress, danger }: { icon: any; label: string; onPress: () => void; danger?: boolean }) {
    const { theme } = useAuth();
    return (
        <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={{ width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: danger ? theme.dangerSoft : theme.surfaceAlt, ...pointer }}>
            <Icon size={18} color={danger ? theme.danger : theme.text} />
        </Pressable>
    );
}

function AiButton({ label, onPress, busy, disabled, icon: Icon = Sparkles }: { label: string; onPress: () => void; busy?: boolean; disabled?: boolean; icon?: any }) {
    const { theme } = useAuth();
    return (
        <Pressable
            onPress={onPress}
            disabled={busy || disabled}
            accessibilityRole="button"
            style={{ height: 46, paddingHorizontal: 14, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: AI, opacity: busy || disabled ? 0.55 : 1, ...(isWeb ? ({ backgroundImage: `linear-gradient(120deg, ${AI}, #ec4899)`, cursor: 'pointer' } as any) : null) }}
        >
            {busy ? <ActivityIndicator size="small" color="#fff" /> : <Icon size={16} color="#fff" />}
            <Text style={{ color: '#fff', fontFamily: theme.font.bold, fontSize: 13.5 }}>{busy ? 'Working…' : label}</Text>
        </Pressable>
    );
}

function PreviewSheet({ visible, html, onClose, onPdf }: { visible: boolean; html: string; onClose: () => void; onPdf: () => void }) {
    const { theme } = useAuth();
    return (
        <AdminSheet visible={visible} onClose={onClose} title="Preview" icon="eye-outline" width={860}>
            {isWeb ? (
                React.createElement('iframe', { srcDoc: html, title: 'CV preview', style: { width: '100%', height: '70vh', border: '1px solid #e2e8f0', borderRadius: 12, background: '#fff' } })
            ) : (
                <View style={{ gap: 12, alignItems: 'center', paddingVertical: 20 }}>
                    <FileText size={36} color={theme.primary} />
                    <Text style={{ color: theme.textMuted, fontFamily: theme.font.regular, fontSize: 14, textAlign: 'center' }}>Open the PDF to see exactly how it prints.</Text>
                    <PrimaryCTA label="Open PDF" icon={FileDown} onPress={onPdf} />
                </View>
            )}
        </AdminSheet>
    );
}

function ShareSheet({ visible, record, dirty, name, onSave, onClose, onPdf, onRecord, onJobs }: { visible: boolean; record: CvRecord | null; dirty: boolean; name: string; onSave: () => Promise<CvRecord | null>; onClose: () => void; onPdf: () => void; onRecord: (r: CvRecord) => void; onJobs: () => void }) {
    const { theme } = useAuth();
    const [busy, setBusy] = useState(false);
    const toggle = async (on: boolean) => {
        let r = record;
        if (!r || dirty) r = await onSave();
        if (!r) return;
        setBusy(true);
        const res: any = await jobsApi.shareCv(r.id, on).catch(() => null);
        setBusy(false);
        if (isServerOk(res)) onRecord(res.data.cv);
        else setErr(describeResponse(res, 'Sharing not updated.').message);
    };
    const [err, setErr] = useState<string | null>(null);
    const url = record?.is_public ? record.share_url : null;
    return (
        <AdminSheet visible={visible} onClose={onClose} title="Share your CV" icon="share-social-outline" width={540}>
            <View style={{ gap: 14 }}>
                {!isWeb ? (
                    <>
                        <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 14 }}>Send the PDF</Text>
                        <PrimaryCTA label="Share PDF — WhatsApp, email…" icon={FileDown} onPress={onPdf} />
                    </>
                ) : null}
                <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 14 }}>Share a link</Text>
                <SwitchField label="Anyone with the link can view this CV" value={!!record?.is_public} onChange={(v) => void toggle(v)} hint="Switch off any time — the link stops working." />
                {busy ? <ActivityIndicator color={theme.primary} /> : null}
                {err ? <InlineNotice tone="danger" message={err} /> : null}
                {url ? (
                    <View style={{ gap: 8 }}>
                        <Text selectable style={{ color: theme.textMuted, fontFamily: theme.font.medium, fontSize: 12 }}>{url}</Text>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                            <SoftButton label="WhatsApp" icon={MessageCircle} onPress={() => void shareLink(url, name, 'whatsapp')} style={{ flexGrow: 1 }} />
                            <SoftButton label="Email" icon={Mail} onPress={() => void shareLink(url, name, 'email')} style={{ flexGrow: 1 }} />
                            <SoftButton label="More…" icon={Link2} tone="neutral" onPress={() => void shareLink(url, name)} style={{ flexGrow: 1 }} />
                        </View>
                    </View>
                ) : null}
                <SoftButton label="Apply for jobs with this CV" tone="navy" onPress={() => { onClose(); onJobs(); }} />
            </View>
        </AdminSheet>
    );
}
