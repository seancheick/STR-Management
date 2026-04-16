/**
 * Built-in preset checklist templates.
 * These live in code — owners clone them into their own saved templates
 * and then customize freely.
 */

export type PresetItem = {
  section_name: string;
  label: string;
  instruction_text: string | null;
  required: boolean;
  sort_order: number;
  photo_category: string | null;
};

export type PresetTemplate = {
  key: string;
  name: string;
  template_type: string;
  description: string;
  items: PresetItem[];
};

const ENTRY_ITEMS: PresetItem[] = [
  { section_name: "Entry", label: "Take arrival photos", instruction_text: "Photograph each room before cleaning to document pre-existing damage.", required: true, sort_order: 0, photo_category: "before" },
  { section_name: "Entry", label: "Report any existing damage", instruction_text: "Note anything broken, stained, or missing before you start.", required: false, sort_order: 1, photo_category: null },
];

const LIVING_ITEMS: PresetItem[] = [
  { section_name: "Living Room", label: "Dust all surfaces and shelves", instruction_text: null, required: true, sort_order: 10, photo_category: null },
  { section_name: "Living Room", label: "Vacuum or sweep floors", instruction_text: null, required: true, sort_order: 11, photo_category: null },
  { section_name: "Living Room", label: "Wipe down TV and remotes", instruction_text: null, required: false, sort_order: 12, photo_category: null },
  { section_name: "Living Room", label: "Empty trash and replace liner", instruction_text: null, required: true, sort_order: 13, photo_category: null },
];

const KITCHEN_ITEMS: PresetItem[] = [
  { section_name: "Kitchen", label: "Clean stovetop and oven exterior", instruction_text: null, required: true, sort_order: 20, photo_category: null },
  { section_name: "Kitchen", label: "Wipe counters and backsplash", instruction_text: null, required: true, sort_order: 21, photo_category: null },
  { section_name: "Kitchen", label: "Clean sink — scrub and shine", instruction_text: null, required: true, sort_order: 22, photo_category: null },
  { section_name: "Kitchen", label: "Empty and wipe dishwasher filter", instruction_text: null, required: false, sort_order: 23, photo_category: null },
  { section_name: "Kitchen", label: "Restock dish soap and sponge if low", instruction_text: null, required: false, sort_order: 24, photo_category: null },
  { section_name: "Kitchen", label: "Empty trash and replace liner", instruction_text: null, required: true, sort_order: 25, photo_category: null },
];

const BATHROOM_ITEMS: PresetItem[] = [
  { section_name: "Bathroom", label: "Scrub toilet inside and out", instruction_text: null, required: true, sort_order: 40, photo_category: null },
  { section_name: "Bathroom", label: "Clean sink and polish faucet", instruction_text: null, required: true, sort_order: 41, photo_category: null },
  { section_name: "Bathroom", label: "Clean mirror — streak free", instruction_text: null, required: true, sort_order: 42, photo_category: null },
  { section_name: "Bathroom", label: "Scrub shower or tub", instruction_text: null, required: true, sort_order: 43, photo_category: null },
  { section_name: "Bathroom", label: "Replace towels with fresh set", instruction_text: "Fold or hang neatly.", required: true, sort_order: 44, photo_category: null },
  { section_name: "Bathroom", label: "Restock toiletries (toilet paper, soap, shampoo)", instruction_text: null, required: true, sort_order: 45, photo_category: null },
  { section_name: "Bathroom", label: "Empty trash and replace liner", instruction_text: null, required: true, sort_order: 46, photo_category: null },
];

const BEDROOM_ITEMS = (suffix = ""): PresetItem[] => [
  { section_name: `Bedroom${suffix}`, label: "Strip and replace bed linens", instruction_text: "Use fresh set from linen closet.", required: true, sort_order: 30, photo_category: null },
  { section_name: `Bedroom${suffix}`, label: "Fluff and arrange pillows", instruction_text: null, required: true, sort_order: 31, photo_category: null },
  { section_name: `Bedroom${suffix}`, label: "Dust nightstands and surfaces", instruction_text: null, required: true, sort_order: 32, photo_category: null },
  { section_name: `Bedroom${suffix}`, label: "Vacuum or sweep floor", instruction_text: null, required: true, sort_order: 33, photo_category: null },
  { section_name: `Bedroom${suffix}`, label: "Check under bed for items left by guests", instruction_text: null, required: false, sort_order: 34, photo_category: null },
];

const FINAL_CHECK: PresetItem[] = [
  { section_name: "Final Check", label: "Turn off all lights", instruction_text: null, required: true, sort_order: 90, photo_category: null },
  { section_name: "Final Check", label: "Close all windows and curtains", instruction_text: null, required: true, sort_order: 91, photo_category: null },
  { section_name: "Final Check", label: "Set AC/heat to default setting", instruction_text: null, required: false, sort_order: 92, photo_category: null },
  { section_name: "Final Check", label: "Lock all doors", instruction_text: null, required: true, sort_order: 93, photo_category: null },
  { section_name: "Final Check", label: "Take completion photos", instruction_text: "Photograph each room after cleaning.", required: true, sort_order: 94, photo_category: "after" },
];

export const PRESET_TEMPLATES: PresetTemplate[] = [
  {
    key: "1br_turnover",
    name: "1BR Turnover",
    template_type: "turnover",
    description: "Standard one-bedroom turnover — living, kitchen, one bedroom, one bathroom.",
    items: [
      ...ENTRY_ITEMS,
      ...LIVING_ITEMS,
      ...KITCHEN_ITEMS,
      ...BEDROOM_ITEMS(),
      ...BATHROOM_ITEMS,
      ...FINAL_CHECK,
    ],
  },
  {
    key: "2br_turnover",
    name: "2BR Turnover",
    template_type: "turnover",
    description: "Standard two-bedroom turnover — living, kitchen, two bedrooms, two bathrooms.",
    items: [
      ...ENTRY_ITEMS,
      ...LIVING_ITEMS,
      ...KITCHEN_ITEMS,
      ...BEDROOM_ITEMS(" 1"),
      ...BEDROOM_ITEMS(" 2").map((i) => ({ ...i, sort_order: i.sort_order + 10 })),
      ...BATHROOM_ITEMS,
      ...[
        { section_name: "Bathroom 2", label: "Scrub toilet inside and out", instruction_text: null, required: true, sort_order: 50, photo_category: null },
        { section_name: "Bathroom 2", label: "Clean sink, mirror, and faucet", instruction_text: null, required: true, sort_order: 51, photo_category: null },
        { section_name: "Bathroom 2", label: "Replace towels and restock toiletries", instruction_text: null, required: true, sort_order: 52, photo_category: null },
        { section_name: "Bathroom 2", label: "Empty trash", instruction_text: null, required: true, sort_order: 53, photo_category: null },
      ] as PresetItem[],
      ...FINAL_CHECK,
    ],
  },
  {
    key: "3br_turnover",
    name: "3BR Turnover",
    template_type: "turnover",
    description: "Standard three-bedroom turnover — living, kitchen, three bedrooms, two bathrooms.",
    items: [
      ...ENTRY_ITEMS,
      ...LIVING_ITEMS,
      ...KITCHEN_ITEMS,
      ...BEDROOM_ITEMS(" 1"),
      ...BEDROOM_ITEMS(" 2").map((i) => ({ ...i, sort_order: i.sort_order + 10 })),
      ...BEDROOM_ITEMS(" 3").map((i) => ({ ...i, sort_order: i.sort_order + 20 })),
      ...BATHROOM_ITEMS,
      ...[
        { section_name: "Bathroom 2", label: "Scrub toilet inside and out", instruction_text: null, required: true, sort_order: 50, photo_category: null },
        { section_name: "Bathroom 2", label: "Clean sink, mirror, and faucet", instruction_text: null, required: true, sort_order: 51, photo_category: null },
        { section_name: "Bathroom 2", label: "Replace towels and restock toiletries", instruction_text: null, required: true, sort_order: 52, photo_category: null },
        { section_name: "Bathroom 2", label: "Empty trash", instruction_text: null, required: true, sort_order: 53, photo_category: null },
      ] as PresetItem[],
      ...FINAL_CHECK,
    ],
  },
  {
    key: "deep_clean",
    name: "Deep Clean",
    template_type: "deep_clean",
    description: "Thorough deep clean — includes inside appliances, baseboards, windows, and vents.",
    items: [
      ...ENTRY_ITEMS,
      ...LIVING_ITEMS,
      ...[
        { section_name: "Living Room", label: "Clean baseboards and trim", instruction_text: null, required: true, sort_order: 14, photo_category: null },
        { section_name: "Living Room", label: "Wipe window sills and blinds", instruction_text: null, required: true, sort_order: 15, photo_category: null },
        { section_name: "Living Room", label: "Clean light fixtures and ceiling fans", instruction_text: null, required: false, sort_order: 16, photo_category: null },
      ] as PresetItem[],
      ...KITCHEN_ITEMS,
      ...[
        { section_name: "Kitchen", label: "Clean inside oven", instruction_text: "Use oven cleaner, let soak 10 min.", required: true, sort_order: 26, photo_category: null },
        { section_name: "Kitchen", label: "Clean inside microwave", instruction_text: null, required: true, sort_order: 27, photo_category: null },
        { section_name: "Kitchen", label: "Clean inside refrigerator and wipe shelves", instruction_text: null, required: true, sort_order: 28, photo_category: null },
        { section_name: "Kitchen", label: "Degrease range hood and filters", instruction_text: null, required: false, sort_order: 29, photo_category: null },
      ] as PresetItem[],
      ...BEDROOM_ITEMS(),
      ...[
        { section_name: "Bedroom", label: "Vacuum and flip mattress", instruction_text: null, required: false, sort_order: 35, photo_category: null },
        { section_name: "Bedroom", label: "Wipe closet interior and shelves", instruction_text: null, required: false, sort_order: 36, photo_category: null },
      ] as PresetItem[],
      ...BATHROOM_ITEMS,
      ...[
        { section_name: "Bathroom", label: "Descale showerhead and faucets", instruction_text: null, required: false, sort_order: 47, photo_category: null },
        { section_name: "Bathroom", label: "Clean grout lines", instruction_text: null, required: false, sort_order: 48, photo_category: null },
        { section_name: "Bathroom", label: "Wipe exhaust fan cover", instruction_text: null, required: false, sort_order: 49, photo_category: null },
      ] as PresetItem[],
      ...FINAL_CHECK,
    ],
  },
];

export function getPreset(key: string): PresetTemplate | undefined {
  return PRESET_TEMPLATES.find((p) => p.key === key);
}
