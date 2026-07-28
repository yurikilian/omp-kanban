import { describe, expect, it } from "vitest";
import {
  DEFAULT_PREFERENCES,
  PREFERENCES_STORAGE_KEY,
  savePreferences,
  type PreferencesStorage,
} from "@/lib/preferences";

describe("savePreferences", () => {
  it("[E2-S3-AC4] persists only the supported preference schema", () => {
    let serialized: string | null = null;
    const storage: PreferencesStorage = {
      getItem: () => serialized,
      removeItem: () => {
        serialized = null;
      },
      setItem: (_key, value) => {
        serialized = value;
      },
    };

    const preferences = { ...DEFAULT_PREFERENCES, unexpected: true };
    savePreferences(storage, preferences);

    expect(storage.getItem(PREFERENCES_STORAGE_KEY)).toBe(JSON.stringify(DEFAULT_PREFERENCES));
  });
});