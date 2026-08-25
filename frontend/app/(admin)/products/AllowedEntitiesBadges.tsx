import { Text, View } from "react-native";
interface BadgesProps { allowedEntities: string[]; }
export default function AllowedEntitiesBadges({ allowedEntities }: BadgesProps) {
    if (!allowedEntities || allowedEntities.length === 0) {
        return <Text className="text-[10px] italic font-semibold text-slate-400">No restrictions</Text>;
    }
    return (
        <View className="flex-row flex-wrap gap-1">
            {allowedEntities.map((entity, index) => (
                <View key={index} className="bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-lg">

                    <Text className="text-[9px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400">{entity}</Text>
                </View>
            ))}
        </View>
    );
}
