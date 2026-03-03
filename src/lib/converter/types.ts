export interface ConversionOptions {
  autoFix: boolean;
  strictMode: boolean;
  convertCustomFonts?: boolean;
  targetBedrockVersion?: string;
}

export interface ConversionReport {
  removedFiles: string[];
  renamedPaths: Array<{ from: string; to: string }>;
  unsupportedFields: Array<{ file: string; field: string; message: string }>;
  itemsMapped: number;
  warnings: string[];
  errors: string[];
}

export interface BedrockManifest {
  format_version: number;
  header: {
    description: string;
    name: string;
    uuid: string;
    version: [number, number, number];
    min_engine_version: [number, number, number];
  };
  modules: Array<{
    description: string;
    type: "resources";
    uuid: string;
    version: [number, number, number];
  }>;
}

export interface GeyserMappingV2 {
  format_version: 2;
  items: Record<string, CustomItemDefinitionV2[]>;
}

export type CustomItemDefinitionV2 =
  | DefinitionItemV2
  | LegacyItemV2
  | GroupItemV2;

export interface DefinitionItemV2 {
  type: "definition";
  model: string;
  bedrock_identifier: string;
  display_name?: string;
  bedrock_options?: any;
  components?: any;
  predicate?: any;
}

export interface LegacyItemV2 {
  type: "legacy";
  custom_model_data: number;
  bedrock_identifier: string;
  display_name?: string;
}

export interface GroupItemV2 {
  type: "group";
  model?: string;
  definitions: Array<{
    bedrock_identifier: string;
    display_name?: string;
    predicate?: any;
    components?: any;
    bedrock_options?: any;
  }>;
}
