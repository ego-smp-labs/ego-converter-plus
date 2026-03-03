"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { 
  UploadCloud, 
  CheckCircle2, 
  AlertTriangle, 
  FileArchive, 
  Download,
  Package,
  FolderOpen,
  Image as ImageIcon,
  FileCode2,
  Settings,
  ChevronRight,
  ChevronDown,
  Box
} from "lucide-react";
import JSZip from "jszip";

// --- Types for Client-Side Parsing ---
type CustomItemPreview = {
  name: string;
  modelData: string | number;
  textureUrl?: string;
};

type CustomFontPreview = {
  charHex: string;
  textureUrl?: string;
};

type PackInfo = {
  name: string;
  format: number;
  description: string;
  iconUrl: string | null;
  filesCount: number;
  itemsFound: CustomItemPreview[];
  fontsFound: CustomFontPreview[];
  fileTree: TreeNode;
};

type TreeNode = {
  name: string;
  path: string;
  type: "folder" | "file";
  children?: TreeNode[];
};

// --- Helper Functions ---
function buildFileTree(paths: string[]): TreeNode {
  const root: TreeNode = { name: "Root", path: "", type: "folder", children: [] };
  
  for (const path of paths) {
    const parts = path.split("/");
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (!part) continue;

      const isFile = i === parts.length - 1 && !path.endsWith("/");
      let child = current.children?.find(c => c.name === part);

      if (!child) {
        child = {
          name: part,
          path: parts.slice(0, i + 1).join("/"),
          type: isFile ? "file" : "folder",
          children: isFile ? undefined : [],
        };
        current.children!.push(child);
      }
      current = child;
    }
  }

  // Sort: folders first, then files
  const sortTree = (node: TreeNode) => {
    if (node.children) {
      node.children.sort((a, b) => {
        if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
      node.children.forEach(sortTree);
    }
  };
  sortTree(root);

  return root;
}

// --- Components ---
const FileTreeViewer = ({ node, level = 0 }: { node: TreeNode; level?: number }) => {
  const [isOpen, setIsOpen] = useState(level === 0);

  if (node.type === "file") {
    const isImage = node.name.endsWith(".png") || node.name.endsWith(".mcmeta");
    return (
      <div className="flex items-center gap-2 py-1 px-2 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-md cursor-default text-sm text-neutral-600 dark:text-neutral-400" style={{ paddingLeft: `${level * 16}px` }}>
        {isImage ? <ImageIcon className="w-4 h-4 text-blue-500" /> : <FileCode2 className="w-4 h-4 text-neutral-400" />}
        <span className="truncate">{node.name}</span>
      </div>
    );
  }

  return (
    <div>
      <div 
        className="flex items-center gap-2 py-1 px-2 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-md cursor-pointer text-sm text-neutral-800 dark:text-neutral-200 font-medium select-none"
        style={{ paddingLeft: `${Math.max(0, level - 1) * 16}px` }}
        onClick={() => setIsOpen(!isOpen)}
      >
        {isOpen ? <ChevronDown className="w-4 h-4 text-neutral-500" /> : <ChevronRight className="w-4 h-4 text-neutral-500" />}
        <FolderOpen className="w-4 h-4 text-yellow-500" />
        {node.name !== "Root" ? node.name : "Resource Pack"}
      </div>
      {isOpen && node.children && (
        <div className="mt-1">
          {node.children.map((child, i) => (
            <FileTreeViewer key={`${child.path}-${i}`} node={child} level={level + 1} />
          ))}
        </div>
      )}
    </div>
  );
};


export default function EgoConverterPage() {
  const [file, setFile] = useState<File | null>(null);
  const [packInfo, setPackInfo] = useState<PackInfo | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [activeTab, setActiveTab] = useState<"options" | "tree" | "items" | "fonts">("options");

  // Options
  const [autoFix, setAutoFix] = useState(true);
  const [strictMode, setStrictMode] = useState(false);
  const [genGeyserMap, setGenGeyserMap] = useState(true);
  const [convertCustomFonts, setConvertCustomFonts] = useState(true);
  
  // Status
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Parse Zip automatically when file changes
  useEffect(() => {
    if (!file) {
      setPackInfo(null);
      return;
    }

    let isCancelled = false;

    const parseZip = async () => {
      setIsParsing(true);
      setError(null);
      setSuccess(false);

      try {
        const zip = new JSZip();
        const loadedZip = await zip.loadAsync(file);
        
        const filesCount = Object.keys(loadedZip.files).length;
        const paths = Object.keys(loadedZip.files);
        let format = 0;
        let description = "Unknown Pack";
        let iconUrl: string | null = null;
        const itemsFound: string[] = [];

        // Try reading pack.mcmeta
        if (loadedZip.file("pack.mcmeta")) {
          const content = await loadedZip.file("pack.mcmeta")!.async("string");
          try {
            const json = JSON.parse(content);
            format = json?.pack?.pack_format || 0;
            if (json?.pack?.description) {
               description = typeof json.pack.description === "string" 
                 ? json.pack.description 
                 : (json.pack.description.text || "Resource Pack");
            }
          } catch (e) {}
        }

        // Try reading pack.png
        if (loadedZip.file("pack.png")) {
          const blob = await loadedZip.file("pack.png")!.async("blob");
          iconUrl = URL.createObjectURL(blob);
        }

        // Scan for custom items (Advanced extraction)
        type RawDetectedItem = { name: string; modelData: string | number; modelRef: string };
        const rawItems: RawDetectedItem[] = [];

        for (const p of paths) {
          // Pre-1.21.4 Overrides
          if (p.startsWith("assets/minecraft/models/item/") && p.endsWith(".json")) {
            try {
              const fileData = await loadedZip.file(p)!.async("string");
              const json = JSON.parse(fileData);
              if (json.overrides && Array.isArray(json.overrides)) {
                for (const ov of json.overrides) {
                  if (ov.predicate && ov.predicate.custom_model_data !== undefined) {
                    rawItems.push({
                      name: ov.model?.split("/")?.pop()?.replace("minecraft:", "") || "Unknown",
                      modelRef: ov.model,
                      modelData: ov.predicate.custom_model_data,
                    });
                  }
                }
              }
            } catch (e) {}
          }
          // 1.21.4+ Data-Driven Items
          else if (p.startsWith("assets/minecraft/items/") && p.endsWith(".json")) {
            try {
              const fileData = await loadedZip.file(p)!.async("string");
              const json = JSON.parse(fileData);
              const name = p.split("/").pop()!.replace(".json", "");
              
              if (json.model && json.model.type === "minecraft:range_dispatch" && json.model.property === "minecraft:custom_model_data") {
                 for (const entry of json.model.entries) {
                   if (!entry.model) continue;
                   rawItems.push({
                     name: entry.model.id?.split("/")?.pop()?.replace("minecraft:", "") || name,
                     modelRef: entry.model.id,
                     modelData: entry.threshold
                   });
                 }
              } else if (json.model && json.model.type === "minecraft:model") {
                 rawItems.push({
                     name,
                     modelRef: json.model.model,
                     modelData: "Item (1.21.4+)"
                 });
              }
            } catch (e) {}
          }
        }

        // Resolving textures for the detected items
        const resolvedItems: CustomItemPreview[] = [];
        for (const raw of rawItems) {
          if (!raw.modelRef) continue;
          let textureObjUrl: string | undefined = undefined;
          
          try {
            const cleanModelRef = raw.modelRef.replace("minecraft:", "");
            let modelPath = `assets/minecraft/models/${cleanModelRef}.json`;
            if (!loadedZip.file(modelPath)) modelPath = `assets/minecraft/models/item/${cleanModelRef}.json`;

            let texString = cleanModelRef; // fallback
            if (loadedZip.file(modelPath)) {
               const modelData = JSON.parse(await loadedZip.file(modelPath)!.async("string"));
               if (modelData.textures) {
                 texString = modelData.textures.layer0 || modelData.textures["0"] || texString;
               }
            }
            
            const cleanTexString = texString.replace("minecraft:", "").replace("item/", "");
            let texPath = `assets/minecraft/textures/${cleanTexString}.png`;
            if (!loadedZip.file(texPath)) texPath = `assets/minecraft/textures/item/${cleanTexString}.png`;
            
            if (loadedZip.file(texPath)) {
              const blob = await loadedZip.file(texPath)!.async("blob");
              textureObjUrl = URL.createObjectURL(blob);
            }
          } catch(e) {}

          resolvedItems.push({
            name: raw.name,
            modelData: raw.modelData,
            textureUrl: textureObjUrl
          });
        }
        
        // Finalize unique keys
        const uniqueKeys = new Set<string>();
        const finalItems: CustomItemPreview[] = [];
        for (const it of resolvedItems) {
          const k = `${it.name}-${it.modelData}`;
          if (!uniqueKeys.has(k)) {
            uniqueKeys.add(k);
            finalItems.push(it);
          }
        }

        // Extract custom fonts
        const rawFonts: { chars: string[]; filePath: string }[] = [];
        for (const p of paths) {
          if (p.startsWith("assets/minecraft/font/") && p.endsWith(".json")) {
            try {
              const fileData = await loadedZip.file(p)!.async("string");
              const json = JSON.parse(fileData);
              if (json.providers && Array.isArray(json.providers)) {
                for (const prov of json.providers) {
                   if (prov.type === "bitmap" && prov.file && prov.chars) {
                      rawFonts.push({
                        filePath: prov.file,
                        chars: Array.isArray(prov.chars) ? prov.chars : []
                      });
                   }
                }
              }
            } catch (e) {}
          }
        }

        const resolvedFonts: CustomFontPreview[] = [];
        for (const rawf of rawFonts) {
           let textureObjUrl: string | undefined = undefined;
           try {
             const cleanTex = rawf.filePath.replace("minecraft:", "").replace("font/", "");
             let texPath = `assets/minecraft/textures/font/${cleanTex}`;
             if (!texPath.endsWith(".png")) texPath += ".png";
             
             if (loadedZip.file(texPath)) {
                const blob = await loadedZip.file(texPath)!.async("blob");
                textureObjUrl = URL.createObjectURL(blob);
             }
           } catch(e) {}
           
           for (const row of rawf.chars) {
             for (const char of row) {
                const hexPair = char.charCodeAt(0).toString(16).toUpperCase();
                resolvedFonts.push({
                   charHex: `\\u${hexPair.padStart(4, "0")}`,
                   textureUrl: textureObjUrl
                });
             }
           }
        }

        const uniqueFonts = new Set<string>();
        const finalFonts: CustomFontPreview[] = [];
        for (const f of resolvedFonts) {
           if (!uniqueFonts.has(f.charHex)) {
             uniqueFonts.add(f.charHex);
             finalFonts.push(f);
           }
        }

        const fileTree = buildFileTree(paths);

        if (!isCancelled) {
          setPackInfo({
            name: file.name,
            format,
            description,
            iconUrl,
            filesCount,
            itemsFound: finalItems.sort((a,b) => a.name.localeCompare(b.name)),
            fontsFound: finalFonts.sort((a,b) => a.charHex.localeCompare(b.charHex)),
            fileTree
          });
          setActiveTab("tree"); // Auto-switch to tree preview on success
        }

      } catch (err: any) {
        if (!isCancelled) setError("Failed to parse zip: " + err.message);
      } finally {
        if (!isCancelled) setIsParsing(false);
      }
    };

    parseZip();

    return () => {
      isCancelled = true;
      if (packInfo?.iconUrl) URL.revokeObjectURL(packInfo.iconUrl);
      if (packInfo?.itemsFound) {
         packInfo.itemsFound.forEach(it => {
            if (it.textureUrl) URL.revokeObjectURL(it.textureUrl);
         });
      }
      if (packInfo?.fontsFound) {
         packInfo.fontsFound.forEach(it => {
            if (it.textureUrl) URL.revokeObjectURL(it.textureUrl);
         });
      }
    };
  }, [file]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
    }
  };

  const handleConvert = async () => {
    if (!file) return;

    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("autoFix", autoFix.toString());
      formData.append("strictMode", strictMode.toString());
      formData.append("genGeyserMap", genGeyserMap.toString());
      formData.append("convertCustomFonts", convertCustomFonts.toString());

      const res = await fetch("/api/convert", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        let msg = "Conversion failed";
        try {
          const errData = await res.json();
          msg = errData.error || errData.details || msg;
        } catch (_) {}
        throw new Error(msg);
      }

      // Handle primary download
      const blob = await res.blob();
      const packUrl = window.URL.createObjectURL(blob);
      const packLink = document.createElement("a");
      packLink.href = packUrl;
      
      const filenameStr = genGeyserMap 
        ? file.name.replace(".zip", "") + "_EgoConverter.zip"
        : file.name.replace(".zip", "") + "_EgoConverter.mcpack";
        
      packLink.download = filenameStr;
      packLink.click();
      window.URL.revokeObjectURL(packUrl);
      
      setSuccess(true);
    } catch (e: any) {
      setError(e.message || "An unknown error occurred.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 p-4 md:p-8 font-sans transition-colors duration-200">
      <div className="max-w-6xl mx-auto space-y-6">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-400 dark:to-indigo-400 flex items-center gap-2">
              <Box className="w-8 h-8 text-blue-600 dark:text-blue-400" />
              EgoConverter++
            </h1>
            <p className="text-neutral-500 dark:text-neutral-400 mt-1 font-medium">
              Minecraft Java 1.21.4+ to Bedrock Converter & Geyser Mapper
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* Left Column: Upload & Actions */}
          <div className="col-span-1 lg:col-span-5 space-y-6">
            
            {/* Upload Box */}
            <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-sm border border-neutral-200 dark:border-neutral-800 p-6 transition-colors duration-200 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-blue-50 dark:bg-blue-900/10 rounded-bl-full -z-0"></div>
              
              <h2 className="text-lg font-semibold flex items-center gap-2 text-neutral-900 dark:text-neutral-100 relative z-10 mb-4">
                <FileArchive className="w-5 h-5 text-blue-500 dark:text-blue-400" />
                Upload Resource Pack
              </h2>
              
              <div className="border-2 border-dashed border-neutral-300 dark:border-neutral-700/60 rounded-xl p-8 text-center hover:bg-neutral-50/50 dark:hover:bg-neutral-800/30 transition-all relative z-10">
                <input 
                  type="file" 
                  accept=".zip" 
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  onChange={handleFileChange}
                />
                <div className="flex flex-col items-center justify-center space-y-3 pointer-events-none">
                  {isParsing ? (
                    <div className="w-10 h-10 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
                  ) : (
                    <UploadCloud className={`w-12 h-12 ${file ? "text-blue-500 dark:text-blue-400" : "text-neutral-400 dark:text-neutral-500"}`} />
                  )}
                  <div>
                    <p className="text-sm text-neutral-800 dark:text-neutral-200 font-semibold">
                      {file ? file.name : "Drop Java .zip here"}
                    </p>
                    <p className="text-xs text-neutral-500 dark:text-neutral-500 mt-1">
                      {file ? "Ready to parse" : "Max size 500MB"}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Pack Intelligence (Only shows if parsed) */}
            {packInfo && (
              <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-sm border border-neutral-200 dark:border-neutral-800 p-6 transition-colors duration-200 animate-in fade-in slide-in-from-bottom-2">
                <div className="flex items-start gap-4">
                  {packInfo.iconUrl ? (
                    <img src={packInfo.iconUrl} alt="Pack Icon" className="w-16 h-16 rounded-lg image-pixelated shadow-sm border border-neutral-200 dark:border-neutral-700" />
                  ) : (
                    <div className="w-16 h-16 rounded-lg bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center border border-neutral-200 dark:border-neutral-700">
                      <Package className="w-8 h-8 text-neutral-400 dark:text-neutral-600" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-neutral-900 dark:text-neutral-100 truncate">{packInfo.name.replace(".zip", "")}</h3>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1 line-clamp-2">{packInfo.description}</p>
                    <div className="flex gap-2 mt-3 flex-wrap">
                      <span className="inline-flex items-center px-2 py-1 rounded bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 text-xs font-semibold">
                        Format: {packInfo.format} {packInfo.format >= 46 && "(1.21.4+)"}
                      </span>
                      <span className="inline-flex items-center px-2 py-1 rounded bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 text-xs font-semibold">
                        {packInfo.filesCount} files
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Action Buttons & Status */}
            <div className="space-y-4">
              <div className="flex gap-3">
                <button 
                  disabled={!file || loading || isParsing}
                  onClick={handleConvert}
                  className={`flex-1 flex items-center justify-center gap-2 px-6 py-4 rounded-xl text-base font-bold shadow-sm transition-all ${
                    !file || loading || isParsing
                      ? "bg-neutral-200 dark:bg-neutral-800 text-neutral-400 dark:text-neutral-600 cursor-not-allowed" 
                      : "bg-blue-600 text-white hover:bg-blue-700 hover:shadow-md active:scale-[0.98] dark:bg-blue-600 dark:hover:bg-blue-500"
                  }`}
                >
                  {loading ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Converting & Packing...
                    </>
                  ) : (
                    <>
                      <Download className="w-5 h-5" />
                      Convert to Bedrock
                    </>
                  )}
                </button>

                {file && !loading && !isParsing && (
                  <button
                    onClick={() => {
                      setFile(null);
                      setPackInfo(null);
                      setSuccess(false);
                      setError(null);
                      setActiveTab("options");
                    }} 
                    className="px-6 py-4 rounded-xl font-bold bg-neutral-200 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-300 dark:hover:bg-neutral-700 transition-colors shadow-sm active:scale-[0.98]"
                    title="Reset workspace"
                  >
                    Reset
                  </button>
                )}
              </div>

              {error && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 text-red-700 dark:text-red-400 p-4 rounded-xl flex items-start gap-3 text-sm animate-in fade-in">
                  <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                  <p>{error}</p>
                </div>
              )}

              {success && (
                <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800/50 text-green-700 dark:text-green-400 p-4 rounded-xl flex items-start gap-3 text-sm animate-in fade-in">
                  <CheckCircle2 className="w-5 h-5 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold">Conversion Complete!</p>
                    <p className="text-green-600 dark:text-green-500/80 mt-1 leading-relaxed">
                      Downloaded as `.mcpack`. <br/>Includes `geyser_mapping.json` inside!
                    </p>
                  </div>
                </div>
              )}
            </div>
            
          </div>

          {/* Right Column: Previews & Settings */}
          <div className="col-span-1 lg:col-span-7 bg-white dark:bg-neutral-900 rounded-2xl shadow-sm border border-neutral-200 dark:border-neutral-800 overflow-hidden flex flex-col transition-colors duration-200" style={{ height: "calc(100vh - 8rem)", minHeight: "500px" }}>
            
                {/* Tabs */}
            <div className="flex overflow-x-auto border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/50 custom-scrollbar">
              <button 
                onClick={() => setActiveTab("options")}
                className={`flex-1 min-w-[120px] flex items-center justify-center gap-2 py-3 px-4 text-sm font-semibold transition-colors
                  ${activeTab === "options" 
                    ? "text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400 bg-white dark:bg-neutral-900" 
                    : "text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200"}`}
              >
                <Settings className="w-4 h-4" /> Options
              </button>
              <button 
                onClick={() => setActiveTab("tree")}
                className={`flex-1 min-w-[120px] flex items-center justify-center gap-2 py-3 px-4 text-sm font-semibold transition-colors
                  ${activeTab === "tree" 
                    ? "text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400 bg-white dark:bg-neutral-900" 
                    : "text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200"}`}
              >
                <FolderOpen className="w-4 h-4" /> File Tree
              </button>
              <button 
                onClick={() => setActiveTab("items")}
                className={`flex-1 min-w-[120px] flex items-center justify-center gap-2 py-3 px-4 text-sm font-semibold transition-colors
                  ${activeTab === "items" 
                    ? "text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400 bg-white dark:bg-neutral-900" 
                    : "text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200"}`}
              >
                <Box className="w-4 h-4" /> Custom Items {packInfo && `(${packInfo.itemsFound.length})`}
              </button>
              <button 
                onClick={() => setActiveTab("fonts")}
                className={`flex-1 min-w-[120px] flex items-center justify-center gap-2 py-3 px-4 text-sm font-semibold transition-colors
                  ${activeTab === "fonts" 
                    ? "text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400 bg-white dark:bg-neutral-900" 
                    : "text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200"}`}
              >
                <ImageIcon className="w-4 h-4" /> Characters {packInfo && `(${packInfo.fontsFound.length})`}
              </button>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto p-6 custom-scrollbar bg-white dark:bg-neutral-900">
              
              {activeTab === "options" && (
                <div className="space-y-6 max-w-lg">
                  <div>
                    <h3 className="text-base font-bold text-neutral-900 dark:text-neutral-100 mb-4">Conversion Settings</h3>
                    <div className="space-y-4">
                      
                      <label className="flex items-start gap-3 cursor-pointer group p-3 rounded-lg border border-transparent hover:border-neutral-200 dark:hover:border-neutral-800 transition-colors">
                        <input 
                          type="checkbox" 
                          checked={autoFix} 
                          onChange={e => setAutoFix(e.target.checked)}
                          className="mt-1 flex-shrink-0 cursor-pointer w-4 h-4 accent-blue-600 dark:accent-blue-500"
                        />
                        <div>
                          <p className="text-sm font-bold text-neutral-900 dark:text-neutral-200 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">Auto-fix Compatibility Issues</p>
                          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1 leading-relaxed">
                            Automatically strips invalid display nodes like <code className="bg-neutral-100 dark:bg-neutral-800 px-1 py-0.5 rounded">ON_SHELF</code> and converts uppercase directories to lowercase. Bedrock rejects models that contain these.
                          </p>
                        </div>
                      </label>

                      <label className="flex items-start gap-3 cursor-pointer group p-3 rounded-lg border border-transparent hover:border-neutral-200 dark:hover:border-neutral-800 transition-colors">
                        <input 
                          type="checkbox" 
                          checked={genGeyserMap} 
                          onChange={e => setGenGeyserMap(e.target.checked)}
                          className="mt-1 flex-shrink-0 cursor-pointer w-4 h-4 accent-blue-600 dark:accent-blue-500"
                        />
                        <div>
                          <p className="text-sm font-bold text-neutral-900 dark:text-neutral-200 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">Generate Geyser Mappings</p>
                          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1 leading-relaxed">
                            Produces a <code className="bg-neutral-100 dark:bg-neutral-800 px-1 py-0.5 rounded">geyser_mapping.json</code> compliant with Format V2 (1.21.4+ definition parsing alongside Legacy support).
                          </p>
                        </div>
                      </label>

                      <label className="flex items-start gap-3 cursor-pointer group p-3 rounded-lg border border-transparent hover:border-neutral-200 dark:hover:border-neutral-800 transition-colors">
                        <input 
                          type="checkbox" 
                          checked={convertCustomFonts} 
                          onChange={e => setConvertCustomFonts(e.target.checked)}
                          className="mt-1 flex-shrink-0 cursor-pointer w-4 h-4 accent-blue-600 dark:accent-blue-500"
                        />
                        <div>
                          <p className="text-sm font-bold text-neutral-900 dark:text-neutral-200 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">Convert Custom Characters (Fonts)</p>
                          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1 leading-relaxed">
                            Parses <code className="bg-neutral-100 dark:bg-neutral-800 px-1 py-0.5 rounded">assets/*/font/*.json</code> arrays into Bedrock-readable Glyph mappings and moves texture images automatically.
                          </p>
                        </div>
                      </label>

                      <label className="flex items-start gap-3 cursor-pointer group p-3 rounded-lg border border-transparent hover:border-neutral-200 dark:hover:border-neutral-800 transition-colors">
                        <input 
                          type="checkbox" 
                          checked={strictMode} 
                          onChange={e => setStrictMode(e.target.checked)}
                          className="mt-1 flex-shrink-0 cursor-pointer w-4 h-4 accent-blue-600 dark:accent-blue-500"
                        />
                        <div>
                          <p className="text-sm font-bold text-neutral-900 dark:text-neutral-200 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">Developer Strict Mode</p>
                          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1 leading-relaxed">
                            Fail conversion immediately if an item condition cannot be mapped accurately instead of attempting safe fallbacks. Useful for debugging pure 1.21.4+ implementations.
                          </p>
                        </div>
                      </label>

                    </div>
                  </div>
                </div>
              )}

              {activeTab === "tree" && (
                <div>
                  {!packInfo ? (
                    <div className="flex flex-col items-center justify-center h-full text-neutral-400 dark:text-neutral-600 mt-20">
                      <FolderOpen className="w-12 h-12 mb-4 opacity-50" />
                      <p>Upload a pack to preview its contents</p>
                    </div>
                  ) : (
                    <div className="font-mono text-sm">
                       <FileTreeViewer node={packInfo.fileTree} />
                    </div>
                  )}
                </div>
              )}

              {activeTab === "items" && (
                <div>
                  {!packInfo ? (
                    <div className="flex flex-col items-center justify-center h-full text-neutral-400 dark:text-neutral-600 mt-20">
                      <Box className="w-12 h-12 mb-4 opacity-50" />
                      <p>Detected Custom Items will appear here</p>
                    </div>
                  ) : (
                    <div>
                      {packInfo.itemsFound.length === 0 ? (
                        <p className="text-neutral-500 dark:text-neutral-400 italic">No custom item definitions found in models/item or items/ directories.</p>
                      ) : (
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                          {packInfo.itemsFound.map((item, idx) => (
                            <div key={idx} className="flex flex-col gap-2 bg-neutral-50 dark:bg-neutral-800/50 p-3 rounded-lg border border-neutral-100 dark:border-neutral-800">
                              <div className="flex items-center gap-3">
                                {item.textureUrl ? (
                                  <img src={item.textureUrl} alt={item.name} className="w-8 h-8 image-pixelated drop-shadow-sm border border-neutral-200 dark:border-neutral-700 bg-neutral-100 dark:bg-neutral-900 rounded-sm" />
                                ) : (
                                  <div className="w-8 h-8 rounded-sm bg-neutral-200 dark:bg-neutral-700 flex items-center justify-center flex-shrink-0 border border-neutral-300 dark:border-neutral-600">
                                    <Box className="w-4 h-4 text-neutral-400" />
                                  </div>
                                )}
                                <div className="min-w-0 flex-1">
                                  <p className="text-xs font-semibold text-neutral-800 dark:text-neutral-200 truncate" title={item.name}>{item.name}</p>
                                  <p className="text-[10px] text-neutral-500 dark:text-neutral-400 font-mono mt-0.5 truncate" title={`CMD: ${item.modelData}`}>Data: {item.modelData}</p>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {activeTab === "fonts" && (
                <div>
                  {!packInfo ? (
                    <div className="flex flex-col items-center justify-center h-full text-neutral-400 dark:text-neutral-600 mt-20">
                      <ImageIcon className="w-12 h-12 mb-4 opacity-50" />
                      <p>Detected Character glyphs will appear here</p>
                    </div>
                  ) : (
                    <div>
                       {packInfo.fontsFound.length === 0 ? (
                         <p className="text-neutral-500 dark:text-neutral-400 italic">No custom font/character definitions found in assets/*/font/ directories.</p>
                       ) : (
                         <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
                           {packInfo.fontsFound.map((item, idx) => (
                              <div key={idx} className="flex flex-col items-center gap-2 bg-neutral-50 dark:bg-neutral-800/50 p-3 rounded-lg border border-neutral-100 dark:border-neutral-800 text-center">
                                {item.textureUrl ? (
                                  <img src={item.textureUrl} alt={item.charHex} className="w-8 h-8 md:w-12 md:h-12 image-pixelated drop-shadow-sm" />
                                ) : (
                                  <div className="w-8 h-8 md:w-12 md:h-12 rounded-sm bg-neutral-200 dark:bg-neutral-700 border border-neutral-300 dark:border-neutral-600" />
                                )}
                                <p className="text-[10px] font-mono font-bold text-neutral-800 dark:text-neutral-300 tracking-wider">
                                  {item.charHex}
                                </p>
                              </div>
                           ))}
                         </div>
                       )}
                    </div>
                  )}
                </div>
              )}

            </div>
          </div>

        </div>
      </div>
      
      {/* Footer Area */}
      <div className="max-w-6xl mx-auto mt-8 lg:mt-12 text-center pb-8">
        <div className="flex flex-wrap items-center justify-center gap-4 mb-4">
           <a 
              href="https://github.com/ego-smp-labs/ego-converter-plus" 
              target="_blank" 
              rel="noopener noreferrer"
              className="inline-flex items-center hover:opacity-80 transition-opacity"
           >
              <img src="https://img.shields.io/github/stars/ego-smp-labs/ego-converter-plus?style=for-the-badge&logo=github&color=333333" alt="GitHub Repo stars" className="h-7" />
           </a>
           
           <a 
              href="https://discord.gg/jRqnNbupj4" 
              target="_blank" 
              rel="noopener noreferrer"
              className="inline-flex items-center hover:opacity-80 transition-opacity"
           >
              <img src="https://img.shields.io/badge/Discord-Join%20Us-5865F2?style=for-the-badge&logo=discord&logoColor=white" alt="Join Discord" className="h-7" />
           </a>
        </div>
        
        <p className="text-sm font-medium text-neutral-500 dark:text-neutral-400">
          Created with ❤️ by <span className="font-bold text-neutral-800 dark:text-neutral-200">NirussVn0</span> and <span className="font-bold text-neutral-800 dark:text-neutral-200">Ego SMP Labs</span>
        </p>
        <p className="text-xs text-neutral-400 dark:text-neutral-600 mt-2">
           Copyright © 2026. Released under the Ego SMP Non-Commercial License (ENCL).
        </p>
      </div>
      
      {/* Scrollbar styling for Webkit */}
      <style dangerouslySetInnerHTML={{__html: `
        .custom-scrollbar::-webkit-scrollbar { width: 8px; height: 8px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background-color: #e5e5e5; border-radius: 20px; }
        .dark .custom-scrollbar::-webkit-scrollbar-thumb { background-color: #262626; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background-color: #d4d4d4; }
        .dark .custom-scrollbar::-webkit-scrollbar-thumb:hover { background-color: #404040; }
        .image-pixelated { image-rendering: pixelated; }
      `}} />
    </div>
  );
}
