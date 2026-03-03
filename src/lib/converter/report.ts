import { ConversionReport } from "./types";

export function createEmptyReport(): ConversionReport {
  return {
    removedFiles: [],
    renamedPaths: [],
    unsupportedFields: [],
    itemsMapped: 0,
    warnings: [],
    errors: [],
  };
}
