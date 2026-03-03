# 🗃️ EgoConverter++

<div align="center">

![EgoConverter++](https://img.shields.io/badge/EgoConverter++-Tool-4F46E5?style=for-the-badge&logo=next.js&logoColor=white)
[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/License-ENCL-red.svg?style=for-the-badge)](./LICENSE)
[![GitHub Repo stars](https://img.shields.io/github/stars/ego-smp-labs/ego-converter-plus?style=for-the-badge&logo=github&color=333333)](https://github.com/ego-smp-labs/ego-converter-plus)
[![Discord](https://img.shields.io/badge/Discord-Join%20Us-5865F2?style=for-the-badge&logo=discord&logoColor=white)](https://discord.gg/jRqnNbupj4)

**Next-Gen Minecraft Java to Bedrock Resource Pack Converter** 🛠️

Specifically built to navigate the massive 1.21.4+ item model migrations, handling data-driven items, textures, and generating automatic Geyser mapping files.

[Features](#features) • [Installation](#installation) • [Usage](#usage) • [Technical Details](#technical-details)

</div>

---

## Features

### 🚀 Minecraft 1.21.4+ Ready
* **Data-Driven Items:** Safely parses the new `assets/*/items/*.json` `item_model` structures introduced in 1.21.4 (Pack Format 46).
* **Advanced Dispatchers:** Traverses `range_dispatch` (floats), `condition` (booleans), and `select` nodes to extract all required CustomModelData definitions seamlessly.
* **Component Renames:** Accounts for modern changes like `equippable` model fields morphing to `asset_id`.

### 📦 Seamless Geyser Mappings
* **Format Version 2:** Automatically generates `geyser_mapping.json` using the modern v2 specification (`definition` / `legacy` objects).
* **Dual Format Support:** Converts both pre-1.21.4 `custom_model_data` items (via old `overrides` arrays) and modern 1.21.4+ data-driven references concurrently.

### 🛡️ Robust Sanitization
* **Path Normalization:** Bedrock crashes if file names have uppercase letters. EgoConverter++ safely normalizes all paths to strictly lowercase before writing the `.mcpack`.
* **Transform Auto-Fixing:** Automatically strips invalid or unknown display transforms (e.g. `on_shelf`) from Java block/item models.
* **Junk Filtration:** Cleans macOS `.DS_Store` and `__MACOSX` ghost-files out of the final archive.

### 💻 Dual Interface
* **Web UI (Next.js):** Beautiful Dark Mode interface for dropping zip files and configuring strictness options.
* **Headless CLI:** Run massive file batches flawlessly over the command line.

---

## Installation

### Prerequisites
*   [Node.js](https://nodejs.org/) (v18 or newer)
*   NPM or Yarn

### Setup
1.  **Clone the repository:**
    ```bash
    git clone https://github.com/ego-smp-labs/EgoConverterPlus.git
    cd EgoConverterPlus
    ```
2.  **Install Dependencies:**
    ```bash
    npm install
    ```

---

## Usage

### Web Interface
Boot up the elegant user interface:
```bash
npm run dev
```
Navigate to `http://localhost:3000`. Drag and drop your `.zip` Java resource pack and hit Convert! You'll receive a compressed Bedrock `.mcpack` containing your assets and `geyser_mapping.json`.

### CLI Mode
For developers orchestrating headless pipelines:
```bash
npx tsx cli.ts --input path/to/pack.zip --output converted.mcpack
```

**Options:**
*   `--input` or `-i`: Target Java `.zip` archive.
*   `--output` or `-o`: Bedrock `.mcpack` destination.
*   `--no-fix`: Disables automatic path and display transform fixing.
*   `--strict`: Fails conversion on unknown models instead of attempting fallbacks.

---

## Deploying to GeyserMC

Once you have your `EgoConverter_Output.zip` from the web UI (or the CLI outputs):

1. **Unzip** the downloaded folder. You will see a `converted-pack.mcpack` and a `geyser_mapping.json`.
2. **Move the Resource Pack:** Put the `converted-pack.mcpack` into your Geyser's `packs/` folder (e.g. `plugins/Geyser-Spigot/packs/`).
3. **Move the Mappings:** Put the `geyser_mapping.json` into your Geyser's `custom_mappings/` folder (e.g. `plugins/Geyser-Spigot/custom_mappings/`).
4. **Reload Geyser:** Run `/geyser reload` in your server console.
5. **Connect:** When Bedrock players join, they will now be prompted to download the converted pack, and all custom items, characters, and armor will correctly map!

---

## Technical Details

### Project Structure
```text
pack-converter-plus/
├── src/
│   ├── app/                    # Next.js App Router (Web UI & APIs)
│   │   ├── api/convert/route.ts# Fast Streaming Conversion Endpoint
│   │   └── page.tsx            # Drag & Drop Interface
│   └── lib/converter/          # EgoCore Engine
│       ├── java-parser.ts      # Buffers ZIPs and extracts JSON nodes
│       ├── model-converter.ts  # Folds elements into Bedrock geometry
│       ├── texture-converter.ts# Normalizes images into blocks/items/gui
│       ├── geyser-mapper.ts    # Constructs format_version 2 definitions
│       └── sanitizer.ts        # Destroys incompatible Bedrock characters
├── cli.ts                      # Headless invocation wrapper
└── tailwind.config.ts          # Styling variables
```

### Known Limitations
* Advanced `composite` geometries or deeply nested condition gates mapping to identical custom items might require manual tweaks post-conversion.
* Java texture UV arrays out-of-bounds mapping natively to Bedrock meshes are approximated.

---

## License

Distributed under the Ego SMP Non-Commercial License (ENCL). See `LICENSE` for more information.

Copyright © 2026 **NirussVn0** and **Ego SMP Labs**.
