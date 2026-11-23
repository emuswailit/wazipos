// components/common/CustomTextField.tsx
import { useAuth } from "@/context/AuthContext";
import { useFormikContext } from "formik";
import { forwardRef, useState } from "react";
import {
    Platform,
    Text,
    TextInput,
    TextInputProps,
    useWindowDimensions,
    View,
    type TextStyle,
} from "react-native";

interface CustomTextFieldProps extends TextInputProps {
    label?: string;
    error?: string;
    hint?: string;
    name?: string;
    /** Shows a red asterisk after the label (validation is up to the form). */
    required?: boolean;
    /** Formik mode: converts the typed text before storing it (e.g. text → number). */
    transform?: (raw: string) => any;
    /** Formik mode: renders the stored value as text when the field isn't focused. */
    format?: (value: any) => string;
}

type Props = CustomTextFieldProps;

// Phones: 16px text so iOS Safari never zooms on focus; desktop web a touch smaller.
const isWebPlatform = Platform.OS === "web";
const LINE_HEIGHT = 20;
const VERTICAL_PADDING = 10;
const HORIZONTAL_PADDING = 14;

const MIN_HEIGHT = 46; // Comfortable thumb-sized single line
const MIN_HEIGHT_MULTI = 96;

export function CustomTextField(props: Props) {
    if (props.name) {
        return <FormikBound {...props} name={props.name} />;
    }
    return <PlainField {...props} />;
}

function FormikBound({ transform, format, ...props }: Props & { name: string }) {
    const ctx = useFormikContext<any>();
    const raw = ctx?.values?.[props.name];
    const error = (ctx?.errors?.[props.name] as string | undefined) ?? undefined;
    const touched = ctx?.touched?.[props.name];

    // While focused, show exactly what's typed (so "12." isn't snapped to "12" by
    // transform → format); when not focused, show the formatted stored value.
    const [draft, setDraft] = useState<string | null>(null);
    const shown = draft ?? (format ? format(raw) : String(raw ?? ""));

    return (
        <PlainField
            {...props}
            value={shown}
            onChangeText={(text) => {
                if (transform || format) setDraft(text);
                ctx.setFieldValue(props.name, transform ? transform(text) : text);
            }}
            onBlur={(e) => {
                setDraft(null);
                ctx.setFieldTouched(props.name, true);
                props.onBlur?.(e);
            }}
            error={props.error ?? (touched ? error : undefined)}
        />
    );
}

const PlainField = forwardRef<TextInput, Props>(function PlainField(
    {
        label,
        error,
        hint,
        required,
        multiline,
        numberOfLines,
        style,
        placeholderTextColor,
        ...rest
    },
    ref
) {
    const { theme, isDarkMode } = useAuth();
    const { width } = useWindowDimensions();
    const FONT_SIZE = isWebPlatform && width >= 768 ? 14 : 16;
    const [focused, setFocused] = useState(false);

    const hasError = !!error;
    const isMultiline = !!multiline;

    const borderColor = hasError
        ? theme.danger
        : focused
            ? theme.primary
            : isDarkMode
                ? "rgba(148,163,184,0.16)"
                : "rgba(15,23,42,0.08)";

    // Filled field at rest, panel colour with a cobalt ring while typing.
    const backgroundColor = focused ? theme.panel : isDarkMode ? "rgba(148,163,184,0.08)" : "#f4f7fc";

    const baseStyle: TextStyle = {
        backgroundColor,
        color: theme.text,
        borderWidth: 1.5,
        borderColor,
        borderRadius: 12,
        fontFamily: theme.font.medium,
        paddingHorizontal: HORIZONTAL_PADDING,
        paddingVertical: isMultiline ? VERTICAL_PADDING : 0, // Let single line center vertically
        textAlign: "left",
        textAlignVertical: isMultiline ? "top" : "center", // Centers single line, top-aligns multiline
        fontSize: FONT_SIZE,
        lineHeight: LINE_HEIGHT,
        minHeight: isMultiline ? MIN_HEIGHT_MULTI : MIN_HEIGHT,
        ...(focused && !hasError
            ? isWebPlatform
                ? ({ boxShadow: `0 0 0 4px ${theme.primary}22` } as any)
                : {}
            : {}),
        ...(isWebPlatform ? ({ outlineStyle: "none", resize: isMultiline ? "vertical" : "none", transition: "border-color 120ms, box-shadow 120ms, background-color 120ms" } as any) : {}),
    };

    return (
        <View style={{ width: "100%", gap: 4 }}>
            {label ? (
                <Text
                    style={{
                        color: theme.textDark,
                        fontFamily: theme.font.bold,
                        fontSize: 11,
                        letterSpacing: 0.6,
                        textTransform: "uppercase",
                        paddingHorizontal: 2,
                    }}
                >
                    {label}
                    {required ? <Text style={{ color: "#ef4444" }}> *</Text> : null}
                </Text>
            ) : null}

            <TextInput
                ref={ref}
                multiline={isMultiline}
                scrollEnabled={isMultiline ? false : undefined}
                placeholderTextColor={placeholderTextColor ?? (isDarkMode ? "#64748b" : "#94a3b8")}
                style={[baseStyle, style]}
                {...rest}
                onFocus={(e) => {
                    setFocused(true);
                    rest.onFocus?.(e);
                }}
                onBlur={(e) => {
                    setFocused(false);
                    rest.onBlur?.(e);
                }}
            />

            {hasError ? (
                <Text style={{ color: theme.danger, fontFamily: theme.font.medium, fontSize: 12, paddingHorizontal: 2 }}>
                    {error}
                </Text>
            ) : hint ? (
                <Text style={{ color: theme.textDark, fontFamily: theme.font.regular, fontSize: 12, paddingHorizontal: 2 }}>
                    {hint}
                </Text>
            ) : null}
        </View>
    );
});

export default CustomTextField;