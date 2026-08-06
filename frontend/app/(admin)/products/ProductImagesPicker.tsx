import * as ImagePicker from "expo-image-picker";
import { Alert, Image, Platform, ScrollView, Text, TouchableOpacity, View } from "react-native";

interface ProductImagesPickerProps {
    theme: any;
    isDarkMode: boolean;
    images: string[];
    onImagesChange: (updatedImages: string[]) => void;
}

export default function ProductImagesPicker({ theme, isDarkMode, images, onImagesChange }: ProductImagesPickerProps) {
    const verifyPermissions = async (type: "camera" | "gallery") => {
        if (Platform.OS === "web") return true;
        if (type === "camera") {
            const cameraStatus = await ImagePicker.requestCameraPermissionsAsync();
            if (!cameraStatus.granted) {
                Alert.alert("Permission Refused", "Camera hardware access is required to capture product shots.");
                return false;
            }
        } else {
            const galleryStatus = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (!galleryStatus.granted) {
                Alert.alert("Permission Refused", "Media gallery access is required to choose files.");
                return false;
            }
        }
        return true;
    };

    const handlePickFromGallery = async () => {
        if (images.length >= 3) {
            if (Platform.OS === "web") alert("Maximum boundary reached! You can link up to 3 catalog images.");
            else Alert.alert("Limit Reached", "You can upload a maximum of 3 product images.");
            return;
        }
        const hasPermission = await verifyPermissions("gallery");
        if (!hasPermission) return;
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ["images"],
            allowsMultipleSelection: true,
            selectionLimit: 3 - images.length,
            quality: 0.2,
            allowsEditing: Platform.OS !== "web",
        });
        if (!result.canceled && result.assets) {
            const selectedUris = result.assets.map(asset => asset.uri);
            const combined = [...images, ...selectedUris].slice(0, 3);
            onImagesChange(combined);
        }
    };

    const handleLaunchCamera = async () => {
        if (images.length >= 3) {
            if (Platform.OS === "web") alert("Maximum boundary reached! You can link up to 3 catalog images.");
            else Alert.alert("Limit Reached", "You can upload a maximum of 3 product images.");
            return;
        }
        const hasPermission = await verifyPermissions("camera");
        if (!hasPermission) return;
        const result = await ImagePicker.launchCameraAsync({
            mediaTypes: ["images"],
            quality: 0.2,
            allowsEditing: Platform.OS !== "web",
        });
        if (!result.canceled && result.assets && result.assets.length > 0) {
            const combined = [...images, result.assets[0].uri].slice(0, 3);
            onImagesChange(combined);
        }
    };

    const handleRemoveImage = (indexToRemove: number) => {
        const filtered = images.filter((_, idx) => idx !== indexToRemove);
        onImagesChange(filtered);
    };

    return (
        <View className="items-start w-full gap-y-2 mt-1">
            <Text style={{ color: theme.textDark }} className="text-[10px] uppercase font-black tracking-wider">Product Visual Attachments ({images.length}/3)</Text>
            <View className="flex-row items-center gap-x-3 w-full">
                <TouchableOpacity onPress={handlePickFromGallery} style={{ borderColor: theme.primary }} className="flex-1 h-11 border rounded-xl justify-center items-center flex-row bg-slate-500/5 active:opacity-70">
                    <Text style={{ color: theme.primary }} className="text-xs font-black uppercase tracking-wider">📁 Open Gallery</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleLaunchCamera} style={{ backgroundColor: theme.primary }} className="flex-1 h-11 rounded-xl justify-center items-center flex-row shadow-sm active:opacity-90">
                    <Text className="text-white font-black text-xs uppercase tracking-wider">📸 Launch Camera</Text>
                </TouchableOpacity>
            </View>
            {images.length > 0 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row gap-x-3 mt-2 py-1 w-full">
                    {images.map((uri, index) => (
                        <View key={index} style={{ borderColor: theme.primary }} className="w-20 h-20 rounded-xl border relative overflow-hidden bg-slate-100">
                            <Image source={{ uri }} style={{ width: "100%", height: "100%" }} className="object-cover" />
                            <TouchableOpacity onPress={() => handleRemoveImage(index)} activeOpacity={0.7} className="absolute top-1 right-1 w-5 h-5 rounded-full bg-red-500 justify-center items-center shadow-sm">
                                <Text className="text-white text-[10px] font-black leading-none">✕</Text>
                            </TouchableOpacity>
                        </View>
                    ))}
                </ScrollView>
            )}
        </View>
    );
}
