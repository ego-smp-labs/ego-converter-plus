#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { convertPack } from "./src/lib/converter";

async function main() {
  const args = process.argv.slice(2);
  let inputPath = "";
  let outputPath = "";
  let autoFix = true;
  let strictMode = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--input" || args[i] === "-i") {
      inputPath = args[++i];
    } else if (args[i] === "--output" || args[i] === "-o") {
      outputPath = args[++i];
    } else if (args[i] === "--no-fix") {
      autoFix = false;
    } else if (args[i] === "--strict") {
      strictMode = true;
    }
  }

  if (!inputPath) {
    console.error("Usage: egoconv --input <pack.zip> [--output <out.mcpack>] [--no-fix] [--strict]");
    process.exit(1);
  }

  if (!outputPath) {
    outputPath = inputPath.replace(".zip", "_bedrock.mcpack");
  }

  console.log(`Converting ${inputPath}...`);
  console.log(`Options: autoFix=${autoFix}, strictMode=${strictMode}`);

  try {
    const fileBuffer = fs.readFileSync(path.resolve(inputPath));
    const result = await convertPack(fileBuffer, { autoFix, strictMode });
    
    fs.writeFileSync(path.resolve(outputPath), result.mcpackBuffer);
    
    const geyserPath = outputPath.replace(".mcpack", "_geyser_mapping.json");
    fs.writeFileSync(path.resolve(geyserPath), JSON.stringify(result.geyserMapping, null, 2));

    const reportPath = outputPath.replace(".mcpack", "_report.json");
    fs.writeFileSync(path.resolve(reportPath), JSON.stringify(result.report, null, 2));

    console.log("-----------------------------------------");
    console.log(`Success! Saved ${outputPath}`);
    console.log(`Saved mapping to ${geyserPath}`);
    console.log(`Items mapped: ${result.report.itemsMapped}`);
    console.log(`Warnings: ${result.report.warnings.length}`);
    console.log(`Files cleaned up: ${result.report.removedFiles.length}`);
    console.log("-----------------------------------------");
    process.exit(0);
  } catch (error: any) {
    console.error("Error during conversion:", error.message || error);
    process.exit(1);
  }
}

main();
