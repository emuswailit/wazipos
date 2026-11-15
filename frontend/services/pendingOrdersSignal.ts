// services/pendingOrdersSignal.ts
//
// Tells anything showing "orders waiting to sync" (PendingSyncBanner) that the
// offline queues changed: an order was saved offline, or an upload ran.

type Listener = () => void;
const listeners = new Set<Listener>();

export function onPendingOrdersChanged(fn: Listener): () => void {
    listeners.add(fn);
    return () => {
        listeners.delete(fn);
    };
}

export function notifyPendingOrdersChanged(): void {
    for (const fn of Array.from(listeners)) {
        try {
            fn();
        } catch {
            /* a listener's problem is its own */
        }
    }
}
