// hooks/useRuntimeClass.ts
//
// Distinguishes the three ways a user can reach the app:
//
//   native       — iOS / Android app
//   mobile-web   — a phone browser (Safari iOS, Chrome Android, …)
//   desktop-web  — a laptop / desktop browser
//
// Width alone is not enough: a desktop user can shrink their window
// and a phone in landscape can exceed 768px. Touch alone is not
// enough: touch-screen laptops exist. UA alone is not enough: it
// can be spoofed and mobile UAs change.
//
// We combine all three, with the phone UA as the primary signal and
// viewport width as the tiebreaker for phones that are wide.

import { useEffect, useState } from "react";
import { Platform, useWindowDimensions } from "react-native";

type RuntimeClass = "native" | "mobile-web" | "desktop-web";

/** Viewport width below which we treat a touch browser as a phone. */
const PHONE_MAX_WIDTH = 820;

const PHONE_UA =
    /Android|iPhone|iPod|Opera Mini|IEMobile|Mobile|Windows Phone/i;

/**
 * iPads and iPad-like tablets have a phone-ish UA string but a
 * large viewport. We treat them as desktop-web by default so the
 * wide 3-column layout renders.
 */
const TABLET_UA = /iPad|Tablet|PlayBook|Silk/i;

function detect(): RuntimeClass {
    if (Platform.OS !== "web") return "native";

    if (typeof window === "undefined" || typeof navigator === "undefined") {
        return "desktop-web";
    }

    const ua = navigator.userAgent || "";

    const isTablet = TABLET_UA.test(ua);
    const isPhoneUA = !isTablet && PHONE_UA.test(ua);

    const hasTouch =
        (window.matchMedia?.("(pointer: coarse)").matches ?? false) ||
        "ontouchstart" in window;

    const isNarrow = window.innerWidth < PHONE_MAX_WIDTH;

    /* Phone UA is the primary signal. If it fires, treat the
       environment as mobile-web regardless of the current viewport
       — a phone in landscape is still a phone. */
    if (isPhoneUA) return "mobile-web";

    /* Fallback: touch-only input on a narrow viewport is almost
       always a phone browser even when the UA is unrecognized. */
    if (hasTouch && isNarrow) return "mobile-web";

    return "desktop-web";
}

/**
 * Reactive runtime class. Re-evaluates when the viewport width
 * crosses the phone threshold so a resizing window can flip the
 * classification mid-session.
 */
export function useRuntimeClass(): RuntimeClass {
    const { width } = useWindowDimensions();
    const [runtimeClass, setRuntimeClass] = useState<RuntimeClass>(() =>
        detect(),
    );

    useEffect(() => {
        setRuntimeClass(detect());
    }, [width]);

    return runtimeClass;
}

/** Non-reactive classification for one-off decisions. */

/** Convenience predicates. */