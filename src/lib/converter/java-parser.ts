import yauzl from "yauzl";
import { Sanitizer } from "./sanitizer";
import { ConversionReport } from "./types";

export interface ParsedJavaPack {
  packFormat: number;
  models: Record<string, any>;
  items: Record<string, any>; // 1.21.4+
  textures: Record<string, Buffer>;
  fonts: Record<string, any>;
  fontTextures: Record<string, Buffer>;
  packIcon?: Buffer;
}

export class JavaParser {
  private sanitizer: Sanitizer;

  constructor(private report: ConversionReport, sanitizer: Sanitizer) {
    this.sanitizer = sanitizer;
  }

  public async parseZipBuffer(buffer: Buffer): Promise<ParsedJavaPack> {
    return new Promise((resolve, reject) => {
      const parsed: ParsedJavaPack = {
        packFormat: 0,
        models: {},
        items: {},
        textures: {},
        fonts: {},
        fontTextures: {},
      };

      yauzl.fromBuffer(buffer, { lazyEntries: true }, (err, zipfile) => {
        if (err || !zipfile) {
          return reject(err || new Error("Failed to read zip buffer"));
        }

        zipfile.readEntry();
        zipfile.on("entry", (entry: yauzl.Entry) => {
          if (/\/$/.test(entry.fileName)) {
            // Directory
            zipfile.readEntry();
            return;
          }

          if (this.sanitizer.isJunkFile(entry.fileName)) {
            zipfile.readEntry();
            return;
          }

          const normalizedPath = this.sanitizer.normalizePath(entry.fileName);

          zipfile.openReadStream(entry, (err, readStream) => {
            if (err || !readStream) {
              this.report.errors.push(`Failed to read ${entry.fileName}: ${err?.message}`);
              zipfile.readEntry();
              return;
            }

            const chunks: Buffer[] = [];
            readStream.on("data", (chunk) => chunks.push(chunk));
            readStream.on("end", () => {
              const fileBuffer = Buffer.concat(chunks);

              try {
                if (normalizedPath === "pack.mcmeta") {
                  const meta = JSON.parse(fileBuffer.toString("utf-8"));
                  parsed.packFormat = meta?.pack?.pack_format || 0;
                } else if (normalizedPath === "pack.png") {
                  parsed.packIcon = fileBuffer;
                } else if (normalizedPath.startsWith("assets/minecraft/models/item/") && normalizedPath.endsWith(".json")) {
                  // Pre-1.21.4 models and some 1.21.4 models
                  const name = normalizedPath.replace("assets/minecraft/models/item/", "").replace(".json", "");
                  parsed.models[name] = JSON.parse(fileBuffer.toString("utf-8"));
                } else if (normalizedPath.startsWith("assets/minecraft/items/") && normalizedPath.endsWith(".json")) {
                  // 1.21.4+ data-driven items
                  const name = normalizedPath.replace("assets/minecraft/items/", "").replace(".json", "");
                  parsed.items[name] = JSON.parse(fileBuffer.toString("utf-8"));
                } else if (normalizedPath.startsWith("assets/minecraft/font/") && normalizedPath.endsWith(".json")) {
                  // Custom core fonts
                  const name = normalizedPath.replace("assets/minecraft/font/", "").replace(".json", "");
                  parsed.fonts[name] = JSON.parse(fileBuffer.toString("utf-8"));
                } else if (normalizedPath.startsWith("assets/minecraft/textures/font/") && normalizedPath.endsWith(".png")) {
                  const name = normalizedPath.replace("assets/minecraft/textures/font/", "").replace(".png", "");
                  parsed.fontTextures[name] = fileBuffer;
                } else if (normalizedPath.startsWith("assets/minecraft/textures/") && normalizedPath.endsWith(".png")) {
                  const name = normalizedPath.replace("assets/minecraft/textures/", "").replace(".png", "");
                  parsed.textures[name] = fileBuffer;
                }
                // Custom namespaces
                else if (normalizedPath.includes("/models/item/") && normalizedPath.endsWith(".json")) {
                  const parts = normalizedPath.split("/models/item/");
                  const namespace = parts[0].replace("assets/", "");
                  const name = parts[1].replace(".json", "");
                  parsed.models[`${namespace}:${name}`] = JSON.parse(fileBuffer.toString("utf-8"));
                } else if (normalizedPath.includes("/items/") && normalizedPath.endsWith(".json")) {
                  const parts = normalizedPath.split("/items/");
                  const namespace = parts[0].replace("assets/", "");
                  const name = parts[1].replace(".json", "");
                  parsed.items[`${namespace}:${name}`] = JSON.parse(fileBuffer.toString("utf-8"));
                } else if (normalizedPath.includes("/font/") && !normalizedPath.includes("/textures/") && normalizedPath.endsWith(".json")) {
                  const parts = normalizedPath.split("/font/");
                  const namespace = parts[0].replace("assets/", "");
                  const name = parts[1].replace(".json", "");
                  parsed.fonts[`${namespace}:${name}`] = JSON.parse(fileBuffer.toString("utf-8"));
                } else if (normalizedPath.includes("/textures/font/") && normalizedPath.endsWith(".png")) {
                  const parts = normalizedPath.split("/textures/font/");
                  const namespace = parts[0].replace("assets/", "");
                  const name = parts[1].replace(".png", "");
                  parsed.fontTextures[`${namespace}:${name}`] = fileBuffer;
                } else if (normalizedPath.includes("/textures/") && normalizedPath.endsWith(".png")) {
                  const parts = normalizedPath.split("/textures/");
                  const namespace = parts[0].replace("assets/", "");
                  const name = parts[1].replace(".png", "");
                  parsed.textures[`${namespace}:${name}`] = fileBuffer;
                }
              } catch (e: any) {
                this.report.warnings.push(`Failed to parse ${normalizedPath}: ${e.message}`);
              }

              zipfile.readEntry();
            });
          });
        });

        zipfile.on("end", () => {
          resolve(parsed);
        });
      });
    });
  }
}
