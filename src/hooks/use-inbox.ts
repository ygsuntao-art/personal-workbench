"use client";

import { useEffect, useMemo, useState } from "react";
import { detectInboxType, INBOX_MAX_FILE_SIZE, type InboxDestination, type InboxItem } from "@/lib/inbox";
import { loadInboxItems, saveInboxItems } from "@/lib/inbox-store";
import type { DroppedEntry } from "@/lib/desktop-drop";

export function useInbox() {
  const [items, setItems] = useState<InboxItem[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      try {
        setItems(await loadInboxItems());
      } catch {
        setError("收集箱初始化失败，请检查浏览器存储权限。");
      } finally {
        setReady(true);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!ready) return;
    saveInboxItems(items).catch(() => setError("收集箱保存失败，请稍后重试。"));
  }, [items, ready]);

  const pendingCount = useMemo(() => items.filter((item) => item.status === "pending").length, [items]);

  const collectText = (content: string) => {
    const cleanContent = content.trim();
    if (!cleanContent) return "请输入要收集的内容";
    const now = Date.now();
    setItems((current) => [{ id: crypto.randomUUID(), type: detectInboxType(cleanContent), content: cleanContent, createdAt: now, updatedAt: now, status: "pending" }, ...current]);
    return "";
  };

  const collectDroppedEntries = (entries: DroppedEntry[]) => {
    const files = entries.filter((entry): entry is Extract<DroppedEntry, { kind: "file" }> => entry.kind === "file");
    const accepted = files.filter(({ file }) => file.size <= INBOX_MAX_FILE_SIZE);
    const skipped = files.length - accepted.length;
    const now = Date.now();
    setItems((current) => [...accepted.map(({ file, relativePath }, index): InboxItem => ({
      id: crypto.randomUUID(), type: file.type.startsWith("image/") ? "image" : "file", content: file.name, fileName: file.name,
      mimeType: file.type || "application/octet-stream", size: file.size, blob: file, relativePath, createdAt: now + index, updatedAt: now + index, status: "pending",
    })), ...current]);
    return { added: accepted.length, skipped };
  };

  const collectFiles = (files: File[]) => collectDroppedEntries(files.map((file) => ({ kind: "file", relativePath: file.name, file })));

  const updateItem = (id: string, content: string) => setItems((current) => current.map((item) => item.id === id ? { ...item, content: content.trim(), type: detectInboxType(content), updatedAt: Date.now() } : item));
  const removeItem = (id: string) => setItems((current) => current.filter((item) => item.id !== id));
  const markOrganized = (id: string, organizedTo: InboxDestination) => setItems((current) => current.map((item) => item.id === id ? { ...item, status: "organized", organizedTo, organizedAt: Date.now(), updatedAt: Date.now() } : item));
  const restoreItem = (id: string) => setItems((current) => current.map((item) => item.id === id ? { ...item, status: "pending", organizedTo: undefined, organizedAt: undefined, updatedAt: Date.now() } : item));

  return { items, ready, error, setError, pendingCount, collectText, collectFiles, collectDroppedEntries, updateItem, removeItem, markOrganized, restoreItem };
}

export type InboxStore = ReturnType<typeof useInbox>;
