import { useAuth } from "@/context/AuthContext";
import { KeyboardAvoidingView, Platform, View } from "react-native";

// Import your folder components using clean absolute path formats
import LoginForm from "./LoginForm";
import WaziposHeader from "./WaziposHeader";

export default function LoginScreen() {
    const { theme } = useAuth();

    return (
        <View
            style={{ backgroundColor: Platform.OS === "web" ? "#f8fafc" : theme.background }}
            className="flex-1 items-center justify-center w-full px-4"
        >
            <KeyboardAvoidingView
                behavior={Platform.OS === "ios" ? "padding" : "height"}
                className="w-full flex items-center justify-center"
            >
                <View
                    style={{ backgroundColor: theme.background }}
                    className="w-full md:w-1/2 max-w-md p-6 md:p-10 rounded-2xl web:shadow-xl web:border web:border-slate-100"
                >
                    <WaziposHeader />
                    <LoginForm />
                </View>
            </KeyboardAvoidingView>
        </View>
    );
}
