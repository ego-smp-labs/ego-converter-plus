import { NextRequest, NextResponse } from "next/server";
import { convertPack } from "@/lib/converter";
import yazl from "yazl";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const autoFix = formData.get("autoFix") === "true";
    const strictMode = formData.get("strictMode") === "true";
    const convertCustomFonts = formData.get("convertCustomFonts") !== "false";

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const genGeyserMap = formData.get("genGeyserMap") === "true";

    // Run converter
    const { mcpackBuffer, geyserMapping, report } = await convertPack(buffer, {
      autoFix,
      strictMode,
      convertCustomFonts,
    });

    let finalBuffer: Buffer;
    let filename = "converted-pack.mcpack";

    if (genGeyserMap) {
      finalBuffer = await new Promise<Buffer>((resolve, reject) => {
        const zip = new yazl.ZipFile();
        zip.addBuffer(mcpackBuffer, "converted-pack.mcpack");
        zip.addBuffer(Buffer.from(JSON.stringify(geyserMapping, null, 2)), "geyser_mapping.json");
        zip.addBuffer(Buffer.from(JSON.stringify(report, null, 2)), "packconverter_report.json");
        zip.end();
        
        const chunks: Buffer[] = [];
        zip.outputStream.on("data", c => chunks.push(c));
        zip.outputStream.on("end", () => resolve(Buffer.concat(chunks)));
        zip.outputStream.on("error", reject);
      });
      filename = "EgoConverter_Output.zip";
    } else {
      finalBuffer = mcpackBuffer;
    }

    return new NextResponse(finalBuffer as any, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error: any) {
    console.error("Conversion API Error:", error);
    return NextResponse.json(
      { error: "Pack conversion failed", details: error?.message || String(error) },
      { status: 500 }
    );
  }
}
