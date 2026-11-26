// "বাজারে লাগবে": the things khala can ask for with one tap. Labels live in messages/*.json (needs.items.*).
export const NEED_ITEMS = [
  { key: "oil", emoji: "🫗" },
  { key: "salt", emoji: "🧂" },
  { key: "onion", emoji: "🧅" },
  { key: "chili", emoji: "🌶️" },
  { key: "turmeric", emoji: "🟡" },
  { key: "garlic", emoji: "🧄" },
  { key: "ginger", emoji: "🫚" },
  { key: "spices", emoji: "🥘" },
  { key: "rice", emoji: "🍚" },
  { key: "dal", emoji: "🫘" },
  { key: "potato", emoji: "🥔" },
  { key: "egg", emoji: "🥚" },
  { key: "sugar", emoji: "🍬" },
  { key: "tea", emoji: "🍵" },
  { key: "soap", emoji: "🧼" },
  { key: "gas", emoji: "🔥" },
] as const;
export type NeedKey = (typeof NEED_ITEMS)[number]["key"];
export const NEED_KEYS: readonly string[] = NEED_ITEMS.map((i) => i.key);
export const needEmoji = (key: string) => NEED_ITEMS.find((i) => i.key === key)?.emoji ?? "🛒";

/** Voice messages are deleted after this many days. */
export const VOICE_KEEP_DAYS = 30;
