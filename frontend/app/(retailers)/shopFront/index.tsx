import { Platform } from "react-native";

import AdjacentShoppingMobileScreen from "@/components/shoppers/AdjacentShoppingMobileScreen";
import AdjacentShoppingWebScreen from "@/components/shoppers/AdjacentShoppingWebScreen";

const AdjacentShoppingScreen =
    Platform.OS === "web" ? AdjacentShoppingWebScreen : AdjacentShoppingMobileScreen;

export default AdjacentShoppingScreen;