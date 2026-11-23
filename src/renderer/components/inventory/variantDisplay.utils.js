/**
 * Utilities for color swatch resolution, intelligent size sorting,
 * and grouping/summarizing product color × size variants.
 */

const COLOR_SWATCH_RULES = [
  { match: ['أسود', 'اسود', 'black', 'فحمي', 'charcoal'], hex: '#18181b', border: '#09090b' },
  { match: ['أبيض', 'ابيض', 'white'], hex: '#ffffff', border: '#cbd5e1' },
  { match: ['أوف وايت', 'اوف وايت', 'off white', 'offwhite', 'سكري', 'كريمي', 'cream', 'ivory'], hex: '#f5f0e1', border: '#d6cbb5' },
  { match: ['بيج', 'beige', 'رملي', 'sand'], hex: '#d9c5a0', border: '#b89f74' },
  { match: ['جملي', 'هافان', 'كراميل', 'كامل', 'camel', 'tan', 'caramel'], hex: '#c18a4e', border: '#996933' },
  { match: ['بني', 'كاكاو', 'شوكولاته', 'قهوة', 'brown', 'chocolate', 'mocha'], hex: '#6f4528', border: '#4d2e19' },
  { match: ['أصفر', 'اصفر', 'yellow', 'ليموني', 'كناري'], hex: '#eab308', border: '#ca8a04' },
  { match: ['مسطردة', 'مستردة', 'خردلي', 'mustard'], hex: '#ca8a04', border: '#a16207' },
  { match: ['ذهبي', 'دهبي', 'gold'], hex: '#d4af37', border: '#a6851c' },
  { match: ['زيتي', 'olive', 'كاكي', 'khaki'], hex: '#556b2f', border: '#3e4f21' },
  { match: ['أخضر', 'اخضر', 'green', 'بترولي', 'زمردي', 'emerald'], hex: '#15803d', border: '#166534' },
  { match: ['مينت', 'نعناعي', 'فستقي', 'mint', 'pistachio'], hex: '#6ee7b7', border: '#10b981' },
  { match: ['تركواز', 'تيفاني', 'فيروزي', 'turquoise', 'teal', 'cyan'], hex: '#0d9488', border: '#115e59' },
  { match: ['كحلي', 'navy', 'أزرق غامق', 'ازرق غامق'], hex: '#1e3a5f', border: '#172554' },
  { match: ['جينز', 'دنيم', 'denim', 'أزرق', 'ازرق', 'blue', 'ملكي', 'royal'], hex: '#2563eb', border: '#1d4ed8' },
  { match: ['سماوي', 'لبني', 'بيبي بلو', 'ثلجي', 'تلجي', 'sky', 'ice', 'baby blue'], hex: '#7dd3fc', border: '#38bdf8' },
  { match: ['نبيتي', 'عنابي', 'برجندي', 'خمري', 'burgundy', 'maroon', 'wine'], hex: '#7f1d1d', border: '#5c1212' },
  { match: ['أحمر', 'احمر', 'red', 'قرمزي'], hex: '#dc2626', border: '#b91c1c' },
  { match: ['كشمير', 'روز', 'وردي', 'بينك', 'بمبي', 'pink', 'rose', 'mauve'], hex: '#db7093', border: '#be4f74' },
  { match: ['فوشيا', 'magenta', 'fuchsia'], hex: '#d946ef', border: '#a21caf' },
  { match: ['موف', 'بنفسجي', 'لافندر', 'purple', 'violet', 'lavender'], hex: '#7c3aed', border: '#5b21b6' },
  { match: ['برتقالي', 'اورنج', 'أورنج', 'سلمون', 'خوخي', 'orange', 'peach', 'coral', 'salmon'], hex: '#f97316', border: '#c2410c' },
  { match: ['رمادي', 'رصاصي', 'جراي', 'فضي', 'سيلفر', 'gray', 'grey', 'silver'], hex: '#6b7280', border: '#4b5563' },
];

const FALLBACK_SWATCHES = [
  { hex: '#6366f1', border: '#4f46e5' },
  { hex: '#0ea5e9', border: '#0284c7' },
  { hex: '#14b8a6', border: '#0f766e' },
  { hex: '#f59e0b', border: '#d97706' },
  { hex: '#ec4899', border: '#db2777' },
  { hex: '#8b5cf6', border: '#6d28d9' },
];

export function getColorSwatch(colorName) {
  const clean = String(colorName || '').trim().toLowerCase();
  if (!clean) return { hex: '#94a3b8', border: '#64748b' };

  for (const rule of COLOR_SWATCH_RULES) {
    if (rule.match.some((kw) => clean.includes(kw))) {
      return { hex: rule.hex, border: rule.border };
    }
  }

  let hash = 0;
  for (let i = 0; i < clean.length; i += 1) {
    hash = ((hash << 5) - hash + clean.charCodeAt(i)) | 0;
  }
  return FALLBACK_SWATCHES[Math.abs(hash) % FALLBACK_SWATCHES.length];
}

const LETTER_SIZE_RANK = {
  XXS: 1,
  '2XS': 1,
  XS: 2,
  S: 3,
  M: 4,
  L: 5,
  XL: 6,
  '1XL': 6,
  XXL: 7,
  '2XL': 7,
  XXXL: 8,
  '3XL': 8,
  '4XL': 9,
  '5XL': 10,
  '6XL': 11,
  '7XL': 12,
  '8XL': 13,
};

export function compareSizeLabels(a, b) {
  const sa = String(a || '').trim();
  const sb = String(b || '').trim();
  const ua = sa.toUpperCase();
  const ub = sb.toUpperCase();

  const rankA = LETTER_SIZE_RANK[ua];
  const rankB = LETTER_SIZE_RANK[ub];
  if (rankA !== undefined && rankB !== undefined) return rankA - rankB;
  if (rankA !== undefined) return -1;
  if (rankB !== undefined) return 1;

  const numA = Number(sa);
  const numB = Number(sb);
  const isNumA = sa !== '' && !Number.isNaN(numA);
  const isNumB = sb !== '' && !Number.isNaN(numB);
  if (isNumA && isNumB) return numA - numB;
  if (isNumA) return -1;
  if (isNumB) return 1;

  return sa.localeCompare(sb, 'ar');
}

export function buildProductVariantSummary(product) {
  const rawSizes = Array.isArray(product?.sizes) ? product.sizes : [];
  const colorMap = new Map();
  const uniqueSizeSet = new Set();

  let totalStock = 0;
  let inStockVariants = 0;
  let zeroVariants = 0;

  for (const s of rawSizes) {
    const colorName = String(s?.color_name || product?.color || 'افتراضي').trim() || 'افتراضي';
    const sizeName = String(s?.size_name || s?.size || '').trim();
    if (!sizeName) continue;
    const qty = Math.max(0, Number(s?.stock_level ?? s?.stock ?? 0) || 0);

    uniqueSizeSet.add(sizeName);
    totalStock += qty;
    if (qty > 0) inStockVariants += 1;
    else zeroVariants += 1;

    if (!colorMap.has(colorName)) {
      colorMap.set(colorName, {
        color: colorName,
        swatch: getColorSwatch(colorName),
        totalStock: 0,
        inStockCount: 0,
        zeroCount: 0,
        sizeMap: new Map(),
        sizes: [],
      });
    }

    const group = colorMap.get(colorName);
    group.totalStock += qty;
    if (qty > 0) group.inStockCount += 1;
    else group.zeroCount += 1;

    const existingSize = group.sizeMap.get(sizeName);
    if (existingSize) {
      existingSize.stock_level += qty;
    } else {
      const entry = {
        id: s.id,
        size_name: sizeName,
        color_name: colorName,
        stock_level: qty,
        barcode: s.barcode || '',
      };
      group.sizeMap.set(sizeName, entry);
      group.sizes.push(entry);
    }
  }

  const orderedSizes = Array.from(uniqueSizeSet).sort(compareSizeLabels);

  const colorGroups = Array.from(colorMap.values())
    .map((g) => ({
      ...g,
      sizes: [...g.sizes].sort((a, b) => compareSizeLabels(a.size_name, b.size_name)),
    }))
    .sort((a, b) => {
      // In-stock colors first, then highest stock, then alphabetical
      const aHas = a.totalStock > 0 ? 1 : 0;
      const bHas = b.totalStock > 0 ? 1 : 0;
      if (aHas !== bHas) return bHas - aHas;
      if (b.totalStock !== a.totalStock) return b.totalStock - a.totalStock;
      return a.color.localeCompare(b.color, 'ar');
    });

  return {
    colorGroups,
    orderedSizes,
    totalStock,
    totalColors: colorGroups.length,
    totalVariants: rawSizes.length,
    inStockVariants,
    zeroVariants,
  };
}
