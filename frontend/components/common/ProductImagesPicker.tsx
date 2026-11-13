// components/common/ProductImagesPicker.tsx
//
// Universal image picker for product visuals.

import * as ImagePicker from 'expo-image-picker';
import {
    Alert,
    Image,
    Platform,
    ScrollView,
    Text,
    TouchableOpacity,
    useWindowDimensions,
    View,
} from 'react-native';

interface Props {
    theme: any;
    isDarkMode: boolean;
    images: string[];
    onImagesChange: (updatedImages: string[]) => void;
}

const MAX_IMAGES = 3;
const LARGE_SCREEN_MIN_WIDTH = 768;

const GRID_TILE_MAX = 120;
const GRID_TILE_GAP = 10;

export default function ProductImagesPicker({
    theme,
    isDarkMode,
    images,
    onImagesChange,
}: Props) {
    const { width } = useWindowDimensions();

    const useStrip =
        Platform.OS === 'web' && width >= LARGE_SCREEN_MIN_WIDTH;

    /* ---------------- Permissions ---------------- */

    const verifyPermissions = async (
        type: 'camera' | 'gallery'
    ): Promise<boolean> => {
        if (Platform.OS === 'web') return true;

        if (type === 'camera') {
            const status =
                await ImagePicker.requestCameraPermissionsAsync();
            if (!status.granted) {
                Alert.alert(
                    'Permission Refused',
                    'Camera hardware access is required to capture product shots.'
                );
                return false;
            }
        } else {
            const status =
                await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (!status.granted) {
                Alert.alert(
                    'Permission Refused',
                    'Media gallery access is required to choose files.'
                );
                return false;
            }
        }
        return true;
    };

    const warnLimit = () => {
        const msg = `You can upload a maximum of ${MAX_IMAGES} product images.`;
        if (Platform.OS === 'web') {
            if (typeof window !== 'undefined') window.alert(msg);
        } else {
            Alert.alert('Limit Reached', msg);
        }
    };

    /* ---------------- Pickers ---------------- */

    const handlePickFromGallery = async () => {
        if (images.length >= MAX_IMAGES) {
            warnLimit();
            return;
        }
        if (!(await verifyPermissions('gallery'))) return;

        const result =
            await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ['images'],
                allowsMultipleSelection: true,
                selectionLimit: MAX_IMAGES - images.length,
                quality: 0.2,
                allowsEditing: Platform.OS !== 'web',
            });

        if (!result.canceled && result.assets) {
            const uris = result.assets.map((a) => a.uri);
            const combined = [...images, ...uris].slice(
                0,
                MAX_IMAGES
            );
            onImagesChange(combined);
        }
    };

    const handleLaunchCamera = async () => {
        if (images.length >= MAX_IMAGES) {
            warnLimit();
            return;
        }
        if (!(await verifyPermissions('camera'))) return;

        const result = await ImagePicker.launchCameraAsync({
            mediaTypes: ['images'],
            quality: 0.2,
            allowsEditing: Platform.OS !== 'web',
        });

        if (
            !result.canceled &&
            result.assets &&
            result.assets.length > 0
        ) {
            const combined = [
                ...images,
                result.assets[0].uri,
            ].slice(0, MAX_IMAGES);
            onImagesChange(combined);
        }
    };

    /* ---------------- Delete ---------------- */

    const handleRemoveImage = (indexToRemove: number) => {
        const filtered = images.filter(
            (_, idx) => idx !== indexToRemove
        );
        onImagesChange(filtered);
    };

    /* ---------------- Thumbnail (strip mode) ---------------- */

    const StripThumbnail = ({
        uri,
        index,
    }: {
        uri: string;
        index: number;
    }) => (
        <View
            style={{
                width: 80,
                height: 80,
                borderColor: theme.primary,
                backgroundColor: isDarkMode ? '#0f172a' : '#f1f5f9',
            }}
            className="rounded-xl border overflow-hidden relative"
        >
            <Image
                source={{ uri }}
                style={{ width: '100%', height: '100%' }}
                resizeMode="cover"
            />

            <TouchableOpacity
                onPress={() => handleRemoveImage(index)}
                activeOpacity={0.7}
                hitSlop={8}
                style={{
                    position: 'absolute',
                    top: 4,
                    right: 4,
                    width: 22,
                    height: 22,
                    borderRadius: 11,
                    backgroundColor: '#ef4444',
                    alignItems: 'center',
                    justifyContent: 'center',
                    shadowColor: '#000',
                    shadowOpacity: 0.15,
                    shadowRadius: 3,
                    shadowOffset: { width: 0, height: 1 },
                    elevation: 2,
                }}
            >
                <Text
                    style={{
                        color: '#ffffff',
                        fontSize: 11,
                        fontWeight: '900',
                        lineHeight: 13,
                    }}
                >
                    ✕
                </Text>
            </TouchableOpacity>
        </View>
    );

    /* ---------------- Thumbnail (grid mode) ---------------- */

    const GridThumbnail = ({
        uri,
        index,
    }: {
        uri: string;
        index: number;
    }) => (
        <View
            style={{
                width: '47%',
                maxWidth: GRID_TILE_MAX,
                aspectRatio: 1,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: isDarkMode
                    ? 'rgba(148,163,184,0.15)'
                    : 'rgba(15,23,42,0.06)',
                backgroundColor: isDarkMode
                    ? '#0f172a'
                    : '#f1f5f9',
                overflow: 'hidden',
                position: 'relative',
            }}
        >
            <Image
                source={{ uri }}
                style={{ width: '100%', height: '100%' }}
                resizeMode="cover"
            />

            <TouchableOpacity
                onPress={() => handleRemoveImage(index)}
                activeOpacity={0.7}
                hitSlop={8}
                style={{
                    position: 'absolute',
                    top: 4,
                    right: 4,
                    width: 20,
                    height: 20,
                    borderRadius: 10,
                    backgroundColor: '#ef4444',
                    alignItems: 'center',
                    justifyContent: 'center',
                    shadowColor: '#000',
                    shadowOpacity: 0.15,
                    shadowRadius: 3,
                    shadowOffset: { width: 0, height: 1 },
                    elevation: 2,
                }}
            >
                <Text
                    style={{
                        color: '#ffffff',
                        fontSize: 10,
                        fontWeight: '900',
                        lineHeight: 12,
                    }}
                >
                    ✕
                </Text>
            </TouchableOpacity>
        </View>
    );

    /* ---------------- Render ---------------- */

    return (
        <View className="items-start w-full gap-y-2 mt-1">
            {/* Header */}
            <Text
                style={{ color: theme.textDark, fontFamily: theme.font.bold }}
                className="text-[10px] uppercase tracking-wider mb-1"
            >
                Product Visual Attachments ({images.length}/
                {MAX_IMAGES})
            </Text>

            {/* Action buttons - Compact 38px height */}
            <View className="flex-row items-center gap-x-3 w-full">
                <TouchableOpacity
                    onPress={handlePickFromGallery}
                    disabled={images.length >= MAX_IMAGES}
                    style={{
                        borderColor: theme.primary,
                        opacity: images.length >= MAX_IMAGES ? 0.5 : 1,
                        height: 38, // 🌟 Compact height
                    }}
                    className="flex-1 border rounded-lg justify-center items-center flex-row bg-slate-500/5 active:opacity-70"
                >
                    <Text
                        style={{ color: theme.primary, fontFamily: theme.font.bold, fontSize: 11 }}
                        className="uppercase tracking-wider"
                    >
                        📁 Open Gallery
                    </Text>
                </TouchableOpacity>

                <TouchableOpacity
                    onPress={handleLaunchCamera}
                    disabled={images.length >= MAX_IMAGES}
                    style={{
                        backgroundColor: theme.primary,
                        opacity: images.length >= MAX_IMAGES ? 0.5 : 1,
                        height: 38, // 🌟 Compact height
                    }}
                    className="flex-1 rounded-lg justify-center items-center flex-row shadow-sm active:opacity-90"
                >
                    <Text
                        className="text-white uppercase tracking-wider"
                        style={{ fontFamily: theme.font.bold, fontSize: 11 }}
                    >
                        📸 Launch Camera
                    </Text>
                </TouchableOpacity>
            </View>

            {/* ─── Large web — horizontal strip ─── */}
            {images.length > 0 && useStrip ? (
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{
                        gap: 12,
                        paddingVertical: 4,
                    }}
                    className="w-full"
                >
                    {images.map((uri, index) => (
                        <StripThumbnail
                            key={`${uri}-${index}`}
                            uri={uri}
                            index={index}
                        />
                    ))}
                </ScrollView>
            ) : null}

            {/* ─── Native + small web — 2-column grid ─── */}
            {images.length > 0 && !useStrip ? (
                <View
                    style={{
                        width: '100%',
                        flexDirection: 'row',
                        flexWrap: 'wrap',
                        gap: GRID_TILE_GAP,
                        paddingVertical: 4,
                    }}
                >
                    {images.map((uri, index) => (
                        <GridThumbnail
                            key={`${uri}-${index}`}
                            uri={uri}
                            index={index}
                        />
                    ))}
                </View>
            ) : null}
        </View>
    );
}