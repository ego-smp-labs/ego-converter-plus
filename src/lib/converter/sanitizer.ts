import { ConversionOptions, ConversionReport } from "./types";

export class Sanitizer {
  constructor(private report: ConversionReport, private options: ConversionOptions) {}

  public isJunkFile(filePath: string): boolean {
    const isMacOSX = filePath.includes("__MACOSX") || filePath.includes(".DS_Store");
    const isThumbsDb = filePath.toLowerCase().includes("thumbs.db");
    
    if (isMacOSX || isThumbsDb) {
      if (this.options.autoFix) {
        this.report.removedFiles.push(filePath);
      }
      return true;
    }
    return false;
  }

  public normalizePath(filePath: string): string {
    let normalized = filePath.replace(/\\/g, "/");

    // Fix invalid characters
    // Minecraft bedrock pathways usually must be lowercase alphanumeric and underscore
    const lower = normalized.toLowerCase();
    
    // If the path was changed due to lowercase or other auto-fix rules, we record it
    if (normalized !== lower) {
      if (this.options.autoFix) {
        // Safe replacement
        normalized = lower;
        this.report.renamedPaths.push({ from: filePath, to: normalized });
      } else {
        this.report.warnings.push(`File path contains uppercase characters: ${filePath}`);
      }
    }

    return normalized;
  }
}
