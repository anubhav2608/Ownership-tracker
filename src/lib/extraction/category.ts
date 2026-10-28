import type { Category } from "@/lib/types";

// A starting category for an extracted line, from the words in its name. Only
// a default for the review screen: the user sees it and can change it.
//
// Every category scores the name: product words ("t-shirt", "refrigerator")
// count most, then telling details ("Size: L", "128 GB"), then brands; the
// merchant can tip a close call (Myntra sells clothes). The best score wins;
// with no evidence at all the line is Miscellaneous.

type Rule = { words: string[]; weight: number };

const PRODUCT = 3;
const DETAIL = 2;
const BRAND = 1;
const HEAD_NOUN = 1.5;

const RULES: Record<Exclude<Category, "Miscellaneous">, Rule[]> = {
  Clothing: [
    {
      weight: PRODUCT,
      words: [
        "t shirt", "tshirt", "tee", "shirt", "sweatshirt", "hoodie", "pullover", "sweater", "cardigan", "jacket",
        "coat", "blazer", "jeans", "denim", "trouser", "pant", "chino", "shorts", "skirt", "dress", "gown", "top",
        "tunic", "kurta", "kurti", "saree", "sari", "lehenga", "dupatta", "salwar", "legging", "jegging", "jogger",
        "track pant", "tracksuit", "innerwear", "brief", "boxer", "bra", "vest", "nightwear", "pyjama", "pajama",
        "co ord", "jumpsuit", "dungaree", "shoe", "sneaker", "sandal", "slipper", "flip flop", "boot", "loafer",
        "heel", "sock", "cap", "beanie", "scarf", "stole",
      ],
    },
    {
      weight: DETAIL,
      words: [
        "size", "regular fit", "slim fit", "relaxed fit", "oversized", "round neck", "v neck", "polo",
        "full sleeve", "half sleeve", "short sleeve", "sleeveless", "cotton", "printed", "solid", "striped",
        "checked", "men", "women", "boys", "girls", "kids", "unisex",
      ],
    },
    {
      weight: BRAND,
      words: [
        "united colors of benetton", "benetton", "souled store", "levi", "zara", "h m", "roadster", "hrx",
        "allen solly", "van heusen", "peter england", "louis philippe", "us polo", "jack jones", "biba", "w for woman",
        "puma", "nike", "adidas", "reebok", "jockey", "bewakoof", "mango", "vero moda", "fabindia",
      ],
    },
  ],
  Electronics: [
    {
      weight: PRODUCT,
      words: [
        "phone", "smartphone", "mobile", "iphone", "laptop", "notebook", "macbook", "tablet", "ipad", "tv",
        "television", "monitor", "headphone", "earphone", "earbud", "airpod", "speaker", "soundbar", "camera",
        "smartwatch", "watch", "keyboard", "mouse", "router", "console", "playstation", "xbox", "printer", "ssd",
        "hard drive", "pen drive", "power bank", "projector", "kindle", "drone", "gimbal",
      ],
    },
    {
      weight: DETAIL,
      words: [
        "gb", "tb", "ram", "rom", "mah", "inch", "4k", "uhd", "oled", "qled", "led", "hdmi", "bluetooth", "wireless",
        "wifi", "5g", "anc", "noise cancelling", "processor",
      ],
    },
    {
      weight: BRAND,
      words: [
        "sony", "samsung", "apple", "oneplus", "xiaomi", "redmi", "realme", "vivo", "oppo", "motorola", "nokia",
        "boat", "jbl", "bose", "sennheiser", "lenovo", "hp", "dell", "asus", "acer", "msi", "canon", "nikon",
        "logitech", "fire boltt", "google pixel",
      ],
    },
  ],
  Appliances: [
    {
      weight: PRODUCT,
      words: [
        "ac", "air conditioner", "refrigerator", "fridge", "washing machine", "washer", "dryer", "microwave", "oven",
        "otg", "air purifier", "water purifier", "purifier", "geyser", "water heater", "room heater", "dishwasher",
        "vacuum", "mixer", "grinder", "juicer", "blender", "fan", "chimney", "cooler", "air fryer", "fryer",
        "toaster", "iron", "induction", "cooktop", "hob", "kettle", "rice cooker", "sandwich maker", "coffee maker",
        "trimmer", "hair dryer", "straightener",
      ],
    },
    { weight: DETAIL, words: ["ton", "litre", "liter", "star rating", "inverter", "front load", "top load", "watt"] },
    {
      weight: BRAND,
      words: [
        "lg", "whirlpool", "haier", "voltas", "daikin", "blue star", "godrej", "ifb", "bosch", "philips", "bajaj",
        "prestige", "havells", "crompton", "usha", "kent", "aquaguard", "eureka forbes", "morphy richards",
        "dyson", "panasonic", "hitachi", "lloyd",
      ],
    },
  ],
  Vehicle: [
    {
      weight: PRODUCT,
      words: ["car", "scooter", "motorcycle", "motorbike", "bike", "bicycle", "cycle", "tyre", "tire", "helmet"],
    },
    { weight: DETAIL, words: ["cc", "petrol", "diesel", "ex showroom", "registration", "chassis"] },
    {
      weight: BRAND,
      words: ["maruti", "hyundai", "tata motors", "mahindra", "honda", "toyota", "kia", "hero", "tvs", "royal enfield", "ather", "ola electric", "yamaha"],
    },
  ],
  Furniture: [
    {
      weight: PRODUCT,
      words: [
        "sofa", "chair", "table", "desk", "bed", "mattress", "wardrobe", "almirah", "shelf", "bookshelf", "cabinet",
        "recliner", "stool", "bench", "dresser", "tv unit", "shoe rack", "side table", "dining set",
      ],
    },
    { weight: DETAIL, words: ["seater", "sheesham", "engineered wood", "plywood", "queen size", "king size", "ergonomic"] },
    { weight: BRAND, words: ["ikea", "urban ladder", "pepperfry", "wakefit", "sleepwell", "durian", "nilkamal", "featherlite"] },
  ],
  Accessories: [
    {
      weight: PRODUCT,
      words: [
        "case", "cover", "back cover", "cable", "charger", "adapter", "screen guard", "screen protector",
        "tempered glass", "strap", "stand", "mount", "pouch", "sleeve", "wallet", "belt", "sunglasses",
        "bag", "backpack", "handbag", "luggage", "trolley", "watch strap", "ring", "earring", "necklace", "bracelet",
      ],
    },
    { weight: DETAIL, words: ["compatible with", "for iphone", "for samsung", "usb c", "type c", "lightning"] },
    { weight: BRAND, words: ["spigen", "anker", "portronics", "wildcraft", "american tourister", "skybags", "fastrack"] },
  ],
  Home: [
    {
      weight: PRODUCT,
      words: [
        "curtain", "bedsheet", "bed sheet", "blanket", "comforter", "quilt", "dohar", "towel", "pillow", "cushion",
        "cookware", "pan", "kadai", "pressure cooker", "tawa", "dinner set", "cutlery", "lamp", "bulb", "rug",
        "carpet", "doormat", "bottle", "flask", "lunch box", "container", "storage box", "mop", "bucket",
        "decor", "vase", "photo frame", "clock",
      ],
    },
    { weight: DETAIL, words: ["kitchen", "bathroom", "living room", "bedroom", "home"] },
    { weight: BRAND, words: ["milton", "cello", "borosil", "pigeon", "hawkins", "solimo", "home centre", "bombay dyeing"] },
  ],
  // Toys, and baby and kids' gear: a "Baby Car Toy" is a toy, not a vehicle.
  Toys: [
    {
      weight: PRODUCT,
      words: [
        "toy", "ride on", "doll", "teddy", "teddy bear", "soft toy", "plush", "puzzle", "lego", "building block",
        "blocks", "board game", "action figure", "rc car", "remote control car", "play set", "playset", "kitchen set",
        "tricycle", "baby walker", "walker", "stroller", "pram", "rattle", "teether", "diaper", "nappy",
        "feeding bottle", "sipper", "baby carrier", "crib", "cradle", "play mat", "play gym", "bath tub", "baby wipes",
      ],
    },
    { weight: DETAIL, words: ["baby", "kids", "toddler", "infant", "newborn", "years old", "yrs", "for boys", "for girls"] },
    {
      weight: BRAND,
      words: [
        "fisher price", "funskool", "hot wheels", "hasbro", "mattel", "barbie", "storio", "chicco", "mee mee",
        "luvlap", "pampers", "huggies", "mamypoko", "babyhug", "firstcry", "mothercare", "toyzone",
      ],
    },
  ],
};

/** Merchants that mostly sell one kind of thing tip close calls. */
const MERCHANT_HINTS: [RegExp, Category][] = [
  [/\b(myntra|ajio|souled store|nykaa fashion|meesho|bewakoof|h&m|zara|westside|lifestyle|max fashion|pantaloons|trends)\b/i, "Clothing"],
  [/\b(croma|reliance digital|vijay sales|apple|samsung)\b/i, "Electronics"],
  [/\b(urban ladder|pepperfry|ikea|wakefit)\b/i, "Furniture"],
];

/** Lowercase words only: "T-Shirts," → "t shirts". */
const normalise = (s: string) => ` ${s.toLowerCase().replace(/&/g, " ").replace(/[^a-z0-9]+/g, " ").trim()} `;

/** A phrase as whole words, allowing a plural ("t shirt" matches "t shirts", "dress" matches "dresses"). */
const phrase = (words: string) => new RegExp(` ${words.replace(/ /g, " ")}(?:s|es)? `);

const COMPILED = Object.entries(RULES).map(([category, rules]) => ({
  category: category as Category,
  rules: rules.map((r) => ({ weight: r.weight, patterns: r.words.map(phrase) })),
}));

/** Clothing sizes like "Size: L", "(7-8Y)", "XL". */
const SIZE = /\bsize\s*[:-]?\s*(xxs|xs|s|m|l|xl|xxl|xxxl|\d{1,2}y?|\d{2})\b|\(\s*\d{1,2}\s*-\s*\d{1,2}\s*y\s*\)|\b\d{1,2}-\d{1,2}\s*(y|yrs|years)\b/i;

export function guessCategory(name: string, merchant?: string | null): Category {
  const text = normalise(name);
  const forAt = text.search(/ (for|compatible with|suitable for) /);
  const scores = new Map<Category, number>();
  // Where the category's product word ends: in "car charger" the last noun is the thing bought.
  const headAt = new Map<Category, number>();

  for (const { category, rules } of COMPILED) {
    let score = 0;
    for (const { weight, patterns } of rules) {
      // A group counts once, however many of its words match: "shirt" in "t-shirt" isn't extra evidence.
      const hits = patterns.map((p) => text.search(p)).filter((at) => at >= 0);
      if (!hits.length) continue;
      score += weight;
      if (weight === PRODUCT) {
        // "Back Cover for Example Phone": what follows "for" is what it fits, not what it is.
        const own = hits.filter((at) => forAt < 0 || at < forAt);
        if (own.length) headAt.set(category, Math.max(...own));
      }
    }
    if (score) scores.set(category, score);
  }
  if (SIZE.test(name)) scores.set("Clothing", (scores.get("Clothing") ?? 0) + DETAIL);
  // With product words from several categories ("headphone carry case"), the last one is the thing bought.
  if (headAt.size > 1) {
    const [head] = [...headAt].sort((a, b) => b[1] - a[1])[0];
    scores.set(head, (scores.get(head) ?? 0) + HEAD_NOUN);
  }

  const hinted = merchant ? MERCHANT_HINTS.find(([re]) => re.test(merchant))?.[1] : undefined;
  if (hinted && scores.size) scores.set(hinted, (scores.get(hinted) ?? 0) + 0.5);

  const [best] = [...scores].sort((a, b) => b[1] - a[1] || (headAt.get(b[0]) ?? -1) - (headAt.get(a[0]) ?? -1));
  // Details or a brand alone aren't enough to file it; a product word, or several hints together, are.
  if (!best || best[1] < DETAIL + BRAND) return hinted && best?.[0] === hinted ? hinted : "Miscellaneous";
  return best[0];
}
