import { useAuth } from "@/context/AuthContext";
import { ActivityIndicator, View } from "react-native";

export default function Index() {
    const { theme } = useAuth();
    return (
        <View style={{ backgroundColor: theme.background }} className="flex-1 items-center justify-center">
            <ActivityIndicator size="small" color={theme.primary} />
        </View>
    );
}
