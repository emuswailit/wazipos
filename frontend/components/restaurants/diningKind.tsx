// components/restaurants/diningKind.tsx
//
// The owner screens (orders, menu, tables, bar, supplies, POS…) are shared by
// restaurants and hotels. The Hotel section's routes (app/(hotel)) wrap them in
// <DiningKindProvider kind="hotel"> so their wording says "hotel".

import React, { createContext, useContext } from 'react';

export type DiningKind = 'restaurant' | 'hotel';

const Ctx = createContext<DiningKind>('restaurant');

export function DiningKindProvider({ kind, children }: { kind: DiningKind; children: React.ReactNode }) {
    return <Ctx.Provider value={kind}>{children}</Ctx.Provider>;
}

/** kind, plus the noun for labels: "restaurant" / "Restaurant" or "hotel" / "Hotel". */
export function useDiningKind() {
    const kind = useContext(Ctx);
    const noun = kind === 'hotel' ? 'hotel' : 'restaurant';
    return { kind, noun, Noun: noun.charAt(0).toUpperCase() + noun.slice(1) };
}
