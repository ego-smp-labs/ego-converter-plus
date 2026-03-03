import {
  ParsedJavaPack,
} from "./java-parser";
import {
  ConversionOptions,
  ConversionReport,
  CustomItemDefinitionV2,
  GeyserMappingV2,
} from "./types";

export class GeyserMapper {
  constructor(
    private report: ConversionReport,
    private options: ConversionOptions
  ) {}

  public generateMapping(javaPack: ParsedJavaPack): GeyserMappingV2 {
    const mapping: GeyserMappingV2 = {
      format_version: 2,
      items: {},
    };

    // 1) Process Pre-1.21.4 Overrides (legacy custom_model_data)
    for (const [modelName, modelJson] of Object.entries(javaPack.models)) {
      if (modelJson.overrides && Array.isArray(modelJson.overrides)) {
        // This is a base item model containing overrides, e.g. minecraft:stick
        const baseItem = modelName.includes(":") ? modelName : `minecraft:${modelName}`;

        for (const override of modelJson.overrides) {
          if (override.predicate && override.predicate.custom_model_data !== undefined) {
            const cmd = override.predicate.custom_model_data;
            const targetModel = override.model;

            if (!mapping.items[baseItem]) {
              mapping.items[baseItem] = [];
            }

            const cleanModelName = targetModel.replace("item/", ""); // minecraft:item/custom_sword -> minecraft:custom_sword
            
            mapping.items[baseItem].push({
              type: "legacy",
              custom_model_data: cmd,
              bedrock_identifier: cleanModelName.includes(":") ? cleanModelName : `minecraft:${cleanModelName}`,
            });

            this.report.itemsMapped++;
          }
        }
      }
    }

    // 2) Process 1.21.4+ Data-Driven Items
    for (const [itemName, itemJson] of Object.entries(javaPack.items)) {
      // e.g. itemName = "minecraft:stick" or "custom:magic_wand"
      const baseItem = itemName.includes(":") ? itemName : `minecraft:${itemName}`;

      if (!itemJson.model || !itemJson.model.type) continue;

      if (!mapping.items[baseItem]) {
        mapping.items[baseItem] = [];
      }

      this.processDataDrivenModel(itemJson.model, baseItem, mapping.items[baseItem]);
    }

    return mapping;
  }

  private processDataDrivenModel(
    modelNode: any,
    baseItem: string,
    outputArray: CustomItemDefinitionV2[]
  ) {
    if (!modelNode || !modelNode.type) return;

    if (modelNode.type === "minecraft:model") {
      // Basic static model replacement
      const modelId = modelNode.model;
      const cleanModelId = modelId.replace("item/", "");

      outputArray.push({
        type: "definition",
        model: modelId,
        bedrock_identifier: cleanModelId.includes(":") ? cleanModelId : `minecraft:${cleanModelId}`,
        display_name: cleanModelId.split(":").pop() || cleanModelId,
      });
      this.report.itemsMapped++;
    } else if (modelNode.type === "minecraft:range_dispatch") {
      // E.g. custom_model_data float
      if (modelNode.property === "minecraft:custom_model_data") {
        for (const entry of modelNode.entries || []) {
          const threshold = entry.threshold;
          const targetModel = entry.model;

          // Target model is another model node, recurse
          this.processDataDrivenModel(targetModel, baseItem, outputArray);
        }
        
        if (modelNode.fallback) {
           this.processDataDrivenModel(modelNode.fallback, baseItem, outputArray);
        }
      }
    } else if (modelNode.type === "minecraft:select") {
        for (const caseNode of modelNode.cases || []) {
           // Target model is another model node, recurse
           this.processDataDrivenModel(caseNode.model, baseItem, outputArray);
        }
        if (modelNode.fallback) {
           this.processDataDrivenModel(modelNode.fallback, baseItem, outputArray);
        }
    } else if (modelNode.type === "minecraft:condition") {
        this.processDataDrivenModel(modelNode.on_true, baseItem, outputArray);
        this.processDataDrivenModel(modelNode.on_false, baseItem, outputArray);
    } else {
      this.report.unsupportedFields.push({
        file: `items/${baseItem}.json`,
        field: `model.type=${modelNode.type}`,
        message: "Unsupported item_model type. Fallback ignored or partially handled.",
      });
    }
  }
}
