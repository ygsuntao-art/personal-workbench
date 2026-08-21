"use client";

import { useEffect, useMemo, useState } from "react";
import { initialFileEntries, MAX_TEST_FILE_SIZE, type FileEntry, type InternalFileType } from "@/lib/file-library";
import { emptyDocument } from "@/lib/knowledge-base";
import { loadFileEntries, saveFileEntries } from "@/lib/file-library-store";
import type { DroppedEntry } from "@/lib/desktop-drop";
import { loadFileManifestFromOss } from "@/lib/oss-client";

export function useFileLibrary() {
  const [entries, setEntries] = useState<FileEntry[]>(initialFileEntries);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");

  const mergeEntries = (localEntries: FileEntry[], cloudEntries: FileEntry[]) => {
    const merged = new Map<string, FileEntry>();
    cloudEntries.forEach((entry) => merged.set(entry.id, entry.kind === "file" && !entry.blob ? { ...entry, storageState: entry.cloudObjectKey ? "cloud" : entry.storageState } : entry));
    localEntries.forEach((entry) => {
      const cloud = merged.get(entry.id);
      if (!cloud || (entry.modifiedAt ?? 0) >= (cloud.modifiedAt ?? 0)) merged.set(entry.id, entry);
    });
    return [...merged.values()];
  };

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      try {
        const stored = await loadFileEntries();
        let nextEntries = stored.length ? stored : initialFileEntries;
        try {
          const status = await fetch("/api/storage/oss/status", { cache: "no-store" }).then((response) => response.json()) as { configured?: boolean };
          if (status.configured) {
            const cloudEntries = await loadFileManifestFromOss();
            if (cloudEntries.length) nextEntries = mergeEntries(nextEntries, cloudEntries);
          }
        } catch {
          // Local cache remains usable when cloud index cannot be reached.
        }
        setEntries(nextEntries);
      } catch {
        setError("浏览器无法打开本地测试文件库，请检查 IndexedDB 权限。");
      } finally {
        setReady(true);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!ready) return;
    saveFileEntries(entries).catch(() => setError("文件库保存失败，请稍后重试。"));
  }, [entries, ready]);

  const activeEntries = useMemo(() => entries.filter((entry) => !entry.deletedAt), [entries]);
  const folders = useMemo(() => activeEntries.filter((entry) => entry.kind === "folder"), [activeEntries]);

  const createFolder = (parentId: string | null, name: string) => {
    const cleanName = name.trim();
    if (!cleanName) return "请输入文件夹名称";
    if (activeEntries.some((entry) => entry.parentId === parentId && entry.name.toLowerCase() === cleanName.toLowerCase())) return "当前目录已存在同名项目";
    setEntries((current) => [...current, { id: crypto.randomUUID(), parentId, kind: "folder", name: cleanName, mimeType: "", size: 0, modifiedAt: Date.now(), storageState: "local", sortOrder: current.filter((entry) => entry.parentId === parentId).length, deletedAt: null }]);
    return "";
  };

  const createInternalFile = (parentId: string | null, internalType: InternalFileType) => {
    const baseName = internalType === "document" ? "无标题文档" : internalType === "spreadsheet" ? "无标题表格" : "新建文本文档.txt";
    let name = baseName;
    let index = 1;
    while (activeEntries.some((entry) => entry.parentId === parentId && entry.name.toLowerCase() === name.toLowerCase())) {
      const dot = baseName.lastIndexOf(".");
      name = dot > 0 ? `${baseName.slice(0, dot)} (${index})${baseName.slice(dot)}` : `${baseName} (${index})`;
      index += 1;
    }
    const now = Date.now();
    const entry: FileEntry = { id: crypto.randomUUID(), parentId, kind: "file", name, mimeType: internalType === "text" ? "text/plain" : `application/x-workbench-${internalType}`, size: 0, modifiedAt: now, storageState: "local", sortOrder: activeEntries.filter((candidate) => candidate.parentId === parentId).length, deletedAt: null, internalType, ...(internalType === "document" ? { contentJson: emptyDocument, plainText: "" } : {}), ...(internalType === "spreadsheet" ? { workbookData: undefined } : {}), ...(internalType === "text" ? { plainText: "" } : {}) };
    setEntries((current) => [...current, entry]);
    return entry;
  };

  const updateEntry = (id: string, patch: Partial<FileEntry>) => setEntries((current) => current.map((entry) => {
    if (entry.id !== id) return entry;
    const next = { ...entry, ...patch, modifiedAt: Date.now() };
    const cloudFields = new Set(["storageState", "cloudSyncedAt", "cloudEtag", "cloudSha256", "cloudObjectKey", "originalCloudObjectKey", "size"]);
    const patchKeys = Object.keys(patch);
    const isCloudStatePatch = patchKeys.length > 0 && patchKeys.every((key) => cloudFields.has(key));
    if (entry.kind === "file" && !isCloudStatePatch) next.storageState = "local";
    return next;
  }));

  const duplicateEntry = (id: string) => {
    const source = activeEntries.find((entry) => entry.id === id);
    if (!source) return null;
    const dot = source.kind === "file" ? source.name.lastIndexOf(".") : -1;
    const stem = dot > 0 ? source.name.slice(0, dot) : source.name;
    const extension = dot > 0 ? source.name.slice(dot) : "";
    let index = 1;
    let name = `${stem} (${index})${extension}`;
    while (activeEntries.some((entry) => entry.parentId === source.parentId && entry.name.toLowerCase() === name.toLowerCase())) { index += 1; name = `${stem} (${index})${extension}`; }
    const copy: FileEntry = { ...source, id: crypto.randomUUID(), name, modifiedAt: Date.now(), sortOrder: activeEntries.filter((entry) => entry.parentId === source.parentId).length, deletedAt: null };
    setEntries((current) => [...current, copy]);
    return copy;
  };

  const uploadFiles = (parentId: string | null, files: File[]) => {
    return importDroppedEntries(parentId, files.map((file) => ({ kind: "file", relativePath: file.name, file })));
  };

  const importDroppedEntries = (parentId: string | null, dropped: DroppedEntry[]) => {
    const files = dropped.filter((entry): entry is Extract<DroppedEntry, { kind: "file" }> => entry.kind === "file");
    const skipped = files.filter(({ file }) => file.size > MAX_TEST_FILE_SIZE).length;
    const acceptedPaths = new Set(files.filter(({ file }) => file.size <= MAX_TEST_FILE_SIZE).map((entry) => entry.relativePath));
    const addedFiles = files.length - skipped;
    const folderPaths = new Set(dropped.filter((entry) => entry.kind === "folder").map((entry) => entry.relativePath));
    files.forEach(({ relativePath }) => {
      const parts = relativePath.split("/").filter(Boolean);
      parts.pop();
      while (parts.length) { folderPaths.add(parts.join("/")); parts.pop(); }
    });
    const addedFolders = folderPaths.size;

    setEntries((current) => {
      const next = [...current];
      const folderIds = new Map<string, string>();
      const uniqueName = (wanted: string, targetParentId: string | null, kind: "file" | "folder") => {
        if (!next.some((entry) => !entry.deletedAt && entry.parentId === targetParentId && entry.name.toLowerCase() === wanted.toLowerCase())) return wanted;
        const dot = kind === "file" ? wanted.lastIndexOf(".") : -1;
        const stem = dot > 0 ? wanted.slice(0, dot) : wanted;
        const extension = dot > 0 ? wanted.slice(dot) : "";
        let index = 1;
        while (next.some((entry) => !entry.deletedAt && entry.parentId === targetParentId && entry.name.toLowerCase() === `${stem} (${index})${extension}`.toLowerCase())) index += 1;
        return `${stem} (${index})${extension}`;
      };
      const ensureFolder = (path: string) => {
        if (folderIds.has(path)) return folderIds.get(path)!;
        const parts = path.split("/").filter(Boolean);
        const ownName = parts.pop();
        if (!ownName) return parentId;
        const parentPath = parts.join("/");
        const targetParentId = parentPath ? ensureFolder(parentPath) : parentId;
        const name = uniqueName(ownName, targetParentId, "folder");
        const id = crypto.randomUUID();
        next.push({ id, parentId: targetParentId, kind: "folder", name, mimeType: "", size: 0, modifiedAt: Date.now(), storageState: "local", sortOrder: next.filter((entry) => entry.parentId === targetParentId).length, deletedAt: null });
        folderIds.set(path, id);
        return id;
      };

      const explicitFolders = dropped.filter((entry): entry is Extract<DroppedEntry, { kind: "folder" }> => entry.kind === "folder").sort((a, b) => a.relativePath.split("/").length - b.relativePath.split("/").length);
      explicitFolders.forEach((entry) => ensureFolder(entry.relativePath));
      files.forEach(({ file, relativePath }) => {
        if (!acceptedPaths.has(relativePath)) return;
        const parts = relativePath.split("/").filter(Boolean);
        const rawName = parts.pop() || file.name;
        const targetParentId = parts.length ? ensureFolder(parts.join("/")) : parentId;
        const name = uniqueName(rawName, targetParentId, "file");
        next.push({ id: crypto.randomUUID(), parentId: targetParentId, kind: "file", name, mimeType: file.type || "application/octet-stream", size: file.size, modifiedAt: file.lastModified || Date.now(), storageState: "local", sortOrder: next.filter((entry) => entry.parentId === targetParentId).length, deletedAt: null, blob: file });
      });
      return next;
    });
    return { addedFiles, addedFolders, skipped };
  };

  const renameEntry = (id: string, name: string) => {
    const cleanName = name.trim();
    const target = entries.find((entry) => entry.id === id);
    if (!target || !cleanName) return "名称不能为空";
    if (activeEntries.some((entry) => entry.id !== id && entry.parentId === target.parentId && entry.name.toLowerCase() === cleanName.toLowerCase())) return "当前目录已存在同名项目";
    setEntries((current) => current.map((entry) => entry.id === id ? { ...entry, name: cleanName, modifiedAt: Date.now(), ...(entry.kind === "file" ? { storageState: "local" as const } : {}) } : entry));
    return "";
  };

  const moveEntry = (id: string, parentId: string | null) => {
    if (id === parentId) return;
    const descendants = new Set<string>();
    const collect = (folderId: string) => activeEntries.filter((entry) => entry.parentId === folderId).forEach((entry) => { descendants.add(entry.id); if (entry.kind === "folder") collect(entry.id); });
    collect(id);
    if (parentId && descendants.has(parentId)) return;
    setEntries((current) => current.map((entry) => entry.id === id ? { ...entry, parentId, modifiedAt: Date.now(), ...(entry.kind === "file" ? { storageState: "local" as const } : {}) } : entry));
  };

  const subtreeIds = (source: FileEntry[], rootIds: Iterable<string>) => {
    const ids = new Set(rootIds);
    let changed = true;
    while (changed) { changed = false; source.forEach((entry) => { if (entry.parentId && ids.has(entry.parentId) && !ids.has(entry.id)) { ids.add(entry.id); changed = true; } }); }
    return ids;
  };
  const trashEntries = (ids: string[]) => setEntries((current) => { const targets = subtreeIds(current, ids); const now = Date.now(); return current.map((entry) => targets.has(entry.id) ? { ...entry, originalParentId: entry.parentId, deletedAt: now } : entry); });
  const restoreEntries = (ids: string[]) => setEntries((current) => { const targets = subtreeIds(current, ids); return current.map((entry) => targets.has(entry.id) ? { ...entry, parentId: entry.originalParentId ?? entry.parentId, deletedAt: null } : entry); });
  const deleteEntriesForever = (ids: string[]) => setEntries((current) => { const targets = subtreeIds(current, ids); return current.filter((entry) => !targets.has(entry.id)); });
  const restoreAllTrash = () => setEntries((current) => current.map((entry) => entry.deletedAt ? { ...entry, parentId: entry.originalParentId ?? entry.parentId, deletedAt: null } : entry));
  const emptyTrash = () => setEntries((current) => { const targets = subtreeIds(current, current.filter((entry) => entry.deletedAt).map((entry) => entry.id)); return current.filter((entry) => !targets.has(entry.id)); });
  const trashEntry = (id: string) => trashEntries([id]);
  const restoreEntry = (id: string) => restoreEntries([id]);
  const deleteForever = (id: string) => deleteEntriesForever([id]);

  return { entries, activeEntries, folders, ready, error, setError, createFolder, createInternalFile, updateEntry, duplicateEntry, uploadFiles, importDroppedEntries, renameEntry, moveEntry, trashEntry, trashEntries, restoreEntry, restoreEntries, deleteForever, deleteEntriesForever, restoreAllTrash, emptyTrash };
}

export type FileLibraryStore = ReturnType<typeof useFileLibrary>;
