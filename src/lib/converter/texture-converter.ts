import { ParsedJavaPack } from "./java-parser";
import { ConversionOptions, ConversionReport } from "./types";

export interface ConvertedTextureRecord {
  bedrockPath: string;
  buffer: Buffer;
}

export class TextureConverter {
  constructor(private report: ConversionReport, private options: ConversionOptions) {}

  public convertTextures(javaPack: ParsedJavaPack): ConvertedTextureRecord[] {
    const results: ConvertedTextureRecord[] = [];

    for (const [texName, buffer] of Object.entries(javaPack.textures)) {
      // TexName in Java: "minecraft:item/stick" or "custom:block/foo" or just "item/foo"
      
      const cleanTexName = texName.split(":").pop() || texName;
      let bedrockPath = "";

      if (cleanTexName.startsWith("item/")) {
        bedrockPath = `textures/items/${cleanTexName.replace("item/", "")}.png`;
      } else if (cleanTexName.startsWith("block/")) {
        bedrockPath = `textures/blocks/${cleanTexName.replace("block/", "")}.png`;
      } else if (cleanTexName.startsWith("gui/")) {
        bedrockPath = `textures/gui/${cleanTexName.replace("gui/", "")}.png`;
      } else {
        // Fallback or root texture
        bedrockPath = `textures/${cleanTexName}.png`;
      }

      results.push({ bedrockPath, buffer });
    }

    return results;
  }
}
