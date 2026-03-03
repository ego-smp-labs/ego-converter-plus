import { ConversionOptions, ConversionReport } from "./types";
import { createEmptyReport } from "./report";
import { Sanitizer } from "./sanitizer";
import { JavaParser } from "./java-parser";
import { ModelConverter } from "./model-converter";
import { TextureConverter } from "./texture-converter";
import { GeyserMapper } from "./geyser-mapper";
import { BedrockWriter } from "./bedrock-writer";
import { FontConverter, FontConversionResult } from "./font-converter";

export async function convertPack(
  inputZipBuffer: Buffer,
  options: ConversionOptions
): Promise<{ mcpackBuffer: Buffer; geyserMapping: object; report: ConversionReport }> {
  // 1. Initialize report and core services
  const report = createEmptyReport();
  const sanitizer = new Sanitizer(report, options);
  
  const parser = new JavaParser(report, sanitizer);
  const modelConverter = new ModelConverter(report, options);
  const textureConverter = new TextureConverter(report, options);
  const fontConverter = new FontConverter(report, options);
  const mapper = new GeyserMapper(report, options);
  const writer = new BedrockWriter();

  // 2. Parse Java Pack (Streaming & Sanitization happens here)
  const parsedPack = await parser.parseZipBuffer(inputZipBuffer);

  // 3. Convert Models -> Bedrock Formats (Geometry + Textures definition)
  const bedrockModels = modelConverter.convertModels(parsedPack);
  
  // 3.5 Convert Textures
  const convertedTextures = textureConverter.convertTextures(parsedPack);

  // 3.8 Convert Fonts
  let bedrockFonts: FontConversionResult = { fonts: {}, textures: [] };
  if (options.convertCustomFonts !== false) {
    bedrockFonts = fontConverter.convertFonts(parsedPack);
  }

  // 4. Generate Geyser mapping v2
  const geyserMapping = mapper.generateMapping(parsedPack);

  // 5. Build Bedrock Output ZIP bundle
  const outputZipBuffer = await writer.writePack(
    parsedPack,
    bedrockModels,
    convertedTextures,
    bedrockFonts as any
  );

  return { mcpackBuffer: outputZipBuffer, geyserMapping, report };
}
