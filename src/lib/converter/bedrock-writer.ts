import yazl from "yazl";
import { BedrockManifest } from "./types";
import { ParsedJavaPack } from "./java-parser";
import { BedrockModelData } from "./model-converter";
import { ConvertedTextureRecord } from "./texture-converter";
import { FontConversionResult } from "./font-converter";
import { GeyserMappingV2 } from "./types";
import { ConversionReport } from "./types";

export class BedrockWriter {
  public async writePack(
    javaPack: ParsedJavaPack,
    bedrockData: BedrockModelData,
    textures: ConvertedTextureRecord[],
    fonts: FontConversionResult
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const zipfile = new yazl.ZipFile();

      // 1. Manifest
      const manifest: BedrockManifest = {
        format_version: 2,
        header: {
          description: "Converted by EgoConverter++",
          name: "EgoConverter Pack",
          uuid: crypto.randomUUID(),
          version: [1, 0, 0],
          min_engine_version: [1, 21, 40],
        },
        modules: [
          {
            description: "Converted Resources",
            type: "resources",
            uuid: crypto.randomUUID(),
            version: [1, 0, 0],
          },
        ],
      };
      
      zipfile.addBuffer(
        Buffer.from(JSON.stringify(manifest, null, 2)),
        "manifest.json"
      );

      if (javaPack.packIcon) {
        zipfile.addBuffer(javaPack.packIcon, "pack_icon.png");
      }

      // 4. Textures
      for (const tex of textures) {
        zipfile.addBuffer(tex.buffer, tex.bedrockPath);
      }

      // 5. Item Texture definition
      zipfile.addBuffer(
        Buffer.from(JSON.stringify(bedrockData.itemTextureJson, null, 2)),
        "textures/item_texture.json"
      );

      // 5.1 Client Item Definitions (2D Items + 3D Identifiers)
      for (const [fileName, itemData] of Object.entries(bedrockData.clientItems)) {
        zipfile.addBuffer(
          Buffer.from(JSON.stringify(itemData, null, 2)),
          `items/${fileName}`
        );
      }

      // 5.2 Attachables (3D Item Models)
      for (const [fileName, attachableData] of Object.entries(bedrockData.attachables)) {
        zipfile.addBuffer(
          Buffer.from(JSON.stringify(attachableData, null, 2)),
          `attachables/${fileName}`
        );
      }

      // 6. Geometry Models
      for (const [fileName, geoData] of Object.entries(bedrockData.geometryFiles)) {
        zipfile.addBuffer(
          Buffer.from(JSON.stringify(geoData, null, 2)),
          `models/entity/${fileName}` // Bedrock traditionally puts custom item geometry here
        );
      }

      // 7. Font JSONs
      for (const [fontName, fontData] of Object.entries(fonts.fonts)) {
        zipfile.addBuffer(
          Buffer.from(JSON.stringify(fontData, null, 2)),
          `font/${fontName}.json`
        );
      }

      // 8. Font Textures
      for (const tex of fonts.textures) {
         zipfile.addBuffer(tex.buffer, tex.bedrockPath);
      }

      zipfile.end();

      const chunks: Buffer[] = [];
      zipfile.outputStream.on("data", (chunk) => chunks.push(chunk));
      zipfile.outputStream.on("end", () => {
        resolve(Buffer.concat(chunks));
      });
      zipfile.outputStream.on("error", (err) => {
        reject(err);
      });
    });
  }
}
