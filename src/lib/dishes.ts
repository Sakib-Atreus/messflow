// Common mess dishes in English and Bangla, so a menu typed in one language reads in the other.
// Each entry: [English name shown, other English spellings…] → Bangla.
// Items that aren't in the list are shown exactly as the manager typed them.

const DISHES: [string[], string][] = [
  [["Rice", "plain rice", "bhat"], "ভাত"],
  [["Fried rice"], "ফ্রাইড রাইস"],
  [["Polao", "pulao", "pilau", "polau"], "পোলাও"],
  [["Khichuri", "khichdi", "khichuri"], "খিচুড়ি"],
  [["Biryani", "biriyani"], "বিরিয়ানি"],
  [["Tehari"], "তেহারি"],
  [["Roti", "ruti", "bread", "chapati"], "রুটি"],
  [["Paratha", "porota"], "পরোটা"],
  [["Dal", "daal", "dhal", "lentil", "lentils", "lentil soup"], "ডাল"],
  [["Chicken", "murgi"], "মুরগি"],
  [["Chicken curry"], "মুরগির তরকারি"],
  [["Chicken roast"], "মুরগির রোস্ট"],
  [["Beef", "goru"], "গরুর মাংস"],
  [["Beef curry"], "গরুর মাংসের তরকারি"],
  [["Mutton", "khashi"], "খাসির মাংস"],
  [["Meat", "mangsho"], "মাংস"],
  [["Fish", "mach", "maach"], "মাছ"],
  [["Fish curry"], "মাছের তরকারি"],
  [["Fish fry", "fried fish"], "মাছ ভাজা"],
  [["Rui fish", "rui", "rohu", "ruhi"], "রুই মাছ"],
  [["Hilsa", "ilish"], "ইলিশ মাছ"],
  [["Pangas", "pangash"], "পাঙ্গাস মাছ"],
  [["Tilapia"], "তেলাপিয়া মাছ"],
  [["Shrimp", "prawn", "prawns", "chingri"], "চিংড়ি"],
  [["Dried fish", "shutki", "shutki bhorta"], "শুঁটকি"],
  [["Egg", "eggs", "dim"], "ডিম"],
  [["Egg curry"], "ডিমের তরকারি"],
  [["Fried egg", "egg fry", "dim bhaji"], "ডিম ভাজি"],
  [["Omelette", "omelet"], "অমলেট"],
  [["Boiled egg"], "সিদ্ধ ডিম"],
  [["Vegetables", "vegetable", "veg", "sabji", "shobji", "sobji"], "সবজি"],
  [["Mixed vegetables", "mixed veg"], "মিক্সড সবজি"],
  [["Vegetable curry"], "সবজির তরকারি"],
  [["Potato", "potatoes", "alu", "aloo"], "আলু"],
  [["Potato fry", "alu bhaji", "aloo bhaji"], "আলু ভাজি"],
  [["Mashed potato", "alu bhorta", "aloo bhorta"], "আলু ভর্তা"],
  [["Bhorta", "vorta", "mash"], "ভর্তা"],
  [["Bhaji", "fry"], "ভাজি"],
  [["Greens", "shak", "saag", "spinach", "leafy greens"], "শাক"],
  [["Curry", "torkari", "tarkari"], "তরকারি"],
  [["Salad"], "সালাদ"],
  [["Soup"], "স্যুপ"],
  [["Chutney"], "চাটনি"],
  [["Pickle", "achar"], "আচার"],
  [["Noodles"], "নুডলস"],
  [["Halim", "haleem"], "হালিম"],
  [["Payesh", "rice pudding", "kheer"], "পায়েস"],
  [["Firni"], "ফিরনি"],
  [["Semai", "vermicelli"], "সেমাই"],
  [["Sweets", "sweet", "dessert", "mishti"], "মিষ্টি"],
  [["Fruit", "fruits"], "ফল"],
  [["Banana", "bananas"], "কলা"],
  [["Tea", "cha"], "চা"],
  [["Milk"], "দুধ"],
  [["Muri", "puffed rice"], "মুড়ি"],
  [["Chira", "flattened rice"], "চিড়া"],
  [["Onion", "onions"], "পেঁয়াজ"],
  [["Tomato", "tomatoes"], "টমেটো"],
  [["Eggplant", "brinjal", "begun"], "বেগুন"],
  [["Beguni"], "বেগুনি"],
  [["Pumpkin", "kumra"], "কুমড়া"],
  [["Lau", "bottle gourd"], "লাউ"],
  [["Cabbage", "badhakopi"], "বাঁধাকপি"],
  [["Cauliflower", "fulkopi"], "ফুলকপি"],
];

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").replace(/^[\s.]+|[\s.!]+$/g, "");
const toBn = new Map<string, string>();
const toEn = new Map<string, string>();
for (const [en, bn] of DISHES) {
  for (const name of en) toBn.set(norm(name), bn);
  if (!toEn.has(bn)) toEn.set(bn, en[0]);
}

function one(item: string, locale: string): string {
  const key = norm(item);
  if (!key) return item;
  if (locale === "bn") {
    const hit = toBn.get(key) ?? toBn.get(key.replace(/s$/, ""));
    if (hit) return hit;
    // "chicken bhorta" → both words known → "মুরগি ভর্তা"; otherwise keep it as typed
    const words = key.split(" ");
    const each = words.map((w) => toBn.get(w) ?? toBn.get(w.replace(/s$/, "")));
    return words.length > 1 && each.every(Boolean) ? each.join(" ") : item;
  }
  return toEn.get(item.trim()) ?? item;
}

/**
 * Shows a menu line in the reader's language: "Rice, chicken curry, dal" → "ভাত, মুরগির তরকারি, ডাল"
 * for Bangla, and the other way round. Unknown dishes stay exactly as written.
 */
export function translateMenu(text: string | null | undefined, locale: string): string {
  if (!text) return "";
  // keep the separators (commas, "and", "+", "/", "ও") so the line reads naturally
  return text
    .split(/(\s*(?:,|،|\+|\/|;|&|\band\b|\sও\s)\s*)/i)
    .map((part, i) => {
      if (i % 2 === 1) {
        const sep = part.trim().toLowerCase();
        if (sep === "and" || sep === "ও") return locale === "bn" ? " ও " : " and ";
        return sep === "," || sep === "،" ? ", " : ` ${sep} `;
      }
      return one(part, locale);
    })
    .join("");
}
