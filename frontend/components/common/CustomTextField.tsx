import { useAuth } from "@/context/AuthContext";
import { useFormikContext } from "formik";
import { forwardRef } from "react";
import {
    Text,
    TextInput,
    TextInputProps,
    View,
} from "react-native";

interface Props extends TextInputProps {
    label?: string;
    error?: string;
    hint?: string;
    multiline?: boolean;
    /**
     * When set, the field is bound to a parent <Formik> — value, errors,
     * and onChangeText are pulled from context. When omitted, the field is
     * a plain controlled input driven entirely by props.
     */
    name?: string;
}

/**
 * Public entry point.
 *
 * Splitting the Formik-bound and plain render paths into two components
 * is deliberate: useFormikContext() logs a warning when called outside a
 * <Formik> provider, so we must only call it when the caller has opted in
 * via `name`.
 */
export function CustomTextField(props: Props) {
    if (props.name) {
        return <FormikBound {...props} name={props.name} />;
    }
    return <PlainField {...props} />;
}

/* =========================================================
 * Formik-bound path — hook only runs when `name` is set
 * ======================================================= */

function FormikBound(props: Props & { name: string }) {
    const ctx = useFormikContext<any>();

    const value = (ctx?.values?.[props.name] ?? "") as string;
    const error = (ctx?.errors?.[props.name] as string | undefined) ?? undefined;
    const touched = ctx?.touched?.[props.name];

    return (
        <PlainField
            {...props}
            value={value}
            onChangeText={(text) => ctx.setFieldValue(props.name, text)}
            onBlur={(e) => {
                ctx.setFieldTouched(props.name, true);
                props.onBlur?.(e);
            }}
            error={props.error ?? (touched ? error : undefined)}
        />
    );
}

/* =========================================================
 * Plain path — no Formik dependency
 * ======================================================= */

const PlainField = forwardRef<TextInput, Props>(function PlainField(
    {
        label,
        error,
        hint,
        multiline,
        style,
        placeholderTextColor,
        ...rest
    },
    ref
) {
    const { theme, isDarkMode } = useAuth();

    return (
        <View style={{ gap: 6 }}>
            {label ? (
                <Text
                    style={{
                        color: theme.textDark,
                        fontSize: 11,
                        fontWeight: "500",
                        letterSpacing: 0.5,
                        textTransform: "uppercase",
                    }}
                >
                    {label}
                </Text>
            ) : null}

            <TextInput
                ref={ref}
                multiline={multiline}
                placeholderTextColor={
                    placeholderTextColor ?? (isDarkMode ? "#64748b" : "#94a3b8")
                }
                style={[
                    {
                        backgroundColor: theme.surface,
                        color: theme.text,
                        borderColor: error ? "#ef4444" : theme.border,
                        borderWidth: 1,
                        borderRadius: 12,
                        paddingHorizontal: 12,
                        paddingVertical: 12,
                        fontSize: 15,
                        minHeight: multiline ? 88 : 48,
                    },
                    multiline ? { textAlignVertical: "top" } : null,
                    style,
                ]}
                {...rest}
            />

            {error ? (
                <Text style={{ color: "#ef4444", fontSize: 12 }}>{error}</Text>
            ) : hint ? (
                <Text style={{ color: theme.textDark, fontSize: 12 }}>{hint}</Text>
            ) : null}
        </View>
    );
});