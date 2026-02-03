import OpenAI from 'openai';
import sharp from 'sharp';
import { logger } from './logger';

export interface ExtractedFilamentData {
  name?: string;
  manufacturer?: string;
  material?: string;
  colorName?: string;
  colorCode?: string;
  diameter?: number;
  printTemp?: string;
  printSpeed?: string; // Print speed range (e.g., '30-100mm/s')
  totalWeight?: number;
  bedTemp?: string;
  dryingTemp?: string;
  dryingTime?: string;
  isSealed?: boolean; // Whether spool is still sealed in packaging
  notes?: string; // Auto-generated notes (e.g., alternative print settings)
  estimatedPrice?: number; // Estimated price in USD
  // Additional fields that might be on labels
  sku?: string;
  batchNumber?: string;
  productionDate?: string;
  confidence: number; // 0-1 confidence score
  rawText?: string; // Raw extracted text for debugging
}

const EXTRACTION_PROMPT = `You are an expert at identifying 3D printing filament spools and extracting product information. You have extensive knowledge of filament brands, their spool designs, and product specifications.

## YOUR TASK
Analyze this image of a filament spool and extract ALL available information. Use BOTH visible text/labels AND your knowledge of the brand/product to fill in details.

## BRAND IDENTIFICATION
Identify the manufacturer from:
1. **Printed logos/text** on the spool or label - ALWAYS check for visible brand names first
2. **Distinctive spool designs** - CRITICAL for identifying brands:

   **SPOOLS WITH HOLE PATTERNS (very important to distinguish):**
   - **Sunlu**: BLACK or DARK colored plastic spools with many small circular holes/perforations, often has orange/colored accents, BLACK spool body is the key identifier
   - **Bambu Lab**: GRAY or WHITE plastic spools with small dot/hole pattern, lighter colored spool body, often has transparent window sections
   
   **CARDBOARD/ECO SPOOLS:**
   - **ELEGOO**: Brown/kraft cardboard spools, eco-friendly, Rapid PLA+ line
   - **Snapmaker**: Brown cardboard eco spools, SnapSpeed PLA line with distinctive label
   
   **OTHER DISTINCTIVE DESIGNS:**
   - **Prusament**: Orange/black spools with clear labeling, known for tight tolerances
   - **eSUN**: Various spool colors, often with holographic/shiny labels
   - **Overture**: Black spools with colorful labels, simpler design
   - **Hatchbox**: Simple black spools with minimal branding, no hole pattern
   - **Polymaker**: White spools with distinctive branding
   - **Creality**: Various designs, Hyper PLA and Ender lines, often orange accents
   - **ERYONE**: Colorful spools with clear branding

3. **Handwritten labels** - READ any handwritten text carefully, people often write brand, material, and color

**IMPORTANT**: If you see a BLACK spool with many small holes, it's likely SUNLU not Bambu Lab. Bambu Lab spools are GRAY/WHITE.

## COLOR IDENTIFICATION  
Determine the filament color from:
1. **Label text** stating the color name
2. **Visible filament** through transparent spool sections or wrapped around spool
3. **Color swatches** on packaging
For the hex code, estimate based on the ACTUAL visible filament color, not the spool color.

## USE YOUR KNOWLEDGE - CRITICAL
If you identify the brand and product, you MUST use your knowledge to fill in ALL typical specifications including print speed. Do NOT leave fields blank if you can look them up.

**ALWAYS fill in these fields when you identify a known brand:**
- Print temperatures for that specific material/brand
- **Print speed** - look this up based on brand and product line
- Bed temperatures
- Typical spool weights (usually 1kg for standard, 0.5kg for some)
- Diameter (almost always 1.75mm unless labeled otherwise)

## OUTPUT FORMAT
Return a JSON object:
{
  "name": "Full product name (e.g., 'Sunlu High Speed PLA Black')",
  "manufacturer": "Brand name (e.g., 'Sunlu', 'Bambu Lab', 'ELEGOO')",
  "material": "Material type (e.g., 'High Speed PLA', 'PLA', 'PLA+', 'PETG')",
  "colorName": "Color name (e.g., 'Black', 'White', 'Magenta')",
  "colorCode": "Hex color code based on visible filament (e.g., '#000000' for black)",
  "diameter": 1.75,
  "printTemp": "HIGHEST speed temp range (e.g., '230-260°C')",
  "printSpeed": "HIGHEST speed range (e.g., '300-600mm/s')",
  "totalWeight": 1.0,
  "bedTemp": "Bed temperature (e.g., '50-60°C')",
  "dryingTemp": "Drying temperature if known",
  "dryingTime": "Drying time if known",
  "isSealed": true,
  "estimatedPrice": 20.00,
  "notes": "REQUIRED if multiple speed/temp profiles exist! Format: 'Alt profiles: Low (190-210°C, 50-150mm/s), Medium (210-230°C, 150-300mm/s)'",
  "sku": "Product SKU if visible",
  "batchNumber": "Batch number if visible",
  "productionDate": "Production date if visible",
  "confidence": 0.85,
  "rawText": "All readable text"
}

## PRICE ESTIMATION - IMPORTANT
Estimate the retail price in USD for the identified filament based on your knowledge of typical prices:
- Bambu Lab Basic PLA: ~$20, PLA Matte: ~$26, PETG Basic: ~$20, PETG-HF: ~$20, ABS: ~$20, TPU: ~$35
- Sunlu PLA: ~$15-18, PETG: ~$18, Silk PLA: ~$20
- ELEGOO PLA+/Rapid: ~$18-20
- Polymaker: ~$25-30
- Prusament: ~$30
- Generic/unknown: ~$18-20
Adjust price based on weight (most are 1kg, but some are 0.5kg or 0.25kg)

**IMPORTANT: The "notes" field MUST contain alternative print profiles if the label shows multiple temperature/speed combinations!**

## SEALED STATUS DETECTION
Determine if the spool is still sealed or has been opened:
- **Sealed (true)**: Spool is wrapped in vacuum-sealed plastic/foil, shrink wrap visible, unopened packaging, desiccant pack visible inside sealed bag
- **Opened (false)**: Plastic wrap removed, loose filament visible, spool is exposed, filament end is free/clipped to spool, no vacuum seal visible
- Look for shiny plastic wrap, sealed edges, intact vacuum packaging
- If the spool is clearly being used or the filament is visible and loose, it's opened

## PRINT SPEED - MUST FILL IN FOR KNOWN BRANDS
**You MUST provide a print speed value if you identify the brand.** Look it up from your knowledge.

### CRITICAL - DO NOT MAKE UP PRODUCT NAMES
Only use REAL product names that actually exist. Examples of REAL products:
- Bambu Lab: "Basic PLA", "Matte PLA", "PLA Silk", "PETG Basic", "PETG-HF" (High Flow), "ABS", "TPU 95A"
- Bambu Lab does NOT make "High Speed PLA" - their Basic PLA IS high-speed capable but it's called "Basic PLA"
- Sunlu: "PLA", "PLA+", "High Speed PLA", "PETG", "Silk PLA"
- ELEGOO: "PLA", "Rapid PLA+", "PETG", "ABS"

### Brand-Specific Print Speeds (use these values):
**Bambu Lab (GRAY/WHITE spools):**
- Bambu Lab Basic PLA: 250-300mm/s
- Bambu Lab Matte PLA: 250-300mm/s
- Bambu Lab PLA Silk: 200-250mm/s
- Bambu Lab PETG Basic: 200-250mm/s
- Bambu Lab PETG-HF (High Flow): 200-300mm/s
- Bambu Lab ABS: 200-250mm/s
- Bambu Lab TPU 95A: 50-100mm/s

**Sunlu (BLACK spools with holes):**
- Sunlu PLA: 40-80mm/s
- Sunlu PLA+: 40-100mm/s
- Sunlu High Speed PLA: 150-300mm/s
- Sunlu PETG: 40-80mm/s
- Sunlu Silk PLA: 30-60mm/s

**Other Brands:**
- ELEGOO Rapid PLA+: 200-600mm/s
- ELEGOO Standard PLA: 40-100mm/s
- Snapmaker SnapSpeed PLA: 100-300mm/s
- Snapmaker Standard PLA: 40-100mm/s
- Creality Hyper PLA: 150-600mm/s
- Creality Standard PLA: 40-100mm/s
- Prusament PLA: 40-100mm/s
- Hatchbox PLA: 40-80mm/s
- eSUN PLA+: 40-100mm/s
- Overture PLA: 40-80mm/s
- Polymaker PolyLite PLA: 40-100mm/s

### Material Defaults (if brand unknown):
- Standard PLA: 40-100mm/s
- High-Speed/Rapid PLA: 150-300mm/s
- PETG: 40-80mm/s
- ABS: 40-80mm/s
- TPU/Flex: 20-40mm/s
- ASA: 40-80mm/s
- Nylon/PA: 40-80mm/s
- PC: 40-80mm/s

**If the label shows a speed, use that. Otherwise, look it up based on brand and material.**

## MULTIPLE SPEED/TEMP PROFILES - CRITICAL
Many labels (especially Sunlu High Speed PLA) show multiple print settings for different speed tiers.

**WHEN YOU SEE MULTIPLE TEMP/SPEED COMBOS ON A LABEL, YOU MUST:**
1. Use the HIGHEST speed profile for printTemp and printSpeed fields
2. **ALWAYS fill the "notes" field** with the other profiles in this exact format:
   "Alt profiles: Low (190-210°C, 50-150mm/s), Medium (210-230°C, 150-300mm/s)"

**Example from Sunlu High Speed PLA label:**
- Label shows: 190-210°C @ 50-150mm/s, 210-230°C @ 150-300mm/s, 230-260°C @ 300-600mm/s
- printTemp: "230-260°C" (highest)
- printSpeed: "300-600mm/s" (highest)  
- notes: "Alt profiles: Low (190-210°C, 50-150mm/s), Medium (210-230°C, 150-300mm/s)"

**DO NOT leave notes empty if multiple profiles exist on the label!**

## CONFIDENCE SCORING
- 0.9+ : Clear label with all info visible, or confident brand ID with known specs
- 0.7-0.9 : Brand identified from spool design, most info inferred
- 0.5-0.7 : Partial info, some guessing involved
- Below 0.5 : Very uncertain, limited info available

## IMPORTANT
- READ HANDWRITTEN TEXT carefully - users often write brand/material/color/speed on spools
- If you recognize the spool design, NAME THE BRAND even without visible text
- ALWAYS try to determine color from visible filament
- **ALWAYS fill in printSpeed** - if visible on label use that, otherwise look up based on brand
- Use your knowledge of typical specs for identified products
- Be specific with product names (e.g., "Basic PLA" vs just "PLA" for Bambu Lab)
- For Bambu Lab specifically: Basic PLA = 250-300mm/s, it's a high-speed filament

Return ONLY the JSON object, no additional text.`;

/**
 * Create an OpenAI client with the provided API key
 */
function createOpenAIClient(apiKey: string): OpenAI {
  return new OpenAI({ apiKey });
}

// Available models with vision capabilities
export const VISION_MODELS = [
  { id: 'gpt-4o', name: 'GPT-4o', description: 'Best quality, fast' },
  { id: 'gpt-4o-mini', name: 'GPT-4o Mini', description: 'Faster, cheaper, good quality' },
  { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', description: 'Previous gen, reliable' },
  { id: 'o1', name: 'o1 (Reasoning)', description: 'Deep reasoning, slower' },
  { id: 'o1-mini', name: 'o1 Mini (Reasoning)', description: 'Fast reasoning' },
];

/**
 * Extract filament data from an image using OpenAI Vision
 * @param imageBase64 - Base64 encoded image data (with or without data URL prefix)
 * @param apiKey - OpenAI API key
 * @param model - OpenAI model to use (default: gpt-4o)
 * @returns Extracted filament data
 */
export async function extractFilamentDataFromImage(
  imageBase64: string,
  apiKey: string,
  model: string = 'gpt-4o'
): Promise<ExtractedFilamentData> {
  const openai = createOpenAIClient(apiKey);
  
  // Ensure proper data URL format
  let imageUrl = imageBase64;
  if (!imageBase64.startsWith('data:')) {
    // Detect image type from base64 header if possible, default to jpeg
    const mimeType = detectMimeType(imageBase64) || 'image/jpeg';
    imageUrl = `data:${mimeType};base64,${imageBase64}`;
  }
  
  try {
    logger.info(`Sending image to OpenAI Vision API using model: ${model}...`);
    
    const response = await openai.chat.completions.create({
      model: model,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: EXTRACTION_PROMPT
            },
            {
              type: 'image_url',
              image_url: {
                url: imageUrl,
                detail: 'high' // Use high detail for better text recognition
              }
            }
          ]
        }
      ],
      max_tokens: 1000,
      temperature: 0.2 // Lower temperature for more consistent extraction
    });
    
    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response from OpenAI Vision API');
    }
    
    logger.info('Received response from OpenAI Vision API');
    
    // Parse the JSON response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Could not parse JSON from response');
    }
    
    const data = JSON.parse(jsonMatch[0]) as ExtractedFilamentData;
    
    // Validate and clean up the data
    return cleanExtractedData(data);
    
  } catch (error) {
    logger.error('Error extracting filament data from image:', error);
    throw error;
  }
}

/**
 * Resize image for AI processing - reduces upload time significantly
 * Keeps enough detail for text recognition (1536px max dimension)
 */
async function resizeImageForAI(base64: string): Promise<string> {
  try {
    // Remove data URL prefix if present
    const base64Data = base64.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    
    // Resize to max 1536px on longest side, with good quality for text
    const resized = await sharp(buffer)
      .resize(1536, 1536, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality: 85 }) // JPEG is faster to encode/decode
      .toBuffer();
    
    return resized.toString('base64');
  } catch (error) {
    logger.warn('Failed to resize image, using original:', error);
    // Return original if resize fails
    return base64.replace(/^data:image\/\w+;base64,/, '');
  }
}

/**
 * Process multiple images in batch with parallel processing
 * - Resizes images before sending to AI (much faster upload)
 * - Processes up to 3 images concurrently
 */
export async function extractFilamentDataFromImages(
  images: { base64: string; filename?: string }[],
  apiKey: string,
  model: string = 'gpt-4o',
  onProgress?: (current: number, total: number, result?: ExtractedFilamentData) => void
): Promise<{ data: ExtractedFilamentData; imageBase64: string; filename?: string; error?: string }[]> {
  const CONCURRENT_LIMIT = 3; // Process 3 images at a time
  const results: { data: ExtractedFilamentData; imageBase64: string; filename?: string; error?: string; index: number }[] = [];
  let completed = 0;
  
  logger.info(`Starting parallel processing of ${images.length} images (${CONCURRENT_LIMIT} concurrent) using model: ${model}`);
  
  // Process images in batches
  for (let i = 0; i < images.length; i += CONCURRENT_LIMIT) {
    const batch = images.slice(i, i + CONCURRENT_LIMIT);
    const batchStartIndex = i;
    
    // Process batch in parallel
    const batchPromises = batch.map(async (img, batchIndex) => {
      const globalIndex = batchStartIndex + batchIndex;
      const { base64, filename } = img;
      
      try {
        // Resize image before sending to AI
        const resizedBase64 = await resizeImageForAI(base64);
        logger.info(`Image ${globalIndex + 1}/${images.length}: Resized for AI processing`);
        
        const data = await extractFilamentDataFromImage(resizedBase64, apiKey, model);
        completed++;
        onProgress?.(completed, images.length, data);
        
        return { data, imageBase64: base64, filename, index: globalIndex };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        completed++;
        onProgress?.(completed, images.length);
        
        return {
          data: { confidence: 0 } as ExtractedFilamentData,
          imageBase64: base64,
          filename,
          error: errorMessage,
          index: globalIndex
        };
      }
    });
    
    // Wait for batch to complete
    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);
    
    // Small delay between batches to avoid rate limiting
    if (i + CONCURRENT_LIMIT < images.length) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }
  
  // Sort results by original index to maintain order
  results.sort((a, b) => a.index - b.index);
  
  // Remove index from results
  return results.map(({ index, ...rest }) => rest);
}

/**
 * Clean and validate extracted data
 */
function cleanExtractedData(data: ExtractedFilamentData): ExtractedFilamentData {
  const cleaned: ExtractedFilamentData = {
    confidence: data.confidence ?? 0.5
  };
  
  if (data.name) cleaned.name = data.name.trim();
  if (data.manufacturer) cleaned.manufacturer = data.manufacturer.trim();
  if (data.material) cleaned.material = normalizeMaterialType(data.material.trim());
  if (data.colorName) cleaned.colorName = data.colorName.trim();
  if (data.colorCode) cleaned.colorCode = normalizeColorCode(data.colorCode);
  if (data.printTemp) cleaned.printTemp = data.printTemp.trim();
  if (data.printSpeed) cleaned.printSpeed = data.printSpeed.trim();
  if (data.bedTemp) cleaned.bedTemp = data.bedTemp.trim();
  if (data.dryingTemp) cleaned.dryingTemp = data.dryingTemp.trim();
  if (data.dryingTime) cleaned.dryingTime = data.dryingTime.trim();
  if (data.isSealed !== undefined) cleaned.isSealed = data.isSealed;
  if (data.notes) cleaned.notes = data.notes.trim();
  if (data.sku) cleaned.sku = data.sku.trim();
  if (data.batchNumber) cleaned.batchNumber = data.batchNumber.trim();
  if (data.productionDate) cleaned.productionDate = data.productionDate.trim();
  if (data.rawText) cleaned.rawText = data.rawText;
  
  // Validate and set numeric values
  if (data.diameter) {
    const diameter = typeof data.diameter === 'string' ? parseFloat(data.diameter) : data.diameter;
    if (!isNaN(diameter) && diameter > 0 && diameter < 10) {
      cleaned.diameter = diameter;
    }
  }
  
  if (data.totalWeight) {
    const weight = typeof data.totalWeight === 'string' ? parseFloat(data.totalWeight) : data.totalWeight;
    if (!isNaN(weight) && weight > 0 && weight < 100) {
      cleaned.totalWeight = weight;
    }
  }
  
  // Auto-fill print speed if not provided but we know the brand
  if (!cleaned.printSpeed && cleaned.manufacturer) {
    cleaned.printSpeed = lookupPrintSpeed(cleaned.manufacturer, cleaned.material, cleaned.name);
  }
  
  // Improve color name based on hex code
  if (cleaned.colorCode && cleaned.colorName) {
    cleaned.colorName = improveColorName(cleaned.colorName, cleaned.colorCode);
  }
  
  // Use AI's estimated price if provided, otherwise fall back to lookup
  if (data.estimatedPrice && typeof data.estimatedPrice === 'number' && data.estimatedPrice > 0) {
    cleaned.estimatedPrice = data.estimatedPrice;
  } else {
    cleaned.estimatedPrice = lookupEstimatedPrice(cleaned.manufacturer, cleaned.material, cleaned.totalWeight);
  }
  
  return cleaned;
}

/**
 * Look up estimated price based on manufacturer, material, and weight
 * Prices are approximate USD values for 1kg spools (updated Feb 2026)
 */
function lookupEstimatedPrice(manufacturer?: string, material?: string, weight?: number): number {
  const mfr = (manufacturer || '').toLowerCase();
  const mat = (material || 'PLA').toUpperCase();
  const kg = weight || 1;
  
  let pricePerKg = 20; // Default price
  
  // Brand-specific pricing (USD per kg) - fallback prices if AI doesn't provide one
  if (mfr.includes('bambu')) {
    // Bambu Lab pricing (from store.bambulab.com Feb 2026)
    if (mat.includes('TPU')) pricePerKg = 35;
    else if (mat.includes('PETG')) pricePerKg = 20; // PETG Basic and PETG-HF both ~$20
    else if (mat.includes('ABS')) pricePerKg = 20;
    else if (mat.includes('ASA')) pricePerKg = 25;
    else if (mat.includes('PA') || mat.includes('NYLON')) pricePerKg = 40;
    else if (mat.includes('PC')) pricePerKg = 35;
    else if (mat.includes('PLA') && mat.includes('MATTE')) pricePerKg = 26; // PLA Matte
    else if (mat.includes('PLA') && mat.includes('SILK')) pricePerKg = 28; // PLA Silk
    else if (mat.includes('PLA') && mat.includes('CF')) pricePerKg = 45; // PLA-CF
    else pricePerKg = 20; // Basic PLA ($19.99)
  } else if (mfr.includes('sunlu')) {
    if (mat.includes('SILK')) pricePerKg = 22;
    else if (mat.includes('PETG')) pricePerKg = 18;
    else if (mat.includes('TPU')) pricePerKg = 25;
    else if (mat.includes('ABS')) pricePerKg = 16;
    else pricePerKg = 15; // Standard PLA (often on sale ~$13-17)
  } else if (mfr.includes('elegoo')) {
    if (mat.includes('RAPID') || mat.includes('PLA+')) pricePerKg = 20;
    else pricePerKg = 16;
  } else if (mfr.includes('overture')) {
    if (mat.includes('PETG')) pricePerKg = 20;
    else pricePerKg = 18;
  } else if (mfr.includes('hatchbox')) {
    pricePerKg = 23;
  } else if (mfr.includes('polymaker')) {
    if (mat.includes('SILK')) pricePerKg = 32;
    else pricePerKg = 28;
  } else if (mfr.includes('prusament')) {
    pricePerKg = 30;
  } else if (mfr.includes('esun')) {
    if (mat.includes('SILK')) pricePerKg = 24;
    else pricePerKg = 20;
  } else if (mfr.includes('creality')) {
    if (mat.includes('HYPER') || mat.includes('HIGH SPEED')) pricePerKg = 22;
    else pricePerKg = 16;
  } else if (mfr.includes('inland')) {
    pricePerKg = 18;
  } else if (mfr.includes('amazon') || mfr.includes('basics')) {
    pricePerKg = 18;
  } else {
    // Generic pricing by material
    if (mat.includes('TPU')) pricePerKg = 25;
    else if (mat.includes('PETG')) pricePerKg = 20;
    else if (mat.includes('ABS')) pricePerKg = 18;
    else if (mat.includes('ASA')) pricePerKg = 25;
    else if (mat.includes('PA') || mat.includes('NYLON')) pricePerKg = 40;
    else if (mat.includes('PC')) pricePerKg = 35;
    else if (mat.includes('SILK')) pricePerKg = 22;
    else if (mat.includes('CF')) pricePerKg = 40;
    else pricePerKg = 18; // Generic PLA
  }
  
  return Math.round(pricePerKg * kg * 100) / 100;
}

/**
 * Look up print speed based on manufacturer and material
 */
function lookupPrintSpeed(manufacturer: string, material?: string, productName?: string): string | undefined {
  const mfr = manufacturer.toLowerCase();
  const mat = material?.toUpperCase() || 'PLA';
  const name = productName?.toLowerCase() || '';
  
  // Bambu Lab
  if (mfr.includes('bambu')) {
    if (mat.includes('TPU')) return '50-100mm/s';
    if (mat.includes('PETG')) return '200-250mm/s';
    if (mat.includes('ABS')) return '200-250mm/s';
    if (mat.includes('ASA')) return '200-250mm/s';
    if (mat.includes('PA') || mat.includes('NYLON')) return '80-120mm/s';
    if (mat.includes('PC')) return '80-120mm/s';
    // PLA variants (Basic, Matte, Silk, etc.) - all high speed
    return '250-300mm/s';
  }
  
  // ELEGOO
  if (mfr.includes('elegoo')) {
    if (name.includes('rapid') || name.includes('high speed') || name.includes('high-speed')) {
      return '200-600mm/s';
    }
    return '40-100mm/s';
  }
  
  // Snapmaker
  if (mfr.includes('snapmaker')) {
    if (name.includes('snapspeed') || name.includes('speed')) {
      return '100-300mm/s';
    }
    return '40-100mm/s';
  }
  
  // Creality
  if (mfr.includes('creality')) {
    if (name.includes('hyper') || name.includes('high speed') || name.includes('high-speed')) {
      return '150-600mm/s';
    }
    return '40-100mm/s';
  }
  
  // Prusament
  if (mfr.includes('prusa')) {
    return '40-100mm/s';
  }
  
  // Polymaker
  if (mfr.includes('polymaker')) {
    if (name.includes('polylite')) return '40-100mm/s';
    return '40-80mm/s';
  }
  
  // Hatchbox
  if (mfr.includes('hatchbox')) {
    return '40-80mm/s';
  }
  
  // eSUN
  if (mfr.includes('esun')) {
    return '40-100mm/s';
  }
  
  // Overture
  if (mfr.includes('overture')) {
    return '40-80mm/s';
  }
  
  // Sunlu
  if (mfr.includes('sunlu')) {
    return '40-80mm/s';
  }
  
  // Generic material-based fallback
  if (mat.includes('TPU') || mat.includes('FLEX')) return '20-40mm/s';
  if (mat.includes('PETG')) return '40-80mm/s';
  if (mat.includes('ABS')) return '40-80mm/s';
  if (mat.includes('ASA')) return '40-80mm/s';
  if (mat.includes('PA') || mat.includes('NYLON')) return '40-80mm/s';
  if (mat.includes('PC')) return '40-80mm/s';
  
  // Default PLA speed
  return '40-100mm/s';
}

/**
 * Improve color name based on hex code analysis
 */
function improveColorName(colorName: string, hexCode: string): string {
  const name = colorName.toLowerCase().trim();
  
  // Parse hex to RGB
  const hex = hexCode.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  
  // Color analysis helpers
  const isHighRed = r > 200;
  const isHighGreen = g > 200;
  const isHighBlue = b > 200;
  const isLowRed = r < 100;
  const isLowGreen = g < 100;
  const isLowBlue = b < 100;
  
  // Pink vs Magenta detection
  // Magenta has high red AND high blue, but low green
  // Pink has high red, medium-high blue, and some green
  if (name === 'pink' || name === 'magenta') {
    // If it's a strong magenta (high R, low G, high B)
    if (r > 200 && g < 100 && b > 150) {
      return 'Magenta';
    }
    // Hot pink / deep pink (high R, low-medium G, high B)
    if (r > 220 && g < 120 && b > 120 && b < 200) {
      return 'Hot Pink';
    }
    // Standard magenta-ish
    if (r > 180 && g < 150 && b > 150 && Math.abs(r - b) < 50) {
      return 'Magenta';
    }
    // Light pink
    if (r > 200 && g > 150 && b > 180) {
      return 'Pink';
    }
  }
  
  // Cyan vs Turquoise vs Teal
  if (name === 'cyan' || name === 'blue' || name === 'turquoise' || name === 'teal') {
    if (isLowRed && isHighGreen && isHighBlue) {
      return 'Cyan';
    }
    if (r < 100 && g > 180 && g < 230 && b > 180) {
      return 'Turquoise';
    }
    if (r < 50 && g > 100 && g < 180 && b > 100 && b < 180) {
      return 'Teal';
    }
  }
  
  // Navy vs Blue
  if (name === 'blue' || name === 'navy') {
    if (r < 50 && g < 50 && b < 150 && b > 80) {
      return 'Navy Blue';
    }
  }
  
  // Forest Green vs Green vs Lime
  if (name === 'green' || name === 'lime' || name === 'forest green') {
    if (r < 50 && g > 100 && g < 150 && b < 50) {
      return 'Forest Green';
    }
    if (r < 100 && g > 200 && b < 100) {
      return 'Lime Green';
    }
  }
  
  // Capitalize properly
  return colorName.split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Normalize material type to standard format
 * Consolidates variants like "High Speed PLA", "Snapspeed PLA" to just "PLA"
 * but keeps meaningful variants like "PLA+", "PLA Silk", "PLA Matte"
 */
function normalizeMaterialType(material: string): string {
  const upper = material.toUpperCase().trim();
  
  // Special PLA variants that should be kept distinct
  // These have different printing characteristics
  if (upper.includes('PLA') && upper.includes('SILK')) return 'PLA Silk';
  if (upper.includes('PLA') && upper.includes('MATTE')) return 'PLA Matte';
  if (upper.includes('PLA') && (upper.includes('+') || upper.includes('PLUS'))) return 'PLA+';
  if (upper.includes('PLA') && upper.includes('CF')) return 'PLA-CF';
  if (upper.includes('PLA') && upper.includes('HF')) return 'PLA-HF';
  
  // Generic PLA variants that are all just PLA
  // (High Speed, Rapid, Basic, Snapspeed, Hyper, etc. are marketing terms)
  if (upper.includes('PLA') && !upper.includes('PETG')) return 'PLA';
  
  // Special PETG variants
  if (upper.includes('PETG') && upper.includes('CF')) return 'PETG-CF';
  if (upper.includes('PETG') && upper.includes('HF')) return 'PETG-HF';
  if (upper.includes('PETG') || upper.includes('PET-G')) return 'PETG';
  
  // Other materials
  const materialMap: Record<string, string> = {
    'ABS': 'ABS',
    'TPU': 'TPU',
    'TPE': 'TPU',
    'ASA': 'ASA',
    'NYLON': 'PA',
    'PA': 'PA',
    'PA6': 'PA',
    'PA12': 'PA',
    'PA-CF': 'PA-CF',
    'PA CF': 'PA-CF',
    'NYLON CF': 'PA-CF',
    'PC': 'PC',
    'POLYCARBONATE': 'PC',
    'PVA': 'PVA',
    'HIPS': 'HIPS',
    'PP': 'PP',
    'POLYPROPYLENE': 'PP',
  };
  
  // Check for exact match first
  if (materialMap[upper]) {
    return materialMap[upper];
  }
  
  // Check for partial matches
  for (const [key, value] of Object.entries(materialMap)) {
    if (upper.includes(key)) {
      return value;
    }
  }
  
  // Return as-is in uppercase
  return upper;
}

/**
 * Normalize color code to standard hex format
 */
function normalizeColorCode(code: string): string {
  let hex = code.trim();
  
  // Remove any non-hex characters except #
  hex = hex.replace(/[^#0-9a-fA-F]/g, '');
  
  // Add # if missing
  if (!hex.startsWith('#')) {
    hex = '#' + hex;
  }
  
  // Ensure 6 character hex
  if (hex.length === 4) {
    // Expand short form (#RGB -> #RRGGBB)
    hex = '#' + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
  }
  
  // Validate format
  if (/^#[0-9a-fA-F]{6}$/.test(hex)) {
    return hex.toUpperCase();
  }
  
  // Return empty if invalid
  return '';
}

/**
 * Detect MIME type from base64 header bytes
 */
function detectMimeType(base64: string): string | null {
  const signatures: Record<string, string> = {
    '/9j/': 'image/jpeg',
    'iVBORw0KGgo': 'image/png',
    'R0lGOD': 'image/gif',
    'UklGR': 'image/webp'
  };
  
  for (const [sig, mime] of Object.entries(signatures)) {
    if (base64.startsWith(sig)) {
      return mime;
    }
  }
  
  return null;
}

/**
 * Validate an OpenAI API key by making a test request
 */
export async function validateOpenAIKey(apiKey: string): Promise<{ valid: boolean; error?: string }> {
  try {
    const openai = createOpenAIClient(apiKey);
    
    // Make a minimal API call to validate the key
    await openai.models.list();
    
    return { valid: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    if (errorMessage.includes('401') || errorMessage.includes('invalid_api_key')) {
      return { valid: false, error: 'Invalid API key' };
    }
    if (errorMessage.includes('429')) {
      return { valid: false, error: 'Rate limit exceeded' };
    }
    
    return { valid: false, error: errorMessage };
  }
}
