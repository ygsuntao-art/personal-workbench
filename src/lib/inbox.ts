export type InboxItemType = "text" | "link" | "image" | "file";
export type InboxItemStatus = "pending" | "organized";
export type InboxDestination = "task" | "knowledge" | "files";

export type InboxItem = {
  id: string;
  type: InboxItemType;
  content: string;
  fileName?: string;
  mimeType?: string;
  size?: number;
  blob?: Blob;
  relativePath?: string;
  createdAt: number;
  updatedAt: number;
  status: InboxItemStatus;
  organizedTo?: InboxDestination;
  organizedAt?: number;
};

export const INBOX_MAX_FILE_SIZE = 20 * 1024 * 1024;

export function detectInboxType(value: string): InboxItemType {
  return /^https?:\/\/\S+$/i.test(value.trim()) ? "link" : "text";
}

export function inboxTitle(item: InboxItem) {
  if (item.type === "image" || item.type === "file") return item.fileName || "未命名文件";
  return item.content.trim().split(/\r?\n/)[0].slice(0, 100) || "未命名内容";
}
