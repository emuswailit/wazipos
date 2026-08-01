import AsyncStorage from "@react-native-async-storage/async-storage";

const CACHE_PREFIX = "cache_";
const EXPIRY_IN_MINUTES = 5;

// ==========================================
// DATA CONTRACT STRUCTURES
// ==========================================

interface CacheItem<T = any> {
  value: T;
  timestamp: number;
}

// ==========================================
// LOGIC TRACKING FUNCTIONS
// ==========================================

/**
 * Validates cache age limitations natively without loading heavy date utility frameworks.
 */
const isExpired = (item: CacheItem): boolean => {
  const now = Date.now();
  const storedTime = item.timestamp;

  // Convert chronological metrics seamlessly into standard minute tracking points
  const differenceInMinutes = (now - storedTime) / 1000 / 60;

  return differenceInMinutes > EXPIRY_IN_MINUTES;
};

/**
 * Commits generic payload tracking blocks safely down into local device database sectors.
 */
const store = async <T = any>(key: string, value: T): Promise<void> => {
  try {
    const item: CacheItem<T> = {
      value,
      timestamp: Date.now(),
    };
    await AsyncStorage.setItem(CACHE_PREFIX + key, JSON.stringify(item));
  } catch (error) {
    console.error("AsyncStorage Error: Could not save cache block:", error);
  }
};

/**
 * Extracts and unmarshals saved storage records, wiping outdated blocks automatically.
 */
const get = async <T = any>(key: string): Promise<T | null> => {
  try {
    const value = await AsyncStorage.getItem(CACHE_PREFIX + key);
    if (!value) return null;

    const item: CacheItem<T> = JSON.parse(value);

    if (isExpired(item)) {
      // Clean up storage records asynchronously if data files become stale
      await AsyncStorage.removeItem(CACHE_PREFIX + key);
      return null;
    }

    return item.value;
  } catch (error) {
    console.error(`AsyncStorage Error: Retrieval breakdown at key '${key}':`, error);
    return null;
  }
};

export const cacheService = {
  get,
  store,
};

export default cacheService;
