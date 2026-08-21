import type { JSONContent } from "@tiptap/react";

export type KnowledgeNodeType = "folder" | "document";

export interface KnowledgeNode {
  id: string;
  parentId: string | null;
  type: KnowledgeNodeType;
  title: string;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
  originalParentId: string | null;
  contentJson?: JSONContent;
  plainText?: string;
  lastSavedAt?: number;
  description?: string;
  cover?: string;
  pinned?: boolean;
  isKnowledgeBase?: boolean;
  lastOpenedAt?: number;
  documentKind?: "document" | "table";
  tableData?: SpreadsheetData;
  workbookData?: Record<string, unknown>;
}

export interface SpreadsheetData {
  rows: number;
  columns: number;
  cells: Record<string, string>;
}

export const emptySpreadsheet = (): SpreadsheetData => ({
  rows: 20,
  columns: 8,
  cells: { A1: "字段 1", B1: "字段 2", C1: "字段 3", D1: "字段 4" },
});

export const emptyDocument: JSONContent = { type: "doc", content: [{ type: "paragraph" }] };

export function createKnowledgeNode(type: KnowledgeNodeType, parentId: string | null, sortOrder: number): KnowledgeNode {
  const now = Date.now();
  return {
    id: crypto.randomUUID(), parentId, type,
    title: type === "folder" ? "新建文件夹" : "无标题文档",
    sortOrder, createdAt: now, updatedAt: now, deletedAt: null, originalParentId: null,
    ...(type === "document" ? { contentJson: emptyDocument, plainText: "", lastSavedAt: now } : {}),
  };
}

export function descendants(nodes: KnowledgeNode[], id: string): Set<string> {
  const result = new Set<string>();
  const visit = (parentId: string) => nodes.filter((node) => node.parentId === parentId).forEach((node) => { result.add(node.id); visit(node.id); });
  visit(id);
  return result;
}
