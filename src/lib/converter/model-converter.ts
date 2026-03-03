import { ParsedJavaPack } from "./java-parser";
import { ConversionReport, ConversionOptions } from "./types";

export interface BedrockModelData {
  geometryFiles: Record<string, any>;
  itemTextureJson: any; // for textures/item_texture.json
  attachables: Record<string, any>;
  clientItems: Record<string, any>;
}

export class ModelConverter {
  constructor(
    private report: ConversionReport,
    private options: ConversionOptions
  ) {}

  public convertModels(javaPack: ParsedJavaPack): BedrockModelData {
    const data: BedrockModelData = {
      geometryFiles: {},
      itemTextureJson: {
        resource_pack_name: "PackConverter++",
        texture_data: {},
      },
      attachables: {},
      clientItems: {},
    };

    for (const [modelName, modelJson] of Object.entries(javaPack.models)) {
      this.processModel(modelName, modelJson, javaPack.models, data);
    }

    return data;
  }

  private processModel(
    modelName: string,
    modelJson: any,
    allModels: Record<string, any>,
    data: BedrockModelData
  ) {
    const isGenerated =
      modelJson.parent === "item/generated" ||
      modelJson.parent === "minecraft:item/generated" ||
      modelJson.parent === "item/handheld" ||
      modelJson.parent === "minecraft:item/handheld";

    // 1) Handle simple 2D generated items
    if (isGenerated || (!modelJson.elements && modelJson.textures)) {
      if (modelJson.textures && modelJson.textures.layer0) {
        let texPath = modelJson.textures.layer0;
        texPath = texPath.replace("item/", ""); // "minecraft:item/stick" -> "minecraft:stick"
        
        const cleanName = modelName.split(":").pop() || modelName;
        const cleanTex = texPath.split(":").pop() || texPath;
        const bedrockId = cleanName.includes(":") ? cleanName : `minecraft:${cleanName}`;

        data.itemTextureJson.texture_data[cleanName] = {
          textures: `textures/items/${cleanTex}`,
        };

        // Generate client item definition for 2D items
        data.clientItems[`${cleanName}.json`] = {
          format_version: "1.10.0",
          "minecraft:item": {
            description: {
              identifier: bedrockId,
            },
            components: {
              "minecraft:icon": cleanName,
            },
          },
        };
      }
    }

    // 2) Handle Display Transforms (auto-fix unsupported transforms)
    if (modelJson.display) {
      const allowedTransforms = [
        "thirdperson_righthand",
        "thirdperson_lefthand",
        "firstperson_righthand",
        "firstperson_lefthand",
        "gui",
        "head",
        "ground",
        "fixed",
      ];

      for (const [transformKey, transformData] of Object.entries(modelJson.display)) {
        if (!allowedTransforms.includes(transformKey.toLowerCase())) {
          this.report.unsupportedFields.push({
            file: `models/${modelName}.json`,
            field: `display.${transformKey}`,
            message: `Unsupported display transform: ${transformKey}. Removing to prevent crashes.`,
          });

          if (this.options.autoFix) {
            delete modelJson.display[transformKey];
          }
        }
      }
    }

    // 3) Handle 3D Elements (Basic Geometry Mapping)
    if (modelJson.elements && Array.isArray(modelJson.elements)) {
      const cleanName = modelName.split(":").pop() || modelName;
      const geoName = `geometry.${cleanName}`;
      const bedrockId = cleanName.includes(":") ? cleanName : `minecraft:${cleanName}`;

      data.geometryFiles[`${cleanName}.json`] = {
        format_version: "1.12.0",
        "minecraft:geometry": [
          {
            description: {
              identifier: geoName,
              texture_width: 16,
              texture_height: 16,
              visible_bounds_width: 2,
              visible_bounds_height: 2,
              visible_bounds_offset: [0, 0, 0],
            },
            bones: [
              {
                name: "bb_main",
                pivot: [0, 0, 0],
                cubes: modelJson.elements.map((el: any) => this.convertCube(el)),
              },
            ],
          },
        ],
      };

      // Generate attachable for 3D items
      let texLoc = `textures/items/${cleanName}`;
      if (modelJson.textures && modelJson.textures.layer0) {
        const texPath = modelJson.textures.layer0.replace("item/", "");
        texLoc = `textures/items/${texPath.split(":").pop() || texPath}`;
      } else if (modelJson.textures && modelJson.textures.all) {
         const texPath = modelJson.textures.all.replace("item/", "").replace("block/", "");
         texLoc = `textures/blocks/${texPath.split(":").pop() || texPath}`;
      } else if (modelJson.textures) {
         const firstTex = Object.values(modelJson.textures)[0] as string;
         if (firstTex && typeof firstTex === "string") {
            const texPath = firstTex.replace("item/", "").replace("block/", "");
            texLoc = `textures/items/${texPath.split(":").pop() || texPath}`;
         }
      }

      data.attachables[`${cleanName}.json`] = {
        format_version: "1.10.0",
        "minecraft:attachable": {
          description: {
            identifier: bedrockId,
            materials: {
              default: "entity_alphatest",
              enchanted: "entity_alphatest_glint",
            },
            textures: {
              default: texLoc,
              enchanted: "textures/misc/enchanted_item_glint",
            },
            geometry: {
              default: geoName,
            },
            render_controllers: ["controller.render.item_default"],
          },
        },
      };
      
      // We also need a client item for 3D items so Bedrock recognizes the identifier at all
      if (!data.clientItems[`${cleanName}.json`]) {
         data.clientItems[`${cleanName}.json`] = {
            format_version: "1.10.0",
            "minecraft:item": {
              description: {
                identifier: bedrockId,
              },
              components: {
                "minecraft:icon": cleanName, // Fallback icon
              },
            },
          };
      }
    }
  }

  private convertCube(javaCube: any): any {
    // Basic scaling/conversion: Java starts from bottom-left [0,0,0] to [16,16,16]
    // Bedrock coordinates need slight adjustments, usually mapping similar to Java but offset.
    // We do a direct 1:1 mapping for simplicity here.
    return {
      origin: javaCube.from || [0, 0, 0],
      size: [
        Math.max(0, (javaCube.to?.[0] || 0) - (javaCube.from?.[0] || 0)),
        Math.max(0, (javaCube.to?.[1] || 0) - (javaCube.from?.[1] || 0)),
        Math.max(0, (javaCube.to?.[2] || 0) - (javaCube.from?.[2] || 0)),
      ],
      uv: [0, 0], // Advanced UV mapping omitted in baseline
    };
  }
}
