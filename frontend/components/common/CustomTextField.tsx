// components/common/CustomTextField.tsx
import { useAuth } from "@/context/AuthContext";
import { useFormikContext } from "formik";
import { forwardRef, useState } from "react";
import {
    Platform,
    Text,
    TextInput,
    TextInputProps,
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

// 🌟 Reduced font size and tightened spacing
const FONT_SIZE = 12;
const LINE_HEIGHT = 16;
const VERTICAL_PADDING = 6;
const HORIZONTAL_PADDING = 10;

const MIN_HEIGHT = 38; // Standard compact single-line height
const MIN_HEIGHT_MULTI = 80; // Shorter multiline height

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

    const hasError = !!error;
    const isMultiline = !!multiline;

    const borderColor = hasError
        ? "#ef4444"
        : isDarkMode
            ? "rgba(148,163,184,0.18)"
            : "rgba(15,23,42,0.10)";

    const backgroundColor = isDarkMode ? "#0f172a" : theme.surface;

    const baseStyle: TextStyle = {
        backgroundColor,
        color: theme.text,
        borderWidth: 1,
        borderColor,
        borderRadius: 8, // Slightly tighter radius for compact look
        paddingHorizontal: HORIZONTAL_PADDING,
        paddingVertical: isMultiline ? VERTICAL_PADDING : 0, // Let single line center vertically
        textAlign: "left",
        textAlignVertical: isMultiline ? "top" : "center", // Centers single line, top-aligns multiline
        fontSize: FONT_SIZE,
        lineHeight: LINE_HEIGHT,
        minHeight: isMultiline ? MIN_HEIGHT_MULTI : MIN_HEIGHT,
        ...(Platform.OS === "web" ? ({ outlineStyle: "none", resize: isMultiline ? "vertical" : "none" } as any) : {}),
    };

    return (
        <View style={{ width: "100%", gap: 4 }}>
            {label ? (
                <Text
                    style={{
                        color: theme.textDark,
                        fontFamily: theme.font.bold,
                        fontSize: 10, // Reduced from 11
                        letterSpacing: 0.5,
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
            />

            {hasError ? (
                <Text style={{ color: "#ef4444", fontSize: 10, paddingHorizontal: 2 }}>
                    {error}
                </Text>
            ) : hint ? (
                <Text style={{ color: theme.textDark, fontSize: 10, paddingHorizontal: 2 }}>
                    {hint}
                </Text>
            ) : null}
        </View>
    );
});

export default CustomTextField;