"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArchiveRestore, ChevronDown, ChevronRight, CloudUpload, Copy, Download, File, FileArchive, FileImage, FilePlus2, FileSpreadsheet, FileText, FileType2, FileVideo, Folder, FolderOpen, FolderPlus, Grid2X2, HardDrive, Info, List, Maximize2, Minimize2, MoreHorizontal, MoveRight, PanelLeftClose, Plus, RefreshCw, Search, Table2, Trash2, Upload, X } from "lucide-react";
import { useFileLibrary } from "@/hooks/use-file-library";
import { fileTypeLabel, formatFileSize, type FileEntry } from "@/lib/file-library";
import { isExternalFileDrag, readDroppedEntries } from "@/lib/desktop-drop";
import { DocumentEditor, SpreadsheetEditor } from "@/components/knowledge-base-page";
import { emptySpreadsheet, type KnowledgeNode } from "@/lib/knowledge-base";
import { cloudObjectKeyForEntry, deleteObjectsFromOss, entryCloudObjectKeys, fetchEntryBlobFromOss, getSignedDownloadUrl, saveFileManifestToOss, uploadEntryToOss } from "@/lib/oss-client";

type ViewMode = "list" | "grid";
type SortKey = "name" | "modified" | "size" | "type";
type FileOpenMode = "normal" | "focus" | "fullscreen";
type TrashSource = "all" | "files" | "knowledge" | "inbox" | "tasks";

function textToDocument(text: string) {
  const lines = text.replace(/\r/g, "").split("\n");
  return {
    type: "doc",
    content: (lines.length ? lines : [""]).map((line) => line
      ? { type: "paragraph", content: [{ type: "text", text: line }] }
      : { type: "paragraph" }),
  };
}

function columnLabel(index: number) {
  let value = index + 1;
  let label = "";
  while (value > 0) { value -= 1; label = String.fromCharCode(65 + (value % 26)) + label; value = Math.floor(value / 26); }
  return label;
}

function rowsToSpreadsheet(rows: unknown[][]) {
  const cells: Record<string, string> = {};
  rows.forEach((row, rowIndex) => row.forEach((value, columnIndex) => {
    if (value !== null && value !== undefined && value !== "") cells[`${columnLabel(columnIndex)}${rowIndex + 1}`] = value instanceof Date ? value.toLocaleString("zh-CN") : String(value);
  }));
  return { rows: Math.max(20, rows.length), columns: Math.max(8, ...rows.map((row) => row.length), 0), cells };
}

function FileOpenModeButtons({ mode, onChange }: { mode: FileOpenMode; onChange: (mode: FileOpenMode) => void }) {
  return <div className="file-open-modes"><button className={mode === "normal" ? "active" : ""} onClick={() => onChange("normal")}><Minimize2 size={14}/>普通</button><button className={mode === "focus" ? "active" : ""} onClick={() => onChange("focus")}><PanelLeftClose size={14}/>专注</button><button className={mode === "fullscreen" ? "active" : ""} onClick={() => onChange("fullscreen")}><Maximize2 size={14}/>全屏</button></div>;
}

function useBlobUrl(blob?: Blob) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    if (!blob) return;
    const objectUrl = URL.createObjectURL(blob);
    const timer = window.setTimeout(() => setUrl(objectUrl), 0);
    return () => { window.clearTimeout(timer); URL.revokeObjectURL(objectUrl); };
  }, [blob]);
  return url;
}

function EntryIcon({ entry, size = 24 }: { entry: FileEntry; size?: number }) {
  if (entry.kind === "folder") return <Folder size={size} fill="#dfeaff" color="#377ff1" />;
  if (entry.internalType === "document") return <FileText size={size} color="#1769ff" />;
  if (entry.internalType === "spreadsheet") return <FileSpreadsheet size={size} color="#16a36a" />;
  if (entry.internalType === "text") return <FileType2 size={size} color="#667085" />;
  if (entry.mimeType.startsWith("image/")) return <FileImage size={size} color="#8b5cf6" />;
  if (entry.mimeType.startsWith("video/")) return <FileVideo size={size} color="#ef5da8" />;
  if (entry.name.match(/\.(xlsx?|csv)$/i)) return <FileSpreadsheet size={size} color="#16a36a" />;
  if (entry.name.match(/\.(zip|rar|7z)$/i)) return <FileArchive size={size} color="#d97706" />;
  if (entry.name.match(/\.(pdf|docx?|pptx?)$/i)) return <FileText size={size} color="#e34c4c" />;
  return <File size={size} color="#718096" />;
}

function FileThumbnail({ entry }: { entry: FileEntry }) {
  const url = useBlobUrl(entry.blob);
  if (!url || !entry.mimeType.startsWith("image/")) return <EntryIcon entry={entry} size={43} />;
  // Blob URLs are local-only and cannot use the Next.js image optimizer.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="" />;
}

function FolderTree({ entries, parentId, selectedId, expanded, onToggle, onSelect, onMove, externalTargetId, onExternalTarget, onExternalDrop, onContextMenu }: {
  entries: FileEntry[]; parentId: string | null; selectedId: string | null; expanded: Set<string>; onToggle: (id: string) => void; onSelect: (id: string | null) => void; onMove: (entryId: string, parentId: string | null) => void; externalTargetId: string | null | undefined; onExternalTarget: (id: string) => void; onExternalDrop: (event: React.DragEvent, id: string) => void; onContextMenu: (event: React.MouseEvent, entry: FileEntry) => void;
}) {
  return entries.filter((entry) => entry.kind === "folder" && entry.parentId === parentId && !entry.deletedAt).sort((a, b) => a.sortOrder - b.sortOrder).map((folder) => {
    const hasChildren = entries.some((entry) => entry.kind === "folder" && entry.parentId === folder.id && !entry.deletedAt);
    const isOpen = expanded.has(folder.id);
    return <div key={folder.id} className="folder-node">
      <div className={`folder-node-row ${selectedId === folder.id ? "selected" : ""} ${externalTargetId === folder.id ? "external-target" : ""}`} onContextMenu={(event) => onContextMenu(event, folder)}>
        <button className="tree-toggle" onClick={() => hasChildren && onToggle(folder.id)} aria-label={isOpen ? "收起目录" : "展开目录"}>{hasChildren ? isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} /> : <span />}</button>
        <button className="folder-select" onClick={() => onSelect(folder.id)} onDragEnter={(event) => { if (isExternalFileDrag(event.dataTransfer)) { event.preventDefault(); onExternalTarget(folder.id); } }} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); event.stopPropagation(); if (isExternalFileDrag(event.dataTransfer)) onExternalDrop(event, folder.id); else onMove(event.dataTransfer.getData("text/workbench-entry"), folder.id); }}>{isOpen ? <FolderOpen size={18} /> : <Folder size={18} />}<span>{folder.name}</span></button>
      </div>
      {isOpen && <div className="folder-children"><FolderTree entries={entries} parentId={folder.id} selectedId={selectedId} expanded={expanded} onToggle={onToggle} onSelect={onSelect} onMove={onMove} externalTargetId={externalTargetId} onExternalTarget={onExternalTarget} onExternalDrop={onExternalDrop} onContextMenu={onContextMenu} /></div>}
    </div>;
  });
}

function InternalFileEditor({ entry, onClose, onUpdate, onSync, setError }: { entry: FileEntry; onClose: () => void; onUpdate: (patch: Partial<FileEntry>) => void; onSync: (patch: Partial<FileEntry>) => Promise<void>; setError: (message: string) => void }) {
  const [mode, setMode] = useState<FileOpenMode>("fullscreen");
  const [cloudStatus, setCloudStatus] = useState<"idle" | "syncing" | "synced" | "error">("idle");
  const updateRef = useRef(onUpdate);
  const syncRef = useRef(onSync);
  useEffect(() => { updateRef.current = onUpdate; }, [onUpdate]);
  useEffect(() => { syncRef.current = onSync; }, [onSync]);
  const commitPatch = async (patch: Partial<FileEntry>) => {
    updateRef.current(patch);
    setCloudStatus("syncing");
    try {
      await syncRef.current(patch);
      setCloudStatus("synced");
    } catch (error) {
      setCloudStatus("error");
      setError(error instanceof Error ? error.message : "OSS 同步失败");
    }
  };
  const node: KnowledgeNode = { id: entry.id, parentId: entry.parentId, type: "document", title: entry.name, sortOrder: entry.sortOrder, createdAt: entry.modifiedAt, updatedAt: entry.modifiedAt, deletedAt: entry.deletedAt, originalParentId: entry.originalParentId ?? null, contentJson: entry.contentJson ?? (entry.internalType === "text" ? textToDocument(entry.plainText ?? "") : undefined), plainText: entry.plainText, documentKind: entry.internalType === "spreadsheet" ? "table" : "document", tableData: entry.internalType === "spreadsheet" ? entry.tableData ?? emptySpreadsheet() : undefined, workbookData: entry.workbookData };
  return <div className={`internal-editor-backdrop mode-${mode}`}><div className={`internal-editor-shell ${entry.internalType}`}><div className="internal-editor-top"><button onClick={onClose}><ChevronRight size={18}/>返回文件库</button><FileOpenModeButtons mode={mode} onChange={setMode}/><span>{cloudStatus === "syncing" ? "正在同步 OSS…" : cloudStatus === "synced" ? "OSS 已回读验证" : cloudStatus === "error" ? "OSS 同步失败" : entry.internalType === "document" ? "内部文档" : entry.internalType === "spreadsheet" ? "内部表格" : "富文本 TXT"}</span><button onClick={onClose}><X size={18}/></button></div>{entry.internalType === "spreadsheet" ? <SpreadsheetEditor node={node} onUpdate={async (_id, patch) => commitPatch({ name: patch.title?.trim() || entry.name, workbookData: patch.workbookData })}/> : <DocumentEditor node={node} setError={setError} statusLabels={{ saving: "正在保存并同步 OSS…", saved: "已保存并验证 OSS", error: "OSS 同步失败" }} onSave={async (_id, title, json, plainText) => commitPatch({ name: title.trim() || (entry.internalType === "text" ? "新建文本文档.txt" : "无标题文档"), contentJson: json, plainText, size: new Blob([plainText]).size })}/>}</div></div>;
}

function Preview({ entry, onClose, onEdit }: { entry: FileEntry; onClose: () => void; onEdit: () => void }) {
  const url = useBlobUrl(entry.blob);
  const editStarted = useRef(false);
  const [mode, setMode] = useState<FileOpenMode>("fullscreen");
  const [textContent, setTextContent] = useState("");
  const [zipEntries, setZipEntries] = useState<string[]>([]);
  const [readError, setReadError] = useState("");
  const extension = entry.name.split(".").pop()?.toLowerCase() ?? "";
  const isText = entry.mimeType.startsWith("text/") || ["md", "markdown", "json", "js", "ts", "tsx", "jsx", "css", "html", "xml", "log", "yaml", "yml"].includes(extension);
  const isCsv = extension === "csv";
  const isZip = extension === "zip";
  const isWord = extension === "doc" || extension === "docx";
  const isEditableUpload = ["doc", "docx", "xls", "xlsx", "csv", "txt", "md", "markdown"].includes(extension);
  useEffect(() => {
    if (!isEditableUpload || editStarted.current) return;
    editStarted.current = true;
    onEdit();
  }, [isEditableUpload, onEdit]);
  useEffect(() => {
    const blob = entry.blob;
    if (!blob || (!isText && !isCsv && !isZip && !isWord)) return;
    let cancelled = false;
    void (async () => {
      try {
        if (isWord) {
          const form = new FormData(); form.append("file", blob, entry.name);
          const response = await fetch("/api/preview/word", { method: "POST", body: form });
          const result = await response.json() as { text?: string; error?: string };
          if (!response.ok) throw new Error(result.error || "Word文档解析失败");
          if (!cancelled) setTextContent(result.text || "文档中没有可提取的文字内容");
        } else if (isZip) {
          const JSZip = (await import("jszip")).default;
          const zip = await JSZip.loadAsync(blob);
          if (!cancelled) setZipEntries(Object.keys(zip.files).slice(0, 1000));
        } else {
          let content = await blob.text();
          if (extension === "json") { try { content = JSON.stringify(JSON.parse(content), null, 2); } catch {} }
          if (!cancelled) setTextContent(content);
        }
      } catch (error) { if (!cancelled) setReadError(error instanceof Error ? error.message : "文件内容读取失败，可以下载后使用本地应用打开。"); }
    })();
    return () => { cancelled = true; };
  }, [entry.blob, entry.name, extension, isCsv, isText, isWord, isZip]);
  const csvRows = isCsv ? textContent.split(/\r?\n/).filter(Boolean).slice(0, 200).map((line) => line.split(",")) : [];

  return <div className={`file-preview-backdrop mode-${mode}`} onMouseDown={onClose}>
    <div className="file-preview" onMouseDown={(event) => event.stopPropagation()}>
      <div className="preview-head"><div><EntryIcon entry={entry} /><strong>{entry.name}</strong></div><FileOpenModeButtons mode={mode} onChange={setMode}/><button onClick={onClose} aria-label="关闭预览"><X size={20} /></button></div>
      <div className="preview-body">
        {/* Blob URLs are local-only and cannot use the Next.js image optimizer. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {url && entry.mimeType.startsWith("image/") && <img src={url} alt={entry.name} />}
        {url && entry.mimeType.startsWith("video/") && <video src={url} controls />}
        {url && entry.mimeType.startsWith("audio/") && <div className="audio-preview"><EntryIcon entry={entry} size={58}/><h3>{entry.name}</h3><audio src={url} controls/></div>}
        {url && entry.mimeType === "application/pdf" && <iframe src={url} title={entry.name} />}
        {isCsv && <div className="csv-preview">{csvRows.length ? <table><tbody>{csvRows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>)}</tbody></table> : <p>文件内容为空</p>}</div>}
        {isText && !isCsv && <pre className="text-preview">{textContent || "文件内容为空"}</pre>}
        {isWord && !readError && <div className="word-preview"><div><strong>Word文字预览</strong><span>Web版保留文字内容；原排版请下载后用WPS或Word查看。</span></div><pre>{textContent || "正在读取Word文档…"}</pre></div>}
        {isZip && <div className="zip-preview"><h3>压缩包目录 · {zipEntries.length}项</h3>{zipEntries.map((name) => <div key={name}>{name.endsWith("/") ? <Folder size={15}/> : <File size={15}/>}<span>{name}</span></div>)}{!zipEntries.length && !readError && <p>压缩包是空的</p>}</div>}
        {readError && <div className="generic-preview"><EntryIcon entry={entry} size={58}/><p>{readError}</p></div>}
        {(!url || (!entry.mimeType.startsWith("image/") && !entry.mimeType.startsWith("video/") && !entry.mimeType.startsWith("audio/") && entry.mimeType !== "application/pdf")) && !isText && !isCsv && !isZip && !isWord && <div className="generic-preview"><EntryIcon entry={entry} size={58} /><h3>{entry.name}</h3><p>{fileTypeLabel(entry)} · {formatFileSize(entry.size)}</p><p>{entry.name.match(/\.(xlsx?|pptx?)$/i) ? "Web版暂不直接编辑此Office文件，请下载后使用WPS或系统应用打开。" : "此类型暂不支持在线预览，可以下载后打开。"}</p></div>}
      </div>
      {url && <a className="preview-download" href={url} download={entry.name}><Download size={17} /> 下载文件</a>}
    </div>
  </div>;
}

export function FileLibraryPage({ initialShowTrash = false }: { initialShowTrash?: boolean }) {
  const store = useFileLibrary();
  const inputRef = useRef<HTMLInputElement>(null);
  const [folderId, setFolderId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set(["folder-live", "folder-assets", "folder-ads"]));
  const [view, setView] = useState<ViewMode>("list");
  const [sort, setSort] = useState<SortKey>("name");
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [newMenuOpen, setNewMenuOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; entryId: string | null; targetFolderId: string | null; trashRoot?: boolean } | null>(null);
  const [moving, setMoving] = useState<FileEntry | null>(null);
  const [preview, setPreview] = useState<FileEntry | null>(null);
  const [internalEditorId, setInternalEditorId] = useState<string | null>(null);
  const [showTrash, setShowTrash] = useState(initialShowTrash);
  const [trashSource, setTrashSource] = useState<TrashSource>("all");
  const [trashBulkMode, setTrashBulkMode] = useState(false);
  const [selectedTrashIds, setSelectedTrashIds] = useState<Set<string>>(new Set());
  const [externalDragging, setExternalDragging] = useState(false);
  const [dropTargetId, setDropTargetId] = useState<string | null | undefined>(undefined);
  const [dropNotice, setDropNotice] = useState("");
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [ossConfigured, setOssConfigured] = useState(false);
  const [cloudSyncing, setCloudSyncing] = useState(false);
  const dragDepth = useRef(0);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const autoSyncingRef = useRef(new Set<string>());
  const autoRetryAtRef = useRef(new Map<string, number>());
  const syncFilesToCloudRef = useRef<((targets?: FileEntry[]) => Promise<void>) | null>(null);
  const manifestTimerRef = useRef<number | null>(null);

  useEffect(() => {
    fetch("/api/storage/oss/status").then((response) => response.json()).then((data: { configured?: boolean }) => setOssConfigured(Boolean(data.configured))).catch(() => setOssConfigured(false));
  }, []);

  const trashRootEntries = useMemo(() => store.entries.filter((entry) => entry.deletedAt && !store.entries.some((parent) => parent.id === entry.parentId && parent.deletedAt)), [store.entries]);
  const trashCounts = useMemo(() => ({ all: trashRootEntries.length, files: trashRootEntries.length, knowledge: 0, inbox: 0, tasks: 0 }), [trashRootEntries.length]);
  const trashSources: Array<{ key: TrashSource; label: string; count: number }> = [
    { key: "all", label: "全部", count: trashCounts.all },
    { key: "files", label: "文件库", count: trashCounts.files },
    { key: "knowledge", label: "知识库", count: trashCounts.knowledge },
    { key: "inbox", label: "收集箱", count: trashCounts.inbox },
    { key: "tasks", label: "今日任务", count: trashCounts.tasks },
  ];

  const currentEntries = useMemo(() => {
    const source = showTrash ? (trashSource === "all" || trashSource === "files" ? trashRootEntries : []) : store.activeEntries.filter((entry) => entry.parentId === folderId);
    return source.filter((entry) => entry.name.toLowerCase().includes(query.toLowerCase())).sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "folder" ? -1 : 1;
      if (sort === "modified") return b.modifiedAt - a.modifiedAt;
      if (sort === "size") return b.size - a.size;
      if (sort === "type") return fileTypeLabel(a).localeCompare(fileTypeLabel(b), "zh-CN");
      return a.name.localeCompare(b.name, "zh-CN");
    });
  }, [folderId, query, showTrash, sort, store.activeEntries, trashRootEntries, trashSource]);

  const breadcrumbs = useMemo(() => {
    const path: FileEntry[] = [];
    let id = folderId;
    while (id) { const folder = store.activeEntries.find((entry) => entry.id === id); if (!folder) break; path.unshift(folder); id = folder.parentId; }
    return path;
  }, [folderId, store.activeEntries]);

  const openEntry = (entry: FileEntry) => {
    if (entry.kind === "folder") { setFolderId(entry.id); setShowTrash(false); setExpanded((current) => new Set(current).add(entry.id)); return; }
    if (entry.internalType) { setInternalEditorId(entry.id); return; }
    if (!entry.blob && entry.cloudObjectKey) {
      setOpeningId(entry.id);
      void (async () => {
        try {
          const blob = await fetchEntryBlobFromOss(entry);
          store.updateEntry(entry.id, { blob, storageState: "synced" });
          openEntry({ ...entry, blob, storageState: "synced" });
        } catch (error) {
          store.setError(error instanceof Error ? error.message : "从 OSS 打开文件失败");
        } finally { setOpeningId(null); }
      })();
      return;
    }
    const extension = entry.name.split(".").pop()?.toLowerCase() ?? "";
    const sourceBlob = entry.blob;
    if (sourceBlob && ["doc", "docx", "xls", "xlsx", "csv", "txt", "md", "markdown"].includes(extension)) {
      setOpeningId(entry.id);
      void (async () => {
        try {
          if (extension === "doc" || extension === "docx") {
            const form = new FormData(); form.append("file", sourceBlob, entry.name);
            const response = await fetch("/api/preview/word", { method: "POST", body: form });
            const result = await response.json() as { text?: string; error?: string };
            if (!response.ok) throw new Error(result.error || "Word 文档解析失败");
            const plainText = result.text ?? "";
            store.updateEntry(entry.id, { internalType: "document", originalCloudObjectKey: entry.originalCloudObjectKey ?? entry.cloudObjectKey, originalMimeType: entry.originalMimeType ?? entry.mimeType, originalSize: entry.originalSize ?? entry.size, plainText, contentJson: textToDocument(plainText) });
          } else if (["xls", "xlsx", "csv"].includes(extension)) {
            const XLSX = await import("@e965/xlsx");
            const workbook = XLSX.read(await sourceBlob.arrayBuffer(), { type: "array", cellDates: true });
            const firstSheetName = workbook.SheetNames[0];
            if (!firstSheetName) throw new Error("表格中没有可读取的工作表");
            const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[firstSheetName], { header: 1, raw: false, defval: "" });
            store.updateEntry(entry.id, { internalType: "spreadsheet", originalCloudObjectKey: entry.originalCloudObjectKey ?? entry.cloudObjectKey, originalMimeType: entry.originalMimeType ?? entry.mimeType, originalSize: entry.originalSize ?? entry.size, tableData: rowsToSpreadsheet(rows) });
          } else {
            const plainText = await sourceBlob.text();
            store.updateEntry(entry.id, { internalType: "text", originalCloudObjectKey: entry.originalCloudObjectKey ?? entry.cloudObjectKey, originalMimeType: entry.originalMimeType ?? entry.mimeType, originalSize: entry.originalSize ?? entry.size, plainText });
          }
          setInternalEditorId(entry.id);
          store.setError("");
        } catch (error) {
          store.setError(error instanceof Error ? error.message : "文件转换失败，可下载后使用本地应用打开");
        } finally { setOpeningId(null); }
      })();
      return;
    }
    setPreview(entry);
  };
  const createFolder = () => { const message = store.createFolder(folderId, newFolderName); if (message) store.setError(message); else { setNewFolderName(""); setCreating(false); } };
  const commitRename = (entry: FileEntry) => { const message = store.renameEntry(entry.id, editingName); if (message) store.setError(message); else setEditingId(null); };
  const download = (entry: FileEntry) => { if (!entry.blob) return; const url = URL.createObjectURL(entry.blob); const link = document.createElement("a"); link.href = url; link.download = entry.name; link.click(); URL.revokeObjectURL(url); };
  const createAt = (type: "folder" | "document" | "spreadsheet" | "text", targetId: string | null) => {
    setContextMenu(null); setNewMenuOpen(false);
    if (type === "folder") { setFolderId(targetId); setShowTrash(false); setCreating(true); return; }
    const entry = store.createInternalFile(targetId, type);
    setFolderId(targetId); setShowTrash(false); setInternalEditorId(entry.id);
  };
  const openContextMenu = (event: React.MouseEvent, entry: FileEntry | null, targetFolderId = folderId) => {
    event.preventDefault(); event.stopPropagation(); setNewMenuOpen(false);
    setContextMenu({ x: Math.max(8, Math.min(event.clientX, window.innerWidth - 224)), y: Math.min(event.clientY, window.innerHeight - 430), entryId: entry?.id ?? null, targetFolderId: entry?.kind === "folder" ? entry.id : targetFolderId });
  };
  const openButtonMenu = (event: React.MouseEvent, entry: FileEntry) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setContextMenu({ x: Math.max(8, Math.min(rect.right - 210, window.innerWidth - 224)), y: Math.min(rect.bottom + 5, window.innerHeight - 430), entryId: entry.id, targetFolderId: entry.kind === "folder" ? entry.id : folderId });
  };
  const confirmEmptyTrash = () => {
    const count = store.entries.filter((entry) => entry.deletedAt).length;
    if (!count) return;
    if (window.confirm(`永久删除回收站中的 ${count} 个项目？此操作不可恢复。`)) {
      const keys = store.entries.filter((entry) => entry.deletedAt).flatMap(entryCloudObjectKeys);
      void deleteObjectsFromOss(keys).catch((error) => store.setError(error instanceof Error ? error.message : "OSS 删除失败"));
      store.emptyTrash(); setSelectedTrashIds(new Set()); setTrashBulkMode(false);
    }
  };
  const confirmDeleteSelected = () => {
    const ids = [...selectedTrashIds];
    if (ids.length && window.confirm(`永久删除选中的 ${ids.length} 个项目？此操作不可恢复。`)) {
      const targets = new Set(ids);
      let changed = true;
      while (changed) { changed = false; store.entries.forEach((entry) => { if (entry.parentId && targets.has(entry.parentId) && !targets.has(entry.id)) { targets.add(entry.id); changed = true; } }); }
      const keys = store.entries.filter((entry) => targets.has(entry.id)).flatMap(entryCloudObjectKeys);
      void deleteObjectsFromOss(keys).catch((error) => store.setError(error instanceof Error ? error.message : "OSS 删除失败"));
      store.deleteEntriesForever(ids); setSelectedTrashIds(new Set());
    }
  };
  const deleteForeverWithCloud = (entry: FileEntry) => {
    if (!window.confirm(`永久删除“${entry.name}”？此操作不可恢复。`)) return;
    const targets = new Set([entry.id]);
    let changed = true;
    while (changed) { changed = false; store.entries.forEach((candidate) => { if (candidate.parentId && targets.has(candidate.parentId) && !targets.has(candidate.id)) { targets.add(candidate.id); changed = true; } }); }
    const keys = store.entries.filter((candidate) => targets.has(candidate.id)).flatMap(entryCloudObjectKeys);
    void deleteObjectsFromOss(keys).catch((error) => store.setError(error instanceof Error ? error.message : "OSS 删除失败"));
    store.deleteForever(entry.id);
  };
  const copyToClipboard = async (text: string, success: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setDropNotice(success);
    } catch {
      window.prompt("请复制下面内容", text);
    }
  };
  const copyOssPath = async (entry: FileEntry) => {
    if (!entry.cloudObjectKey) { store.setError("这个文件还没有同步到 OSS"); return; }
    await copyToClipboard(entry.cloudObjectKey, "已复制 OSS 路径");
  };
  const copyOssDownloadLink = async (entry: FileEntry) => {
    if (!entry.cloudObjectKey) { store.setError("这个文件还没有同步到 OSS"); return; }
    try {
      const url = await getSignedDownloadUrl(entry.cloudObjectKey);
      await copyToClipboard(url, "已复制临时下载链接，15 分钟内有效");
    } catch (error) {
      store.setError(error instanceof Error ? error.message : "生成 OSS 下载链接失败");
    }
  };

  useEffect(() => {
    if (!contextMenu && !newMenuOpen) return;
    const close = (event: PointerEvent) => { if (!(event.target as Element).closest?.(".file-context-menu,.file-new-menu")) { setContextMenu(null); setNewMenuOpen(false); } };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { setContextMenu(null); setNewMenuOpen(false); } };
    const scroll = () => { setContextMenu(null); setNewMenuOpen(false); };
    document.addEventListener("pointerdown", close); document.addEventListener("keydown", escape); window.addEventListener("scroll", scroll, true);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", escape); window.removeEventListener("scroll", scroll, true); };
  }, [contextMenu, newMenuOpen]);

  useLayoutEffect(() => {
    if (!contextMenu || !contextMenuRef.current) return;
    const rect = contextMenuRef.current.getBoundingClientRect();
    const nextX = rect.right > window.innerWidth - 8 ? Math.max(8, contextMenu.x - (rect.right - window.innerWidth + 8)) : contextMenu.x;
    const nextY = rect.bottom > window.innerHeight - 8 ? Math.max(8, contextMenu.y - (rect.bottom - window.innerHeight + 8)) : contextMenu.y;
    if (nextX !== contextMenu.x || nextY !== contextMenu.y) setContextMenu((current) => current ? { ...current, x: nextX, y: nextY } : current);
  }, [contextMenu]);
  const targetName = dropTargetId === null ? "全部文件" : store.folders.find((folder) => folder.id === dropTargetId)?.name ?? breadcrumbs.at(-1)?.name ?? "全部文件";
  const contextEntry = contextMenu?.entryId ? store.entries.find((entry) => entry.id === contextMenu.entryId) ?? null : null;
  const internalEditorEntry = internalEditorId ? store.activeEntries.find((entry) => entry.id === internalEditorId) ?? null : null;
  const originalPath = (entry: FileEntry) => {
    const names: string[] = [];
    const seen = new Set<string>();
    let parentId = entry.originalParentId ?? entry.parentId;
    while (parentId && !seen.has(parentId)) {
      seen.add(parentId);
      const parent = store.entries.find((candidate) => candidate.id === parentId);
      if (!parent) break;
      names.unshift(parent.name);
      parentId = parent.originalParentId ?? parent.parentId;
    }
    return names.length ? `文件库 / ${names.join(" / ")}` : "文件库 / 全部文件";
  };
  const importDrop = async (event: React.DragEvent, targetId: string | null) => {
    event.preventDefault(); event.stopPropagation();
    dragDepth.current = 0; setExternalDragging(false); setDropTargetId(undefined);
    const read = await readDroppedEntries(event.dataTransfer);
    if (!read.entries.length) {
      store.setError("没有读取到可上传的文件，请重新拖入或使用“上传文件”按钮。");
      return;
    }
    const result = store.importDroppedEntries(targetId, read.entries);
    const summary = [`已导入 ${result.addedFiles} 个文件`];
    if (result.addedFolders) summary.push(`创建 ${result.addedFolders} 个文件夹`);
    if (result.skipped) summary.push(`跳过 ${result.skipped} 个超过 20 MB 的文件`);
    if (read.truncated) summary.push("已达到单次 1000 项限制");
    if (!read.preservedFolders && read.entries.some((entry) => entry.relativePath.includes("/"))) summary.push("当前浏览器未完整提供目录信息");
    setDropNotice(summary.join("，")); store.setError("");
    setFolderId(targetId); setShowTrash(false);
    if (targetId) setExpanded((current) => new Set(current).add(targetId));
  };

  const syncFilesToCloud = async (targets = store.activeEntries.filter((entry) => entry.kind === "file" && (entry.blob || entry.internalType))) => {
    if (!ossConfigured) { store.setError("OSS 尚未配置完成：请先在 .env.local 填写 RAM AccessKey 并重启开发服务。"); return; }
    if (!targets.length) { setDropNotice("当前文件已全部同步到 OSS"); return; }
    setCloudSyncing(true); store.setError("");
    let completed = 0;
    try {
      for (const entry of targets) {
        if (autoSyncingRef.current.has(entry.id)) continue;
        autoSyncingRef.current.add(entry.id);
        const cloud = await uploadEntryToOss(entry);
        store.updateEntry(entry.id, { ...cloud, storageState: "synced" });
        completed += 1;
        autoRetryAtRef.current.delete(entry.id);
        autoSyncingRef.current.delete(entry.id);
      }
      setDropNotice(`已同步 ${completed} 个文件到阿里云 OSS`);
    } catch (error) {
      const failed = targets.find((entry) => autoSyncingRef.current.has(entry.id));
      if (failed) {
        autoSyncingRef.current.delete(failed.id);
        autoRetryAtRef.current.set(failed.id, Date.now() + 5000);
        window.setTimeout(() => {
          autoRetryAtRef.current.delete(failed.id);
          void syncFilesToCloudRef.current?.([failed]);
        }, 5000);
      }
      store.setError(`${completed ? `已同步 ${completed} 个；` : ""}${error instanceof Error ? error.message : "OSS 同步失败"}`);
    } finally { setCloudSyncing(false); }
  };

  useEffect(() => { syncFilesToCloudRef.current = syncFilesToCloud; }, [syncFilesToCloud]);
  const syncEditorPatchToCloud = async (entry: FileEntry, patch: Partial<FileEntry>) => {
    if (!ossConfigured) throw new Error("OSS 尚未配置完成");
    const updatedEntry = { ...entry, ...patch, modifiedAt: Date.now(), storageState: "local" as const };
    const cloud = await uploadEntryToOss(updatedEntry);
    store.updateEntry(entry.id, { ...cloud, storageState: "synced" });
  };
  useEffect(() => {
    if (!ossConfigured || !store.ready) return;
    if (manifestTimerRef.current) window.clearTimeout(manifestTimerRef.current);
    manifestTimerRef.current = window.setTimeout(() => {
      void saveFileManifestToOss(store.entries).catch((error) => store.setError(error instanceof Error ? error.message : "OSS 文件索引同步失败"));
    }, 1200);
    return () => { if (manifestTimerRef.current) window.clearTimeout(manifestTimerRef.current); };
  }, [ossConfigured, store.entries, store.ready]);
  useEffect(() => {
    if (!ossConfigured) return;
    const now = Date.now();
    const candidates = store.entries.filter((entry) => entry.kind === "file" && (entry.storageState !== "synced" || !entry.cloudSha256 || (entry.internalType && entry.cloudObjectKey !== cloudObjectKeyForEntry(entry))) && (entry.blob || entry.internalType) && !autoSyncingRef.current.has(entry.id) && (autoRetryAtRef.current.get(entry.id) ?? 0) <= now);
    if (candidates.length) void syncFilesToCloudRef.current?.(candidates);
  }, [ossConfigured, store.entries]);

  const dragOverFolderEntry = (event: React.DragEvent, entry: FileEntry) => {
    if (entry.kind !== "folder" || showTrash) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.classList.add("internal-drop-target");
    if (isExternalFileDrag(event.dataTransfer)) setDropTargetId(entry.id);
  };
  const leaveFolderEntry = (event: React.DragEvent) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) event.currentTarget.classList.remove("internal-drop-target");
  };
  const dropIntoFolderEntry = (event: React.DragEvent, entry: FileEntry) => {
    if (entry.kind !== "folder" || showTrash) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.classList.remove("internal-drop-target");
    if (isExternalFileDrag(event.dataTransfer)) void importDrop(event, entry.id);
    else {
      const draggedId = event.dataTransfer.getData("text/workbench-entry");
      if (draggedId && draggedId !== entry.id) {
        const draggedEntry = store.activeEntries.find((candidate) => candidate.id === draggedId);
        store.moveEntry(draggedId, entry.id);
        setExpanded((current) => new Set(current).add(entry.id));
        setDropNotice(`已将“${draggedEntry?.name ?? "文件"}”移动到“${entry.name}”`);
      }
    }
  };

  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { dragDepth.current = 0; setExternalDragging(false); setDropTargetId(undefined); } };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, []);

  if (!store.ready) return <div className="file-library-loading">正在打开文件库…</div>;

  return <div className="file-library-page" onDragEnter={(event) => { if (!isExternalFileDrag(event.dataTransfer)) return; event.preventDefault(); dragDepth.current += 1; setExternalDragging(true); if (dropTargetId === undefined) setDropTargetId(folderId); }} onDragOver={(event) => { if (isExternalFileDrag(event.dataTransfer)) event.preventDefault(); }} onDragLeave={(event) => { if (!isExternalFileDrag(event.dataTransfer)) return; dragDepth.current = Math.max(0, dragDepth.current - 1); if (!dragDepth.current) { setExternalDragging(false); setDropTargetId(undefined); } }} onDrop={(event) => { if (isExternalFileDrag(event.dataTransfer)) void importDrop(event, dropTargetId === undefined ? folderId : dropTargetId); }}>
    {externalDragging && <div className="desktop-drop-overlay"><div><Upload size={34}/><strong>松开后上传到“{targetName}”</strong><span>支持多个文件和整个文件夹，并保留原始目录层级</span></div></div>}
    {openingId && <div className="file-opening-overlay"><div><RefreshCw size={24}/><strong>正在转换为可编辑文件…</strong><span>原始文件会保留，可随时下载</span></div></div>}
    <header className="file-library-header">
      <div><h1>{initialShowTrash ? "回收站" : "文件库"}</h1><p>{initialShowTrash ? "集中处理已删除的文件与资料" : "管理项目文件与资料"}</p></div>
      <div className="file-toolbar">
        <label className="file-search"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索文件" /></label>
        <input ref={inputRef} hidden type="file" multiple onChange={(event) => { const result = store.uploadFiles(folderId, Array.from(event.target.files ?? [])); setDropNotice(`已导入 ${result.addedFiles} 个文件${result.skipped ? `，跳过 ${result.skipped} 个超限文件` : ""}`); event.target.value = ""; }} />
        {!initialShowTrash && <><button className="toolbar-button" onClick={() => inputRef.current?.click()}><Upload size={18} /> 上传文件</button>
          <button className="toolbar-button" disabled={cloudSyncing} onClick={() => void syncFilesToCloud()} title={ossConfigured ? "同步所有仅本地文件" : "OSS 尚未配置"}>{cloudSyncing ? <RefreshCw className="spin" size={18}/> : <CloudUpload size={18}/>} {cloudSyncing ? "同步中" : "同步 OSS"}</button>
          <div className="file-new-wrap"><button className="toolbar-button primary" onClick={() => setNewMenuOpen(!newMenuOpen)}><Plus size={18} /> 新建 <ChevronDown size={15}/></button>{newMenuOpen && <div className="file-new-menu"><button onClick={() => createAt("folder", folderId)}><FolderPlus size={16}/>新建文件夹</button><button onClick={() => createAt("document", folderId)}><FilePlus2 size={16}/>新建文档</button><button onClick={() => createAt("spreadsheet", folderId)}><Table2 size={16}/>新建表格</button><button onClick={() => createAt("text", folderId)}><FileType2 size={16}/>新建 TXT</button></div>}</div></>}
      </div>
    </header>

    {store.error && <div className="file-error"><span>{store.error}</span><button onClick={() => store.setError("")}><X size={16} /></button></div>}
    {dropNotice && <div className="file-drop-notice"><span>{dropNotice}</span><button onClick={() => setDropNotice("")}><X size={16}/></button></div>}

    <div className="file-workspace">
      {showTrash ? <aside className="folder-panel trash-source-panel">
        <div className="folder-panel-title"><span>来源</span></div>
        {trashSources.map((source) => <button key={source.key} className={`trash-source-item ${trashSource === source.key ? "selected" : ""}`} onClick={() => { setTrashSource(source.key); setSelectedTrashIds(new Set()); }}>
          {source.key === "all" ? <Trash2 size={17}/> : source.key === "files" ? <FolderOpen size={17}/> : source.key === "knowledge" ? <FileText size={17}/> : source.key === "inbox" ? <HardDrive size={17}/> : <ArchiveRestore size={17}/>}
          <span>{source.label}</span><b>{source.count}</b>
        </button>)}
        <div className="trash-source-note">统一处理删除内容，恢复时会回到原位置。</div>
      </aside> : <aside className="folder-panel">
        <div className="folder-panel-title"><span>文件夹</span>{!initialShowTrash && <button onClick={() => setCreating(true)} aria-label="新建文件夹"><Plus size={17} /></button>}</div>
        <button className={`root-folder ${folderId === null && !showTrash ? "selected" : ""} ${externalDragging && dropTargetId === null ? "external-target" : ""}`} onClick={() => { setFolderId(null); setShowTrash(false); }} onContextMenu={(event) => openContextMenu(event, null, null)} onDragEnter={(event) => { if (isExternalFileDrag(event.dataTransfer)) { event.preventDefault(); setDropTargetId(null); } }} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); event.stopPropagation(); if (isExternalFileDrag(event.dataTransfer)) void importDrop(event, null); else store.moveEntry(event.dataTransfer.getData("text/workbench-entry"), null); }}><HardDrive size={18} />全部文件</button>
        <div className="folder-tree"><FolderTree entries={store.entries} parentId={null} selectedId={folderId} expanded={expanded} onToggle={(id) => setExpanded((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; })} onSelect={(id) => { setFolderId(id); setShowTrash(false); }} onMove={store.moveEntry} externalTargetId={externalDragging ? dropTargetId : undefined} onExternalTarget={setDropTargetId} onExternalDrop={(event, id) => void importDrop(event, id)} onContextMenu={(event, entry) => openContextMenu(event, entry, entry.id)} /></div>
        <button className="trash-link" onClick={() => { setShowTrash(true); setTrashBulkMode(false); setSelectedTrashIds(new Set()); }} onContextMenu={(event) => { event.preventDefault(); setContextMenu({ x: Math.max(8, Math.min(event.clientX, window.innerWidth - 224)), y: event.clientY, entryId: null, targetFolderId: null, trashRoot: true }); }}><Trash2 size={18} />回收站 <span>{store.entries.filter((entry) => entry.deletedAt).length}</span></button>
      </aside>}

      <section className="file-content" onContextMenu={(event) => { if (!(event.target as Element).closest(".file-list-row,.file-card,.file-content-head,.new-folder-row")) openContextMenu(event, null, folderId); }} onDragEnter={(event) => { if (isExternalFileDrag(event.dataTransfer)) { event.preventDefault(); setDropTargetId(folderId); } }} onDragOver={(event) => { if (isExternalFileDrag(event.dataTransfer)) { event.preventDefault(); setDropTargetId(folderId); } }}>
        <div className="file-content-head">
          <div className="breadcrumbs"><button onClick={() => { setFolderId(null); setShowTrash(false); }}>{showTrash ? "文件库" : "全部文件"}</button>{showTrash ? <><ChevronRight size={15} /><strong>{initialShowTrash ? "全局回收站" : "回收站"}</strong></> : breadcrumbs.map((folder) => <span key={folder.id}><ChevronRight size={15} /><button onClick={() => setFolderId(folder.id)}>{folder.name}</button></span>)}</div>
          {showTrash ? <div className="trash-bulk-actions">{trashBulkMode ? <><button onClick={() => setSelectedTrashIds(selectedTrashIds.size === currentEntries.length ? new Set() : new Set(currentEntries.map((entry) => entry.id)))}>{selectedTrashIds.size === currentEntries.length && currentEntries.length ? "取消全选" : "全选"}</button><span>已选 {selectedTrashIds.size} 项</span><button disabled={!selectedTrashIds.size} onClick={() => { store.restoreEntries([...selectedTrashIds]); setSelectedTrashIds(new Set()); }}>恢复所选</button><button className="danger" disabled={!selectedTrashIds.size} onClick={confirmDeleteSelected}>永久删除</button><button onClick={() => { setTrashBulkMode(false); setSelectedTrashIds(new Set()); }}>退出</button></> : <><button onClick={() => setTrashBulkMode(true)}>批量管理</button><button onClick={() => store.restoreAllTrash()}>恢复全部</button><button className="danger" onClick={confirmEmptyTrash}>清空回收站</button></>}</div> : <div className="view-actions"><select value={sort} onChange={(event) => setSort(event.target.value as SortKey)} aria-label="排序"><option value="name">按名称</option><option value="modified">按修改时间</option><option value="size">按大小</option><option value="type">按类型</option></select><button className={view === "list" ? "active" : ""} onClick={() => setView("list")} aria-label="列表视图"><List size={18} /></button><button className={view === "grid" ? "active" : ""} onClick={() => setView("grid")} aria-label="网格视图"><Grid2X2 size={18} /></button></div>}
        </div>

        {creating && !showTrash && <div className="new-folder-row"><Folder size={20} /><input autoFocus value={newFolderName} onChange={(event) => setNewFolderName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") createFolder(); if (event.key === "Escape") setCreating(false); }} placeholder="输入文件夹名称" /><button onClick={createFolder}>创建</button><button onClick={() => setCreating(false)}>取消</button></div>}

        {view === "list" ? <div className={`file-list ${showTrash ? "trash-list" : ""}`}>
          <div className="file-list-head">{showTrash ? <><span>名称</span><span>来源</span><span>原位置</span><span>类型</span><span>删除时间</span><span /></> : <><span>名称</span><span>大小</span><span>类型</span><span>修改时间</span><span>状态</span><span /></>}</div>
          {currentEntries.map((entry) => <div className="file-list-row" key={entry.id} draggable={!showTrash} onContextMenu={(event) => openContextMenu(event, entry)} onDragStart={(event) => event.dataTransfer.setData("text/workbench-entry", entry.id)} onDragOver={(event) => dragOverFolderEntry(event, entry)} onDragLeave={leaveFolderEntry} onDrop={(event) => dropIntoFolderEntry(event, entry)} onDoubleClick={() => !showTrash && openEntry(entry)}>
            <div className="file-name-cell">{showTrash && trashBulkMode && <input type="checkbox" checked={selectedTrashIds.has(entry.id)} onChange={() => setSelectedTrashIds((current) => { const next = new Set(current); if (next.has(entry.id)) next.delete(entry.id); else next.add(entry.id); return next; })}/>}<EntryIcon entry={entry} />{editingId === entry.id ? <input autoFocus value={editingName} onChange={(event) => setEditingName(event.target.value)} onBlur={() => commitRename(entry)} onKeyDown={(event) => { if (event.key === "Enter") commitRename(entry); if (event.key === "Escape") setEditingId(null); }} /> : <button onClick={() => !showTrash && openEntry(entry)}>{entry.name}</button>}</div>
            {showTrash ? <><span><em className="trash-source-badge">文件库</em></span><span className="trash-original-path">{originalPath(entry)}</span><span>{fileTypeLabel(entry)}</span><span>{new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(entry.deletedAt ?? entry.modifiedAt)}</span></> : <><span>{formatFileSize(entry.size)}</span><span>{fileTypeLabel(entry)}</span><span>{new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(entry.modifiedAt)}</span><span className={entry.storageState === "synced" && entry.cloudSha256 && (!entry.internalType || entry.cloudObjectKey === cloudObjectKeyForEntry(entry)) ? "cloud-state" : "local-state"}>{entry.storageState === "synced" && entry.cloudSha256 && (!entry.internalType || entry.cloudObjectKey === cloudObjectKeyForEntry(entry)) ? "本地 + 云端" : entry.storageState === "synced" ? "待云端验证" : entry.storageState === "cloud" ? "仅云端" : "仅本地"}</span></>}
            <div className="entry-menu-wrap"><button className="entry-menu-button" onClick={(event) => openButtonMenu(event, entry)} aria-label={`${entry.name}更多操作`}><MoreHorizontal size={18} /></button></div>
          </div>)}
        </div> : <div className="file-grid">{currentEntries.map((entry) => <div className="file-card" key={entry.id} draggable={!showTrash} onContextMenu={(event) => openContextMenu(event, entry)} onDragStart={(event) => event.dataTransfer.setData("text/workbench-entry", entry.id)} onDragOver={(event) => dragOverFolderEntry(event, entry)} onDragLeave={leaveFolderEntry} onDrop={(event) => dropIntoFolderEntry(event, entry)} onDoubleClick={() => !showTrash && openEntry(entry)}><div className="file-card-preview"><FileThumbnail entry={entry} /></div><div className="file-card-name">{entry.name}</div><span>{entry.kind === "folder" ? "文件夹" : formatFileSize(entry.size)}</span><button onClick={(event) => openButtonMenu(event, entry)} aria-label={`${entry.name}更多操作`}><MoreHorizontal size={18} /></button></div>)}</div>}

        {!currentEntries.length && <div className="empty-files"><FolderOpen size={42} /><h3>{showTrash ? "回收站是空的" : query ? "没有找到相关文件" : "这个文件夹还是空的"}</h3><p>{showTrash ? "删除的项目会暂存在这里" : "上传文件或新建文件夹开始整理"}</p></div>}
      </section>
    </div>

    {moving && <div className="move-backdrop"><div className="move-dialog"><h3>移动“{moving.name}”</h3><p>选择目标文件夹</p><select defaultValue={moving.parentId ?? "root"} id="move-target"><option value="root">全部文件</option>{store.folders.filter((folder) => folder.id !== moving.id).map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</select><div><button onClick={() => setMoving(null)}>取消</button><button className="primary" onClick={() => { const select = document.querySelector<HTMLSelectElement>("#move-target"); store.moveEntry(moving.id, select?.value === "root" ? null : select?.value ?? null); setMoving(null); }}>移动</button></div></div></div>}
    {preview && <Preview key={preview.id} entry={preview} onClose={() => setPreview(null)} onEdit={() => { const entry = preview; setPreview(null); openEntry(entry); }} />}
    {internalEditorEntry?.internalType && <InternalFileEditor key={internalEditorEntry.id} entry={internalEditorEntry} onClose={() => setInternalEditorId(null)} setError={store.setError} onUpdate={(patch) => store.updateEntry(internalEditorEntry.id, patch)} onSync={(patch) => syncEditorPatchToCloud(internalEditorEntry, patch)}/>}
    {contextMenu && <div ref={contextMenuRef} className="file-context-menu" style={{ left: contextMenu.x, top: Math.max(8, contextMenu.y) }} onContextMenu={(event) => event.preventDefault()}>
      {contextMenu.trashRoot ? <>
        <button onClick={() => { setShowTrash(true); setContextMenu(null); }}><Trash2 size={15}/>打开回收站</button>
        <button disabled={!store.entries.some((entry) => entry.deletedAt)} onClick={() => { store.restoreAllTrash(); setContextMenu(null); }}><ArchiveRestore size={15}/>恢复全部</button>
        <button className="danger" disabled={!store.entries.some((entry) => entry.deletedAt)} onClick={() => { setContextMenu(null); confirmEmptyTrash(); }}><Trash2 size={15}/>清空回收站</button>
      </> : showTrash && contextEntry ? <>
        <button onClick={() => { store.restoreEntry(contextEntry.id); setContextMenu(null); }}><ArchiveRestore size={15}/>恢复</button>
        <button className="danger" onClick={() => { deleteForeverWithCloud(contextEntry); setContextMenu(null); }}><Trash2 size={15}/>永久删除</button>
      </> : <>
        {contextEntry && <>
          <button onClick={() => { openEntry(contextEntry); setContextMenu(null); }}>{contextEntry.kind === "folder" ? <FolderOpen size={15}/> : <FileText size={15}/>}打开</button>
          {contextEntry.kind === "folder" && <><i/><button onClick={() => createAt("folder", contextEntry.id)}><FolderPlus size={15}/>在此新建文件夹</button><button onClick={() => createAt("document", contextEntry.id)}><FilePlus2 size={15}/>在此新建文档</button><button onClick={() => createAt("spreadsheet", contextEntry.id)}><Table2 size={15}/>在此新建表格</button><button onClick={() => createAt("text", contextEntry.id)}><FileType2 size={15}/>在此新建 TXT</button><button onClick={() => { setFolderId(contextEntry.id); setShowTrash(false); setContextMenu(null); window.setTimeout(() => inputRef.current?.click(), 0); }}><Upload size={15}/>上传到此</button></>}
          <i/>
          <button onClick={() => { const name = window.prompt("输入新名称", contextEntry.name)?.trim(); if (name) { const message = store.renameEntry(contextEntry.id, name); if (message) store.setError(message); } setContextMenu(null); }}><FileType2 size={15}/>重命名</button>
          <button onClick={() => { store.duplicateEntry(contextEntry.id); setContextMenu(null); }}><Copy size={15}/>创建副本</button>
          <button onClick={() => { setMoving(contextEntry); setContextMenu(null); }}><MoveRight size={15}/>移动到…</button>
          {contextEntry.kind === "file" && contextEntry.blob && <button onClick={() => { download(contextEntry); setContextMenu(null); }}><Download size={15}/>下载</button>}
          {contextEntry.kind === "file" && <><button disabled={!contextEntry.cloudObjectKey} onClick={() => { void copyOssPath(contextEntry); setContextMenu(null); }}><CloudUpload size={15}/>复制 OSS 路径</button><button disabled={!contextEntry.cloudObjectKey} onClick={() => { void copyOssDownloadLink(contextEntry); setContextMenu(null); }}><Download size={15}/>复制下载链接</button></>}
          <button onClick={() => { window.alert(`${contextEntry.name}\n类型：${fileTypeLabel(contextEntry)}\n大小：${formatFileSize(contextEntry.size)}\n修改时间：${new Date(contextEntry.modifiedAt).toLocaleString("zh-CN")}\nOSS路径：${contextEntry.cloudObjectKey ?? "未同步"}`); setContextMenu(null); }}><Info size={15}/>查看详情</button>
          <i/>
          <button className="danger" onClick={() => { store.trashEntry(contextEntry.id); setContextMenu(null); }}><Trash2 size={15}/>移到回收站</button>
        </>}
        {!contextEntry && <><button onClick={() => createAt("folder", contextMenu.targetFolderId)}><FolderPlus size={15}/>新建文件夹</button><button onClick={() => createAt("document", contextMenu.targetFolderId)}><FilePlus2 size={15}/>新建文档</button><button onClick={() => createAt("spreadsheet", contextMenu.targetFolderId)}><Table2 size={15}/>新建表格</button><button onClick={() => createAt("text", contextMenu.targetFolderId)}><FileType2 size={15}/>新建 TXT</button><i/><button onClick={() => { setFolderId(contextMenu.targetFolderId); setContextMenu(null); window.setTimeout(() => inputRef.current?.click(), 0); }}><Upload size={15}/>上传文件</button><button onClick={() => { setContextMenu(null); setDropNotice("文件列表已刷新"); }}><RefreshCw size={15}/>刷新</button></>}
      </>}
    </div>}
  </div>;
}
