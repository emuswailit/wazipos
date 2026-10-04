// components/common/formik.tsx
//
// Formik adapters for the common inputs.
//
// Each adapter owns three concerns so the caller doesn't repeat them:
//   - reads  `formik.values[name]`
//   - writes `formik.setFieldValue(name, v)` + `setFieldTouched(name, true, false)`
//   - derives `hasError = touched && errors[name]`
//
// Usage:
//
//   <FormikSelect
//       formik={formik}
//       name="unit_of_receipt"
//       options={['Piece', 'Box', ...]}
//       theme={theme}
//       isDarkMode={isDarkMode}
//       placeholder="Select unit..."
//       searchable
//   />
//
//   <FormikDatePicker
//       formik={formik}
//       name="expiry_date"
//       theme={theme}
//       isDarkMode={isDarkMode}
//       placeholder="Select expiry date..."
//       minDate={new Date()}
//   />
//
//   <FormikFieldError formik={formik} name="unit_of_receipt" />
//
// Note: Formik v2's `field.onChange` expects an event object, so the
// `{...formik.getFieldProps(name)}` spread does not work for custom
// inputs that emit raw values. These adapters use the officially
// recommended `setFieldValue` / `setFieldTouched` path instead.

import React from 'react';

import DatePicker, {
    type DatePickerProps,
} from './DatePicker';
import { FormFieldError } from './FormField';
import Select, { type SelectProps } from './Select';

/* Minimal shape we need from a Formik bag. Kept loose so this file
 * doesn't have to know the form's value type. */
type FormikLike = {
    values: Record<string, any>;
    errors: Record<string, any>;
    touched: Record<string, any>;
    setFieldValue: (field: string, value: any) => void;
    setFieldTouched: (
        field: string,
        isTouched?: boolean,
        shouldValidate?: boolean
    ) => void;
};

/* =========================================================
 * FormikSelect
 * ======================================================= */

export interface FormikSelectProps
    extends Omit<
        SelectProps,
        'value' | 'onChange' | 'hasError'
    > {
    formik: FormikLike;
    name: string;
    /**
     * Mark the field touched on every change. Default `true` — a
     * selection is a stronger "user is done" signal than a blur.
     */
    touchOnChange?: boolean;
}

export function FormikSelect({
    formik,
    name,
    touchOnChange = true,
    ...rest
}: FormikSelectProps) {
    const error = formik.errors?.[name];
    const touched = formik.touched?.[name];

    return (
        <Select
            {...rest}
            value={formik.values?.[name] ?? ''}
            hasError={!!touched && !!error}
            onChange={(value) => {
                formik.setFieldValue(name, value);
                if (touchOnChange) {
                    formik.setFieldTouched(name, true, false);
                }
            }}
        />
    );
}

/* =========================================================
 * FormikDatePicker
 * ======================================================= */

export interface FormikDatePickerProps
    extends Omit<
        DatePickerProps,
        'value' | 'onChange' | 'hasError'
    > {
    formik: FormikLike;
    name: string;
    touchOnChange?: boolean;
}

export function FormikDatePicker({
    formik,
    name,
    touchOnChange = true,
    ...rest
}: FormikDatePickerProps) {
    const error = formik.errors?.[name];
    const touched = formik.touched?.[name];

    return (
        <DatePicker
            {...rest}
            value={formik.values?.[name] ?? null}
            hasError={!!touched && !!error}
            onChange={(value) => {
                formik.setFieldValue(name, value);
                if (touchOnChange) {
                    formik.setFieldTouched(name, true, false);
                }
            }}
        />
    );
}

/* =========================================================
 * FormikFieldError
 *
 * Renders the field's error only when it's been touched.
 * Falls back to `null` otherwise.
 * ======================================================= */

export function FormikFieldError({
    formik,
    name,
}: {
    formik: FormikLike;
    name: string;
}) {
    const error = formik.errors?.[name];
    const touched = formik.touched?.[name];

    if (!touched || !error) return null;

    return <FormFieldError message={String(error)} />;
}