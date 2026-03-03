import { ParsedJavaPack } from "./java-parser";
import { ConversionOptions, ConversionReport } from "./types";

export interface FontConversionResult {
  fonts: Record<string, any>;
  textures: Array<{ bedrockPath: string; buffer: Buffer }>;
}

export class FontConverter {
  constructor(
    private report: ConversionReport,
    private options: ConversionOptions
  ) {}

  public convertFonts(javaPack: ParsedJavaPack): FontConversionResult {
    const result: FontConversionResult = {
      fonts: {},
      textures: [],
    };

    // 1. Process font JSONs
    for (const [fontName, fontData] of Object.entries(javaPack.fonts)) {
      if (!fontData.providers || !Array.isArray(fontData.providers)) continue;

      const convertedProviders: any[] = [];
      let convertedCount = 0;

      for (const provider of fontData.providers) {
        if (provider.type === "bitmap" && provider.file) {
          // Extract purely the file name, dropping namespace and leading directories
          let cleanFileName = provider.file.replace(/^minecraft:/, "").replace("font/", "");
          if (cleanFileName.includes(":")) {
             // Handle custom namespace
             cleanFileName = cleanFileName.split(":").pop() || cleanFileName;
             cleanFileName = cleanFileName.replace("font/", "");
          }

          convertedProviders.push({
             ...provider,
             file: `textures/font/${cleanFileName}`,
          });
          convertedCount += provider.chars?.length || 0;
        } else {
          // Keep other providers (space, ttf, etc) as-is if possible
          convertedProviders.push(provider);
        }
      }

      const safeFontName = fontName.includes(":") ? fontName.split(":").pop() : fontName;

      result.fonts[safeFontName as string] = {
        providers: convertedProviders
      };

      if (convertedCount > 0) {
        this.report.itemsMapped += convertedCount; // Use itemsMapped as generic metric, or we could add `fontsMapped`
      }
    }

    // 2. Transfer Font Textures
    for (const [texName, buffer] of Object.entries(javaPack.fontTextures)) {
       let safeTexName = texName;
       if (safeTexName.includes(":")) safeTexName = safeTexName.split(":").pop() as string;
       result.textures.push({
          bedrockPath: `textures/font/${safeTexName}.png`,
          buffer
       });
    }

    return result;
  }
}
