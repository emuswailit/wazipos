// components/retailers/customerOrders/CreditReminderPanel.tsx
//
// Shown in the order details (web invoice modal and the mobile bottom sheet) for
// unpaid CREDIT orders: customer, phone, due date (red when overdue), and a
// "Send SMS Reminder" button once the due date has passed.

import retailersApi from '@/api/retailersApi';
import utilsApi from '@/api/utilsApi';
import { DateField } from '@/components/common/DateField';
import { useAuth } from '@/context/AuthContext';
import type { CustomerOrder } from '@/databases/types';
import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, Text, View } from 'react-native';

import { formatDate, toBool } from './CustomerOrdersWebView';
import { storageService } from './storageService';

const OVERDUE = '#e11d48';

/** Local calendar date as YYYY-MM-DD (the backend compares calendar dates too). */
function todayISO(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function daysBetween(fromISO: string, toISO: string): number {
    const a = new Date(`${fromISO}T00:00:00`).getTime();
    const b = new Date(`${toISO}T00:00:00`).getTime();
    return Math.round((b - a) / (1000 * 60 * 60 * 24));
}

/** Must match REMINDER_COOLDOWN in backend authentication/utils/sms_utils.py. */
const REMINDER_COOLDOWN_MS = 12 * 60 * 60 * 1000;

function formatDateTime(d: Date): string {
    return `${d.toLocaleDateString([], { day: '2-digit', month: 'short' })} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The order's id on the server, or '' if it hasn't been uploaded. */
export function serverOrderId(order: CustomerOrder): string {
    const o: any = order;
    for (const candidate of [o.remote_id, o.id]) {
        if (candidate && UUID_RE.test(String(candidate))) return String(candidate);
    }
    return '';
}

/** Must match DUE_DATE_EDITOR_ROLES in backend retailers/views.py. */
const DUE_DATE_EDITOR_ROLES = ['GeneralRetailerSuperAdmin', 'PharmaceuticalRetailerSuperAdmin'];

/**
 * True if the user holds a due-date editor role. This only decides whether to show the
 * button: the order list only contains the user's own business, and the backend
 * enforces that the role belongs to the order's business when saving.
 */
function canEditDueDate(user: any, order: CustomerOrder | null | undefined): boolean {
    const roles: any[] = Array.isArray(user?.roles) ? user.roles : [];
    const allowed = roles.some((r) => DUE_DATE_EDITOR_ROLES.includes(String(r?.value ?? '').trim()));

    if (__DEV__) {
        console.info('[CreditReminderPanel] due date edit', {
            allowed,
            userRoles: roles.map((r) => ({ value: r?.value, entity: r?.entity })),
            userEntityId: user?.entity_id,
            orderEntity: (order as any)?.entity,
            orderServerId: order ? serverOrderId(order) : '',
        });
    }
    return allowed;
}

export function isUnpaidCredit(order: CustomerOrder | null | undefined): boolean {
    if (!order) return false;
    const method = String(order.selected_payment_method_title || '').trim().toUpperCase();
    return method === 'CREDIT' && !toBool(order.is_paid);
}

type SendState =
    | { kind: 'idle' }
    | { kind: 'sending' }
    | { kind: 'sent'; to: string; at: string }
    | { kind: 'error'; message: string };

export function CreditReminderPanel({
    order,
    onChanged,
}: {
    order: CustomerOrder;
    /** Called after the order was changed here (e.g. a new due date), so lists can refresh. */
    onChanged?: () => void;
}) {
    const { theme, isDarkMode, user } = useAuth();
    const [state, setState] = useState<SendState>({ kind: 'idle' });

    // Due date editing: retailer super admins of the order's business. This only decides
    // whether to show the control; the backend checks the same roles itself.
    const isSuperAdmin = canEditDueDate(user, order);
    const [dueOverride, setDueOverride] = useState<string | null>(null);
    const [editingDue, setEditingDue] = useState(false);
    const [draftDue, setDraftDue] = useState('');
    const [savingDue, setSavingDue] = useState(false);
    const [dueError, setDueError] = useState<string | null>(null);

    if (!isUnpaidCredit(order)) return null;

    const o: any = order;
    const dueISO: string = String(dueOverride ?? o.due_date ?? '').slice(0, 10);
    const hasDue = /^\d{4}-\d{2}-\d{2}$/.test(dueISO);
    const today = todayISO();
    const daysOverdue = hasDue ? daysBetween(dueISO, today) : 0;
    const overdue = hasDue && daysOverdue > 0;
    const dueToday = hasDue && daysOverdue === 0;

    // The server needs the uploaded order's UUID. Orders created on this device keep it in
    // remote_id; orders that arrived over the WebSocket keep the server row as-is, so it's
    // in id. Drafts saved offline have neither yet.
    const remoteId = serverOrderId(order);
    const phone = String(order.customer_phone || '').trim();

    // Set by the server when a reminder goes out; only present on rows synced after it.
    const lastReminder = o.last_payment_reminder_at ? new Date(o.last_payment_reminder_at) : null;
    const lastReminderValid = !!lastReminder && !Number.isNaN(lastReminder.getTime());
    const nextReminderAt = lastReminderValid ? new Date(lastReminder!.getTime() + REMINDER_COOLDOWN_MS) : null;
    const inCooldown = !!nextReminderAt && nextReminderAt.getTime() > Date.now();

    const border = overdue ? 'rgba(225,29,72,0.35)' : isDarkMode ? '#1e293b' : '#e2e8f0';
    const bg = overdue ? (isDarkMode ? 'rgba(225,29,72,0.10)' : 'rgba(225,29,72,0.05)') : 'transparent';
    const divider = isDarkMode ? 'rgba(148,163,184,0.14)' : 'rgba(15,23,42,0.06)';

    const sendReminder = async () => {
        if (!remoteId || state.kind === 'sending') return;
        setState({ kind: 'sending' });
        try {
            const res = await utilsApi.sendCustomerOrderReminder(remoteId);
            const body = res.data;
            if (res.ok && body && Number(body.response_code) === 0 && body.sms) {
                const at = new Date(body.sms.sent_at || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                setState({ kind: 'sent', to: body.sms.phone_number || phone, at });
                return;
            }
            const message =
                (Array.isArray(body?.errors) && body!.errors!.length ? body!.errors!.join(' · ') : '') ||
                body?.response_message ||
                (res.problem === 'TIMEOUT_ERROR' ? 'The SMS service took too long to respond. Try again.' : '') ||
                'The reminder could not be sent.';
            setState({ kind: 'error', message });
        } catch (err: any) {
            setState({ kind: 'error', message: err?.message || 'Network error. Try again.' });
        }
    };

    // Shown to every retailer super admin; if the order isn't on the server yet the
    // button explains that instead of disappearing.
    const canEditDue = isSuperAdmin;

    const startEditDue = () => {
        if (!remoteId) {
            setDueError("This order hasn't uploaded yet. You can set its due date once it syncs.");
            return;
        }
        setDraftDue(hasDue ? dueISO : today);
        setDueError(null);
        setEditingDue(true);
    };

    const saveDue = async () => {
        if (!draftDue || savingDue) return;
        if (draftDue === dueISO) {
            setEditingDue(false);
            return;
        }
        setSavingDue(true);
        setDueError(null);
        try {
            const res = await retailersApi.updateCustomerOrderDueDate(remoteId, draftDue);
            const body: any = res.data;
            if (res.ok && body && Number(body.response_code) === 0) {
                const saved = String(body.customer_order?.due_date || draftDue).slice(0, 10);
                setDueOverride(saved);
                setEditingDue(false);
                setState({ kind: 'idle' }); // overdue status may have changed
                await storageService.patchOrder(order, { due_date: saved }).catch(() => { });
                onChanged?.();
                return;
            }
            setDueError(
                (Array.isArray(body?.errors) && body.errors.length ? body.errors.join(' · ') : '') ||
                body?.detail || // DRF PermissionDenied
                body?.response_message ||
                'The due date could not be updated.'
            );
        } catch (err: any) {
            setDueError(err?.message || 'Network error. Try again.');
        } finally {
            setSavingDue(false);
        }
    };

    const rows: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string; color?: string; onPress?: () => void; trailing?: React.ReactNode }[] = [
        { icon: 'person-outline', label: 'Customer', value: order.customer_name || '—' },
        {
            icon: 'call-outline',
            label: 'Phone',
            value: phone || '—',
            color: phone ? theme.primary : undefined,
            onPress: phone
                ? () => {
                    Linking.openURL(`tel:${phone}`).catch(() => { });
                }
                : undefined,
        },
        {
            icon: overdue ? 'alert-circle' : 'calendar-outline',
            label: 'Due date',
            value: hasDue
                ? `${formatDate(dueISO)}${overdue ? ` · ${daysOverdue} day${daysOverdue === 1 ? '' : 's'} overdue` : dueToday ? ' · due today' : ''}`
                : 'Not set',
            color: overdue ? OVERDUE : dueToday ? '#d97706' : undefined,
            trailing:
                canEditDue && !editingDue ? (
                    <Pressable
                        onPress={startEditDue}
                        hitSlop={8}
                        accessibilityRole="button"
                        accessibilityLabel={hasDue ? 'Edit due date' : 'Set due date'}
                        className="flex-row items-center gap-1 ml-3 px-2.5 h-7 rounded-lg border"
                        style={{
                            borderColor: `${theme.primary}55`,
                            backgroundColor: `${theme.primary}0d`,
                            ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : {}),
                        }}
                    >
                        <Ionicons name={hasDue ? 'create-outline' : 'add'} size={14} color={theme.primary} />
                        <Text style={{ color: theme.primary, fontFamily: theme.font.bold, fontSize: 12 }}>
                            {hasDue ? 'Edit' : 'Set'}
                        </Text>
                    </Pressable>
                ) : undefined,
        },
    ];

    return (
        <View className="rounded-2xl border mb-4 overflow-hidden" style={{ borderColor: border, backgroundColor: bg }}>
            {/* Title */}
            <View className="flex-row items-center gap-2 px-4 pt-3 pb-2">
                <Ionicons name="time-outline" size={15} color={overdue ? OVERDUE : theme.textDark} />
                <Text
                    className="uppercase flex-1"
                    style={{ color: overdue ? OVERDUE : theme.textDark, fontFamily: theme.font.bold, fontSize: 11, letterSpacing: 0.6 }}
                >
                    {overdue ? 'Overdue credit' : 'Credit sale'}
                </Text>
            </View>

            {rows.map((r) => (
                <Pressable
                    key={r.label}
                    onPress={r.onPress}
                    disabled={!r.onPress}
                    className="flex-row items-center px-4 py-2.5"
                    style={{ borderTopWidth: 1, borderTopColor: divider }}
                >
                    <Ionicons name={r.icon} size={16} color={r.color && r.label === 'Due date' ? r.color : theme.textDark} />
                    <Text className="ml-3 flex-1" style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 13 }}>
                        {r.label}
                    </Text>
                    <Text
                        style={{ color: r.color ?? theme.text, fontFamily: theme.font.bold, fontSize: 13, maxWidth: '65%', textAlign: 'right' }}
                        numberOfLines={1}
                    >
                        {r.value}
                    </Text>
                    {r.trailing}
                </Pressable>
            ))}

            {!editingDue && dueError ? (
                <Text className="px-4 pb-3" style={{ color: OVERDUE, fontFamily: theme.font.medium, fontSize: 12 }}>
                    {dueError}
                </Text>
            ) : null}

            {/* Super admin: edit due date */}
            {editingDue && (
                <View className="px-4 pb-3 pt-3" style={{ borderTopWidth: 1, borderTopColor: divider }}>
                    <Text className="mb-1.5" style={{ color: theme.textDark, fontFamily: theme.font.bold, fontSize: 11, letterSpacing: 0.6 }}>
                        NEW DUE DATE
                    </Text>
                    <DateField bare value={draftDue} onChangeText={setDraftDue} placeholder="Select due date" disabled={savingDue} />
                    {dueError ? (
                        <Text className="mt-2" style={{ color: OVERDUE, fontFamily: theme.font.medium, fontSize: 12 }}>
                            {dueError}
                        </Text>
                    ) : null}
                    <View className="flex-row gap-2 mt-3">
                        <Pressable
                            onPress={() => setEditingDue(false)}
                            disabled={savingDue}
                            className="flex-1 h-10 rounded-xl items-center justify-center border"
                            style={{ borderColor: divider, ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : {}) }}
                        >
                            <Text style={{ color: theme.text, fontFamily: theme.font.bold, fontSize: 13 }}>Cancel</Text>
                        </Pressable>
                        <Pressable
                            onPress={saveDue}
                            disabled={!draftDue || savingDue}
                            className="flex-1 h-10 rounded-xl flex-row items-center justify-center gap-2"
                            style={{
                                backgroundColor: theme.primary,
                                opacity: !draftDue || savingDue ? 0.55 : 1,
                                ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : {}),
                            }}
                        >
                            {savingDue ? <ActivityIndicator size="small" color="#fff" /> : null}
                            <Text className="text-white" style={{ fontFamily: theme.font.bold, fontSize: 13 }}>
                                {savingDue ? 'Saving…' : 'Save'}
                            </Text>
                        </Pressable>
                    </View>
                </View>
            )}

            {/* Reminder */}
            {overdue && (
                <View className="px-4 pb-4 pt-3" style={{ borderTopWidth: 1, borderTopColor: divider }}>
                    {state.kind === 'sent' ? (
                        <View className="flex-row items-center gap-2 rounded-xl px-3 py-2.5" style={{ backgroundColor: 'rgba(16,185,129,0.1)' }}>
                            <Ionicons name="checkmark-circle" size={18} color="#10b981" />
                            <Text className="flex-1" style={{ color: '#047857', fontFamily: theme.font.bold, fontSize: 13 }}>
                                Reminder sent to {state.to} at {state.at}
                            </Text>
                        </View>
                    ) : inCooldown ? (
                        <View className="flex-row items-center gap-2 rounded-xl px-3 py-2.5" style={{ backgroundColor: 'rgba(16,185,129,0.1)' }}>
                            <Ionicons name="checkmark-circle" size={18} color="#10b981" />
                            <Text className="flex-1" style={{ color: '#047857', fontFamily: theme.font.bold, fontSize: 13 }}>
                                Reminder sent {formatDateTime(lastReminder!)}. Next one available after {formatDateTime(nextReminderAt!)}.
                            </Text>
                        </View>
                    ) : (
                        <Pressable
                            onPress={sendReminder}
                            disabled={!remoteId || !phone || state.kind === 'sending'}
                            accessibilityRole="button"
                            accessibilityLabel="Send SMS payment reminder"
                            className="h-11 rounded-xl flex-row items-center justify-center gap-2"
                            style={{
                                backgroundColor: OVERDUE,
                                opacity: !remoteId || !phone || state.kind === 'sending' ? 0.55 : 1,
                                ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : {}),
                            }}
                        >
                            {state.kind === 'sending' ? (
                                <ActivityIndicator size="small" color="#fff" />
                            ) : (
                                <Ionicons name="chatbubble-ellipses-outline" size={17} color="#fff" />
                            )}
                            <Text className="text-white" style={{ fontFamily: theme.font.bold, fontSize: 14 }}>
                                {state.kind === 'sending' ? 'Sending…' : 'Send SMS Reminder'}
                            </Text>
                        </Pressable>
                    )}

                    {state.kind === 'error' ? (
                        <Text className="mt-2" style={{ color: OVERDUE, fontFamily: theme.font.medium, fontSize: 12 }}>
                            {state.message}
                        </Text>
                    ) : state.kind === 'idle' && lastReminderValid && !inCooldown ? (
                        <Text className="mt-2" style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12 }}>
                            Last reminder sent {formatDateTime(lastReminder!)}.
                        </Text>
                    ) : !phone ? (
                        <Text className="mt-2" style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12 }}>
                            Add a customer phone number to send reminders.
                        </Text>
                    ) : !remoteId ? (
                        <Text className="mt-2" style={{ color: theme.textDark, fontFamily: theme.font.medium, fontSize: 12 }}>
                            This order hasn't uploaded yet. Reminders can be sent once it syncs.
                        </Text>
                    ) : null}
                </View>
            )}
        </View>
    );
}
