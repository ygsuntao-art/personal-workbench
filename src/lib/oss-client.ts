import type { FileEntry } from "@/lib/file-library";

type PresignResponse = { url?: string; objectKey?: string; error?: string };
type SyncResponse = { objectKey?: string; size?: number; etag?: string; sha256?: string; syncedAt?: number; verified?: boolean; error?: string };

export type FileLibraryManifest = {
  version: 1;
  updatedAt: number;
  files: FileEntry[];
};

function escapeXml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function internalDownloadName(entry: FileEntry) {
  const name = entry.name.trim() || (entry.internalType === "document" ? "无标题文档" : entry.internalType === "spreadsheet" ? "无标题表格" : "新建文本文档");
  if (entry.internalType === "document") return /\.docx$/i.test(name) ? name : /\.doc$/i.test(name) ? `${name.slice(0, -4)}.docx` : `${name}.docx`;
  if (entry.internalType === "spreadsheet") return /\.xlsx$/i.test(name) ? name : /\.xls$/i.test(name) ? `${name.slice(0, -4)}.xlsx` : `${name}.xlsx`;
  if (entry.internalType === "text") return /\.txt$/i.test(name) ? name : `${name}.txt`;
  return name;
}

export function cloudObjectKeyForEntry(entry: FileEntry) {
  const fileName = entry.internalType ? internalDownloadName(entry) : entry.name;
  const safeName = fileName.replace(/[\\/:*?"<>|]/g, "_");
  return `workbench/files/${entry.id}/${safeName}`;
}

async function documentBlob(entry: FileEntry) {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  const lines = (entry.plainText ?? "").replace(/\r/g, "").split("\n");
  const paragraphs = (lines.length ? lines : [""]).map((line) => `<w:p><w:r><w:t xml:space="preserve">${escapeXml(line)}</w:t></w:r></w:p>`).join("");
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`);
  zip.folder("_rels")?.file(".rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
  zip.folder("word")?.file("document.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>`);
  return await zip.generateAsync({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
}

async function spreadsheetBlob(entry: FileEntry) {
  const XLSX = await import("@e965/xlsx");
  const data = entry.tableData;
  const rows = Array.from({ length: data?.rows ?? 20 }, () => Array.from({ length: data?.columns ?? 8 }, () => ""));
  Object.entries(data?.cells ?? {}).forEach(([key, value]) => {
    const match = key.match(/^([A-Z]+)(\d+)$/);
    if (!match) return;
    const column = match[1].split("").reduce((total, char) => total * 26 + char.charCodeAt(0) - 64, 0) - 1;
    const row = Number(match[2]) - 1;
    if (rows[row] && column >= 0) rows[row][column] = value;
  });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), "Sheet1");
  const buffer = XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  return new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

export async function entryCloudBlob(entry: FileEntry) {
  if (!entry.internalType && entry.blob) return entry.blob;
  if (entry.internalType === "document") return await documentBlob(entry);
  if (entry.internalType === "spreadsheet") return await spreadsheetBlob(entry);
  const content = entry.internalType === "text" ? entry.plainText ?? "" : JSON.stringify({ version: 1, type: entry.internalType, name: entry.name, contentJson: entry.contentJson, plainText: entry.plainText, workbookData: entry.workbookData, tableData: entry.tableData });
  return new Blob([content], { type: entry.internalType === "text" ? "text/plain;charset=utf-8" : "application/json" });
}

export function entryCloudObjectKeys(entry: FileEntry) {
  return [entry.cloudObjectKey, entry.originalCloudObjectKey].filter((key, index, keys): key is string => Boolean(key && keys.indexOf(key) === index));
}

export async function uploadEntryToOss(entry: FileEntry) {
  if (entry.kind !== "file") throw new Error("文件夹无需上传");
  const blob = await entryCloudBlob(entry);
  const safeName = (entry.internalType ? internalDownloadName(entry) : entry.name).replace(/[\\/:*?"<>|]/g, "_");
  const isInternalContent = Boolean(entry.internalType);
  const objectKey = isInternalContent ? cloudObjectKeyForEntry(entry) : `workbench/files/${entry.id}/${safeName}`;
  const form = new FormData();
  form.append("fileId", entry.id);
  form.append("objectKey", objectKey);
  form.append("contentType", blob.type || "application/octet-stream");
  const manifestEntry: Partial<FileEntry> = { ...entry };
  delete manifestEntry.blob;
  form.append("entry", JSON.stringify(manifestEntry));
  form.append("file", blob, safeName);
  const response = await fetch("/api/storage/oss/sync", { method: "PUT", body: form, cache: "no-store" });
  const synced = await response.json() as SyncResponse;
  if (!response.ok || !synced.verified || !synced.objectKey) throw new Error(synced.error || "OSS 上传后校验失败");
  const originalCloudObjectKey = isInternalContent ? undefined : entry.originalCloudObjectKey;
  return { cloudObjectKey: synced.objectKey, originalCloudObjectKey, size: synced.size ?? blob.size, cloudEtag: synced.etag ?? "", cloudSha256: synced.sha256 ?? "", cloudSyncedAt: synced.syncedAt ?? Date.now() };
}

export async function loadFileManifestFromOss() {
  const response = await fetch("/api/storage/oss/manifest", { cache: "no-store" });
  const data = await response.json() as FileLibraryManifest & { error?: string };
  if (!response.ok) throw new Error(data.error || "读取 OSS 文件索引失败");
  return data.files ?? [];
}

export async function saveFileManifestToOss(entries: FileEntry[]) {
  const manifestEntries = entries.map((entry) => {
    const manifestEntry: Partial<FileEntry> = { ...entry };
    delete manifestEntry.blob;
    return manifestEntry;
  });
  const response = await fetch("/api/storage/oss/manifest", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ version: 1, files: manifestEntries }),
  });
  const data = await response.json() as { error?: string };
  if (!response.ok) throw new Error(data.error || "保存 OSS 文件索引失败");
}

export async function deleteObjectsFromOss(objectKeys: string[]) {
  if (!objectKeys.length) return;
  const response = await fetch("/api/storage/oss/presign", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ objectKeys }),
  });
  const data = await response.json() as { error?: string };
  if (!response.ok) throw new Error(data.error || "删除 OSS 文件失败");
}

export async function getSignedDownloadUrl(objectKey: string) {
  const response = await fetch("/api/storage/oss/presign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ method: "GET", objectKey }),
  });
  const signed = await response.json() as PresignResponse & { expiresIn?: number };
  if (!response.ok || !signed.url) throw new Error(signed.error || "无法生成 OSS 下载链接");
  return signed.url;
}

export async function fetchEntryBlobFromOss(entry: FileEntry) {
  if (!entry.cloudObjectKey) throw new Error("这个文件还没有云端对象");
  const url = await getSignedDownloadUrl(entry.cloudObjectKey);
  const download = await fetch(url);
  if (!download.ok) throw new Error(`OSS 下载失败（${download.status}）`);
  return await download.blob();
}
