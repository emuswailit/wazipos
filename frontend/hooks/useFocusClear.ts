// components/common/hooks/useFocusClear.ts
//
// "Clear on focus, restore on blur if untouched" behaviour.
//
// - onFocus: remembers the current value and shows an empty string
// - onChange: writes the typed value through to the parent
// - onBlur:   if the field is still empty, restores the remembered value
//
// Works with both Formik-backed and controlled inputs.
// Pure JS — identical behaviour on React Native and React Native Web.

import { useCallback, useRef, useState } from 'react';

export interface UseFocusClearParams {
    /** The current "real" value (Formik value, controlled value, etc.) */
    value: string;
    /** Called whenever the input should write a new value. */
    setValue: (v: string) => void;
}

export interface UseFocusClearReturn {
    /** Value the input should display right now. */
    displayValue: string;
    /** Attach to the input's `onFocus`. */
    onFocus: () => void;
    /** Attach to the input's `onChangeText`. */
    onChange: (next: string) => void;
    /** Attach to the input's `onBlur`. */
    onBlur: () => void;
    /** True while the input is focused. */
    focused: boolean;
}

export function useFocusClear({
    value,
    setValue,
}: UseFocusClearParams): UseFocusClearReturn {
    const remembered = useRef<string>('');
    const [focused, setFocused] = useState(false);
    const [scratch, setScratch] = useState<string>('');

    const onFocus = useCallback(() => {
        remembered.current = value;
        setScratch('');
        setFocused(true);
    }, [value]);

    const onChange = useCallback(
        (next: string) => {
            setScratch(next);
            setValue(next);
        },
        [setValue]
    );

    const onBlur = useCallback(() => {
        setFocused(false);
        // If the user didn't type anything meaningful, restore the
        // previous value. This keeps the field from being wiped by
        // a stray tap.
        if (scratch.trim() === '' && remembered.current !== '') {
            setValue(remembered.current);
        }
        setScratch('');
        remembered.current = '';
    }, [scratch, setValue]);

    // What the input should display right now:
    //   focused & untouched → empty (typing starts fresh)
    //   focused & typing    → the typed value
    //   blurred             → the actual value
    const displayValue = focused && scratch === '' ? '' : value;

    return { displayValue, onFocus, onChange, onBlur, focused };
}