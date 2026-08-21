export type StorageState = "local" | "synced" | "cloud";
export type FileKind = "folder" | "file";
export type InternalFileType = "document" | "spreadsheet" | "text";

export type FileEntry = {
  id: string;
  parentId: string | null;
  originalParentId?: string | null;
  kind: FileKind;
  name: string;
  mimeType: string;
  size: number;
  modifiedAt: number;
  storageState: StorageState;
  sortOrder: number;
  deletedAt: number | null;
  blob?: Blob;
  internalType?: InternalFileType;
  contentJson?: import("@tiptap/react").JSONContent;
  plainText?: string;
  workbookData?: Record<string, unknown>;
  tableData?: import("@/lib/knowledge-base").SpreadsheetData;
  cloudObjectKey?: string;
  originalCloudObjectKey?: string;
  originalMimeType?: string;
  originalSize?: number;
  cloudEtag?: string;
  cloudSha256?: string;
  cloudSyncedAt?: number;
};

export const ROOT_ID = "root";
export const MAX_TEST_FILE_SIZE = 20 * 1024 * 1024;

export const initialFileEntries: FileEntry[] = [
  { id: "folder-live", parentId: null, kind: "folder", name: "直播项目", mimeType: "", size: 0, modifiedAt: Date.now(), storageState: "local", sortOrder: 0, deletedAt: null },
  { id: "folder-assets", parentId: "folder-live", kind: "folder", name: "素材", mimeType: "", size: 0, modifiedAt: Date.now(), storageState: "local", sortOrder: 0, deletedAt: null },
  { id: "folder-images", parentId: "folder-assets", kind: "folder", name: "图片", mimeType: "", size: 0, modifiedAt: Date.now(), storageState: "local", sortOrder: 0, deletedAt: null },
  { id: "folder-videos", parentId: "folder-assets", kind: "folder", name: "视频", mimeType: "", size: 0, modifiedAt: Date.now(), storageState: "local", sortOrder: 1, deletedAt: null },
  { id: "folder-data", parentId: "folder-live", kind: "folder", name: "数据", mimeType: "", size: 0, modifiedAt: Date.now(), storageState: "local", sortOrder: 1, deletedAt: null },
  { id: "folder-reports", parentId: "folder-live", kind: "folder", name: "报告", mimeType: "", size: 0, modifiedAt: Date.now(), storageState: "local", sortOrder: 2, deletedAt: null },
  { id: "folder-ads", parentId: null, kind: "folder", name: "投流项目", mimeType: "", size: 0, modifiedAt: Date.now(), storageState: "local", sortOrder: 1, deletedAt: null },
  { id: "folder-sheets", parentId: "folder-ads", kind: "folder", name: "表格", mimeType: "", size: 0, modifiedAt: Date.now(), storageState: "local", sortOrder: 0, deletedAt: null },
  { id: "folder-ad-reports", parentId: "folder-ads", kind: "folder", name: "报告", mimeType: "", size: 0, modifiedAt: Date.now(), storageState: "local", sortOrder: 1, deletedAt: null },
];

export function formatFileSize(bytes: number) {
  if (!bytes) return "—";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index > 1 ? 1 : 0)} ${units[index]}`;
}

export function fileTypeLabel(entry: FileEntry) {
  if (entry.kind === "folder") return "文件夹";
  if (entry.internalType === "document") return "在线文档";
  if (entry.internalType === "spreadsheet") return "在线表格";
  if (entry.internalType === "text") return "TXT";
  const ext = entry.name.split(".").pop()?.toUpperCase();
  return ext && ext !== entry.name.toUpperCase() ? ext : "文件";
}
