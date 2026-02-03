/**
 * Comprehensive color name to hex code lookup
 * Includes standard web colors, filament-specific colors, and common variations
 */

// Standard web colors and common filament colors
const COLOR_MAP: Record<string, string> = {
  // Reds
  red: "#FF0000",
  darkred: "#8B0000",
  "dark red": "#8B0000",
  crimson: "#DC143C",
  firebrick: "#B22222",
  indianred: "#CD5C5C",
  "indian red": "#CD5C5C",
  lightcoral: "#F08080",
  "light coral": "#F08080",
  salmon: "#FA8072",
  darksalmon: "#E9967A",
  "dark salmon": "#E9967A",
  lightsalmon: "#FFA07A",
  "light salmon": "#FFA07A",
  scarlet: "#FF2400",
  vermillion: "#E34234",
  ruby: "#E0115F",
  burgundy: "#800020",
  maroon: "#800000",
  wine: "#722F37",
  
  // Pinks and Magentas
  pink: "#FFC0CB",
  lightpink: "#FFB6C1",
  "light pink": "#FFB6C1",
  hotpink: "#FF69B4",
  "hot pink": "#FF69B4",
  deeppink: "#FF1493",
  "deep pink": "#FF1493",
  mediumvioletred: "#C71585",
  "medium violet red": "#C71585",
  palevioletred: "#DB7093",
  "pale violet red": "#DB7093",
  magenta: "#FF00FF",
  fuchsia: "#FF00FF",
  rose: "#FF007F",
  coral: "#FF7F50",
  blush: "#DE5D83",
  raspberry: "#E30B5C",
  
  // Oranges
  orange: "#FFA500",
  darkorange: "#FF8C00",
  "dark orange": "#FF8C00",
  orangered: "#FF4500",
  "orange red": "#FF4500",
  tomato: "#FF6347",
  peach: "#FFCBA4",
  apricot: "#FBCEB1",
  tangerine: "#FF9966",
  rust: "#B7410E",
  copper: "#B87333",
  
  // Yellows
  yellow: "#FFFF00",
  lightyellow: "#FFFFE0",
  "light yellow": "#FFFFE0",
  lemon: "#FFF44F",
  "lemon yellow": "#FFF44F",
  gold: "#FFD700",
  golden: "#FFD700",
  khaki: "#F0E68C",
  darkkhaki: "#BDB76B",
  "dark khaki": "#BDB76B",
  amber: "#FFBF00",
  mustard: "#FFDB58",
  canary: "#FFEF00",
  cream: "#FFFDD0",
  ivory: "#FFFFF0",
  beige: "#F5F5DC",
  
  // Greens
  green: "#008000",
  lime: "#00FF00",
  limegreen: "#32CD32",
  "lime green": "#32CD32",
  lightgreen: "#90EE90",
  "light green": "#90EE90",
  palegreen: "#98FB98",
  "pale green": "#98FB98",
  darkgreen: "#006400",
  "dark green": "#006400",
  forestgreen: "#228B22",
  "forest green": "#228B22",
  seagreen: "#2E8B57",
  "sea green": "#2E8B57",
  mediumseagreen: "#3CB371",
  "medium sea green": "#3CB371",
  springgreen: "#00FF7F",
  "spring green": "#00FF7F",
  mediumspringgreen: "#00FA9A",
  "medium spring green": "#00FA9A",
  mediumaquamarine: "#66CDAA",
  "medium aquamarine": "#66CDAA",
  aquamarine: "#7FFFD4",
  olive: "#808000",
  olivedrab: "#6B8E23",
  "olive drab": "#6B8E23",
  darkolivegreen: "#556B2F",
  "dark olive green": "#556B2F",
  yellowgreen: "#9ACD32",
  "yellow green": "#9ACD32",
  chartreuse: "#7FFF00",
  lawngreen: "#7CFC00",
  "lawn green": "#7CFC00",
  greenyellow: "#ADFF2F",
  "green yellow": "#ADFF2F",
  mint: "#98FF98",
  mintgreen: "#98FF98",
  "mint green": "#98FF98",
  emerald: "#50C878",
  jade: "#00A86B",
  sage: "#9DC183",
  teal: "#008080",
  
  // Blues
  blue: "#0000FF",
  navy: "#000080",
  navyblue: "#000080",
  "navy blue": "#000080",
  darkblue: "#00008B",
  "dark blue": "#00008B",
  mediumblue: "#0000CD",
  "medium blue": "#0000CD",
  royalblue: "#4169E1",
  "royal blue": "#4169E1",
  steelblue: "#4682B4",
  "steel blue": "#4682B4",
  dodgerblue: "#1E90FF",
  "dodger blue": "#1E90FF",
  deepskyblue: "#00BFFF",
  "deep sky blue": "#00BFFF",
  cornflowerblue: "#6495ED",
  "cornflower blue": "#6495ED",
  skyblue: "#87CEEB",
  "sky blue": "#87CEEB",
  lightskyblue: "#87CEFA",
  "light sky blue": "#87CEFA",
  lightblue: "#ADD8E6",
  "light blue": "#ADD8E6",
  powderblue: "#B0E0E6",
  "powder blue": "#B0E0E6",
  cadetblue: "#5F9EA0",
  "cadet blue": "#5F9EA0",
  azure: "#F0FFFF",
  aliceblue: "#F0F8FF",
  "alice blue": "#F0F8FF",
  cyan: "#00FFFF",
  aqua: "#00FFFF",
  turquoise: "#40E0D0",
  mediumturquoise: "#48D1CC",
  "medium turquoise": "#48D1CC",
  darkturquoise: "#00CED1",
  "dark turquoise": "#00CED1",
  lightcyan: "#E0FFFF",
  "light cyan": "#E0FFFF",
  paleturquoise: "#AFEEEE",
  "pale turquoise": "#AFEEEE",
  darkcyan: "#008B8B",
  "dark cyan": "#008B8B",
  cobalt: "#0047AB",
  sapphire: "#0F52BA",
  cerulean: "#007BA7",
  prussianblue: "#003153",
  "prussian blue": "#003153",
  
  // Purples and Violets
  purple: "#800080",
  violet: "#EE82EE",
  darkviolet: "#9400D3",
  "dark violet": "#9400D3",
  darkorchid: "#9932CC",
  "dark orchid": "#9932CC",
  darkmagenta: "#8B008B",
  "dark magenta": "#8B008B",
  blueviolet: "#8A2BE2",
  "blue violet": "#8A2BE2",
  mediumpurple: "#9370DB",
  "medium purple": "#9370DB",
  mediumorchid: "#BA55D3",
  "medium orchid": "#BA55D3",
  orchid: "#DA70D6",
  plum: "#DDA0DD",
  lavender: "#E6E6FA",
  thistle: "#D8BFD8",
  indigo: "#4B0082",
  rebeccapurple: "#663399",
  "rebecca purple": "#663399",
  amethyst: "#9966CC",
  grape: "#6F2DA8",
  eggplant: "#614051",
  lilac: "#C8A2C8",
  mauve: "#E0B0FF",
  periwinkle: "#CCCCFF",
  
  // Browns and Earth tones
  brown: "#A52A2A",
  saddlebrown: "#8B4513",
  "saddle brown": "#8B4513",
  sienna: "#A0522D",
  chocolate: "#D2691E",
  peru: "#CD853F",
  sandybrown: "#F4A460",
  "sandy brown": "#F4A460",
  burlywood: "#DEB887",
  tan: "#D2B48C",
  rosybrown: "#BC8F8F",
  "rosy brown": "#BC8F8F",
  moccasin: "#FFE4B5",
  navajowhite: "#FFDEAD",
  "navajo white": "#FFDEAD",
  peachpuff: "#FFDAB9",
  "peach puff": "#FFDAB9",
  bisque: "#FFE4C4",
  blanchedalmond: "#FFEBCD",
  "blanched almond": "#FFEBCD",
  papayawhip: "#FFEFD5",
  "papaya whip": "#FFEFD5",
  wheat: "#F5DEB3",
  coffee: "#6F4E37",
  mocha: "#967969",
  caramel: "#FFD59A",
  chestnut: "#954535",
  mahogany: "#C04000",
  wood: "#DEB887",
  
  // Grays
  black: "#000000",
  gray: "#808080",
  grey: "#808080",
  darkgray: "#A9A9A9",
  "dark gray": "#A9A9A9",
  darkgrey: "#A9A9A9",
  "dark grey": "#A9A9A9",
  dimgray: "#696969",
  "dim gray": "#696969",
  dimgrey: "#696969",
  "dim grey": "#696969",
  lightgray: "#D3D3D3",
  "light gray": "#D3D3D3",
  lightgrey: "#D3D3D3",
  "light grey": "#D3D3D3",
  silver: "#C0C0C0",
  gainsboro: "#DCDCDC",
  whitesmoke: "#F5F5F5",
  "white smoke": "#F5F5F5",
  charcoal: "#36454F",
  slate: "#708090",
  slategray: "#708090",
  "slate gray": "#708090",
  slategrey: "#708090",
  "slate grey": "#708090",
  lightslategray: "#778899",
  "light slate gray": "#778899",
  lightslategrey: "#778899",
  "light slate grey": "#778899",
  darkslategray: "#2F4F4F",
  "dark slate gray": "#2F4F4F",
  darkslategrey: "#2F4F4F",
  "dark slate grey": "#2F4F4F",
  gunmetal: "#2C3539",
  ash: "#B2BEB5",
  
  // Whites
  white: "#FFFFFF",
  snow: "#FFFAFA",
  honeydew: "#F0FFF0",
  mintcream: "#F5FFFA",
  "mint cream": "#F5FFFA",
  ghostwhite: "#F8F8FF",
  "ghost white": "#F8F8FF",
  floralwhite: "#FFFAF0",
  "floral white": "#FFFAF0",
  seashell: "#FFF5EE",
  cornsilk: "#FFF8DC",
  oldlace: "#FDF5E6",
  "old lace": "#FDF5E6",
  linen: "#FAF0E6",
  antiquewhite: "#FAEBD7",
  "antique white": "#FAEBD7",
  pearl: "#FCFBF4",
  offwhite: "#FAF9F6",
  "off white": "#FAF9F6",
  eggshell: "#F0EAD6",
  
  // Metallics (approximations)
  bronze: "#CD7F32",
  brass: "#B5A642",
  goldmetallic: "#D4AF37",
  "gold metallic": "#D4AF37",
  silvermetallic: "#AAA9AD",
  "silver metallic": "#AAA9AD",
  
  // 3D Printing specific colors
  natural: "#F5F5DC",
  translucent: "#F0F0F0",
  transparent: "#FFFFFF",
  clear: "#FFFFFF",
  glow: "#7FFF00",
  "glow in dark": "#7FFF00",
  "glow in the dark": "#7FFF00",
  fluorescent: "#CCFF00",
  neon: "#39FF14",
  "neon green": "#39FF14",
  "neon pink": "#FF6EC7",
  "neon orange": "#FF5F1F",
  "neon yellow": "#DFFF00",
  "neon blue": "#1B03A3",
  silk: "#FFC0CB",
  matte: "#808080",
  glossy: "#FFFFFF",
  
  // Temperature-changing (approximations)
  thermochromic: "#4169E1",
  "color changing": "#4169E1",
};

/**
 * Look up a hex color code from a color name
 * @param colorName - The name of the color to look up
 * @param existingColors - Optional array of existing colors from the database with {name, code}
 * @returns The hex color code or null if not found
 */
export function lookupColorHex(
  colorName: string,
  existingColors?: Array<{ name: string; code: string }>
): string | null {
  if (!colorName) return null;
  
  const normalizedName = colorName.toLowerCase().trim();
  
  // First, check existing colors from the database
  if (existingColors && existingColors.length > 0) {
    const dbMatch = existingColors.find(
      (c) => c.name.toLowerCase().trim() === normalizedName
    );
    if (dbMatch?.code) {
      return dbMatch.code;
    }
  }
  
  // Check our comprehensive color map
  if (COLOR_MAP[normalizedName]) {
    return COLOR_MAP[normalizedName];
  }
  
  // Try without spaces
  const noSpaces = normalizedName.replace(/\s+/g, "");
  if (COLOR_MAP[noSpaces]) {
    return COLOR_MAP[noSpaces];
  }
  
  // Try common variations
  // Check if it ends with a number (like "Blue 1" -> "Blue")
  const withoutNumbers = normalizedName.replace(/\s*\d+$/, "").trim();
  if (withoutNumbers !== normalizedName && COLOR_MAP[withoutNumbers]) {
    return COLOR_MAP[withoutNumbers];
  }
  
  // Check partial matches for compound colors (e.g., "Sky Blue Metallic" -> "Sky Blue")
  for (const [key, value] of Object.entries(COLOR_MAP)) {
    if (normalizedName.startsWith(key) || normalizedName.endsWith(key)) {
      return value;
    }
  }
  
  return null;
}

/**
 * Get all available color names for autocomplete
 */
export function getColorNames(): string[] {
  return Object.keys(COLOR_MAP).map((name) =>
    name.split(" ").map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ")
  );
}
