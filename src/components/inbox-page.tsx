"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { Archive, CheckCircle2, ExternalLink, File, FileImage, FileText, ImagePlus, Link2, MoreHorizontal, NotebookPen, RotateCcw, Search, Send, Trash2, Upload, X } from "lucide-react";
import type { InboxStore } from "@/hooks/use-inbox";
import type { TaskStore } from "@/hooks/use-tasks";
import { formatFileSize, initialFileEntries, type FileEntry } from "@/lib/file-library";
import { loadFileEntries, saveFileEntries } from "@/lib/file-library-store";
import { inboxTitle, type InboxItem, type InboxItemType } from "@/lib/inbox";
import { createKnowledgeNode, type KnowledgeNode } from "@/lib/knowledge-base";
import { loadKnowledgeNodes, saveKnowledgeNode } from "@/lib/knowledge-store";
import { isExternalFileDrag, readDroppedEntries, type DroppedEntry } from "@/lib/desktop-drop";

type InboxFilter = "pending" | "all" | "text" | "link" | "attachment" | "organized";

const filterLabels: Array<{ key: InboxFilter; label: string }> = [
  { key: "pending", label: "待整理" }, { key: "all", label: "全部" }, { key: "text", label: "文字" },
  { key: "link", label: "链接" }, { key: "attachment", label: "图片/文件" }, { key: "organized", label: "已整理" },
];

const destinationLabels = { task: "今日任务", knowledge: "知识库", files: "文件库" } as const;

function AttachmentPreview({ item }: { item: InboxItem }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    if (!item.blob || item.type !== "image") return;
    const reader = new FileReader();
    reader.onload = () => setUrl(String(reader.result));
    reader.readAsDataURL(item.blob);
    return () => reader.abort();
  }, [item.blob, item.type]);
  if (url) return <Image className="inbox-image-preview" src={url} alt={item.fileName || "收集的图片"} width={54} height={54} unoptimized/>;
  return <span className={`inbox-type-icon ${item.type}`}><File size={20}/></span>;
}

function typeIcon(type: InboxItemType) {
  if (type === "link") return <Link2 size={20}/>;
  if (type === "image") return <FileImage size={20}/>;
  if (type === "file") return <File size={20}/>;
  return <FileText size={20}/>;
}

export function InboxPage({ store, taskStore }: { store: InboxStore; taskStore: TaskStore }) {
  const [value, setValue] = useState("");
  const [filter, setFilter] = useState<InboxFilter>("pending");
  const [query, setQuery] = useState("");
  const [dragging, setDragging] = useState(false);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const imageInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);

  const counts = useMemo(() => ({
    pending: store.items.filter((item) => item.status === "pending").length,
    all: store.items.length,
    text: store.items.filter((item) => item.type === "text").length,
    link: store.items.filter((item) => item.type === "link").length,
    attachment: store.items.filter((item) => item.type === "image" || item.type === "file").length,
    organized: store.items.filter((item) => item.status === "organized").length,
  }), [store.items]);

  const visibleItems = useMemo(() => store.items.filter((item) => {
    const filterMatch = filter === "all" || (filter === "pending" && item.status === "pending") || (filter === "organized" && item.status === "organized") || (filter === "attachment" && (item.type === "image" || item.type === "file")) || item.type === filter;
    const searchMatch = `${item.content} ${item.fileName ?? ""}`.toLowerCase().includes(query.trim().toLowerCase());
    return filterMatch && searchMatch;
  }), [filter, query, store.items]);

  useEffect(() => {
    if (!menuId) return;
    const close = (event: PointerEvent) => { if (!(event.target as Element).closest?.(".inbox-more-wrap")) setMenuId(null); };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [menuId]);

  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { dragDepth.current = 0; setDragging(false); } };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, []);

  const submitText = () => {
    const error = store.collectText(value);
    if (error) return store.setError(error);
    setValue(""); setNotice("已加入收集箱"); store.setError("");
  };

  const addDroppedEntries = (entries: DroppedEntry[], truncated = false) => {
    const result = store.collectDroppedEntries(entries);
    if (!result.added && !result.skipped) return;
    const details = [`已收集 ${result.added} 个文件`];
    if (result.skipped) details.push(`跳过 ${result.skipped} 个超过 20 MB 的文件`);
    if (truncated) details.push("已达到单次 1000 项限制");
    setNotice(details.join("，")); store.setError("");
  };

  const addFiles = (files: File[]) => addDroppedEntries(files.map((file) => ({ kind: "file", relativePath: file.name, file })));

  const handleDrop = async (event: React.DragEvent) => {
    event.preventDefault();
    dragDepth.current = 0; setDragging(false);
    const result = await readDroppedEntries(event.dataTransfer);
    addDroppedEntries(result.entries, result.truncated);
  };

  const organizeTask = (item: InboxItem) => {
    taskStore.addTask({ title: inboxTitle(item), category: "个人", priority: "normal", time: "" });
    store.markOrganized(item.id, "task"); setNotice("已转为今日任务");
  };

  const organizeKnowledge = async (item: InboxItem) => {
    setBusyId(item.id); store.setError("");
    try {
      const nodes = await loadKnowledgeNodes();
      const space = nodes.find((node) => node.type === "folder" && node.parentId === null && !node.deletedAt && node.isKnowledgeBase) ?? nodes.find((node) => node.type === "folder" && node.parentId === null && !node.deletedAt);
      if (!space) throw new Error("请先在知识库中创建一个知识库");
      const siblings = nodes.filter((node) => node.parentId === space.id && !node.deletedAt);
      const document = createKnowledgeNode("document", space.id, siblings.length);
      const body = item.content.trim();
      Object.assign(document, {
        title: inboxTitle(item), plainText: body, contentJson: { type: "doc", content: [{ type: "paragraph", content: body ? [{ type: "text", text: body }] : [] }] }, lastSavedAt: Date.now(),
      } satisfies Partial<KnowledgeNode>);
      await saveKnowledgeNode(document);
      store.markOrganized(item.id, "knowledge"); setNotice("已转为知识库文档");
    } catch (error) {
      store.setError(error instanceof Error ? error.message : "转为知识库失败，请重试");
    } finally { setBusyId(null); }
  };

  const organizeFile = async (item: InboxItem) => {
    if (!item.blob) return store.setError("原文件数据不可用，请重新上传");
    setBusyId(item.id); store.setError("");
    try {
      const stored = await loadFileEntries();
      const entries = stored.length ? stored : initialFileEntries;
      const baseName = item.fileName || "未命名文件";
      let name = baseName;
      let suffix = 1;
      while (entries.some((entry) => !entry.deletedAt && entry.parentId === null && entry.name.toLowerCase() === name.toLowerCase())) {
        const dot = baseName.lastIndexOf(".");
        name = dot > 0 ? `${baseName.slice(0, dot)} (${suffix})${baseName.slice(dot)}` : `${baseName} (${suffix})`;
        suffix += 1;
      }
      const entry: FileEntry = { id: crypto.randomUUID(), parentId: null, kind: "file", name, mimeType: item.mimeType || "application/octet-stream", size: item.size || item.blob.size, modifiedAt: Date.now(), storageState: "local", sortOrder: entries.filter((candidate) => candidate.parentId === null).length, deletedAt: null, blob: item.blob };
      await saveFileEntries([...entries, entry]);
      store.markOrganized(item.id, "files"); setNotice("已移入文件库根目录");
    } catch {
      store.setError("移入文件库失败，请重试");
    } finally { setBusyId(null); }
  };

  const editItem = (item: InboxItem) => {
    const next = window.prompt("编辑收集内容", item.content)?.trim();
    if (next) store.updateItem(item.id, next);
    setMenuId(null);
  };

  return <div className="inbox-page" onDragEnter={(event) => { if (!isExternalFileDrag(event.dataTransfer)) return; event.preventDefault(); dragDepth.current += 1; setDragging(true); }} onDragOver={(event) => { if (isExternalFileDrag(event.dataTransfer)) event.preventDefault(); }} onDragLeave={(event) => { if (!isExternalFileDrag(event.dataTransfer)) return; dragDepth.current = Math.max(0, dragDepth.current - 1); if (!dragDepth.current) setDragging(false); }} onDrop={(event) => { if (isExternalFileDrag(event.dataTransfer)) void handleDrop(event); }}>
    {dragging && <div className="desktop-drop-overlay"><div><Upload size={34}/><strong>松开后加入收集箱</strong><span>支持多个文件和整个文件夹，文件夹中的内容会逐条收集</span></div></div>}
    <header className="inbox-header"><div><h1>收集箱</h1><p>先快速收进来，稍后再整理到任务、知识库或文件库</p></div><label className="inbox-search"><Search size={17}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索收集内容"/></label></header>
    {(store.error || notice) && <div className={`inbox-message ${store.error ? "error" : "success"}`}><span>{store.error || notice}</span><button onClick={() => { store.setError(""); setNotice(""); }}><X size={16}/></button></div>}
    <section className={`inbox-capture ${dragging ? "dragging" : ""}`}>
      <textarea value={value} onChange={(event) => setValue(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); submitText(); } }} placeholder="输入文字或粘贴链接，按 Enter 收集…"/>
      <div className="inbox-capture-actions"><div><button onClick={() => imageInput.current?.click()}><ImagePlus size={17}/>上传图片</button><button onClick={() => fileInput.current?.click()}><Upload size={17}/>上传文件</button><span>也可以把文件拖到这里</span></div><button className="primary" disabled={!value.trim()} onClick={submitText}><Send size={17}/>收集</button></div>
      <input ref={imageInput} hidden type="file" accept="image/*" multiple onChange={(event) => { addFiles([...(event.target.files ?? [])]); event.target.value = ""; }}/>
      <input ref={fileInput} hidden type="file" multiple onChange={(event) => { addFiles([...(event.target.files ?? [])]); event.target.value = ""; }}/>
    </section>
    <section className="inbox-list-card">
      <div className="inbox-tabs">{filterLabels.map((tab) => <button key={tab.key} className={filter === tab.key ? "active" : ""} onClick={() => setFilter(tab.key)}>{tab.label}<span>{counts[tab.key]}</span></button>)}</div>
      {!store.ready ? <div className="inbox-empty">正在打开收集箱…</div> : visibleItems.length ? <div className="inbox-list">{visibleItems.map((item) => <article className={`inbox-item ${item.status}`} key={item.id}>
        <div className="inbox-preview">{item.type === "image" ? <AttachmentPreview item={item}/> : <span className={`inbox-type-icon ${item.type}`}>{typeIcon(item.type)}</span>}</div>
        <div className="inbox-item-content"><div><strong>{inboxTitle(item)}</strong>{item.status === "organized" && <span className="organized-badge"><CheckCircle2 size={13}/>已整理到{destinationLabels[item.organizedTo!]}</span>}</div>{item.type === "text" && item.content.includes("\n") && <p>{item.content.split(/\r?\n/).slice(1).join(" ").slice(0, 150)}</p>}{item.type === "link" && <a href={item.content} target="_blank" rel="noreferrer">{item.content}<ExternalLink size={13}/></a>}{(item.type === "image" || item.type === "file") && <p>{item.mimeType || "普通文件"} · {formatFileSize(item.size || 0)}{item.relativePath && item.relativePath !== item.fileName ? ` · 来源：${item.relativePath}` : ""}</p>}<small>{new Date(item.createdAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</small></div>
        <div className="inbox-item-actions">{item.status === "pending" ? <>{(item.type === "text" || item.type === "link") && <><button disabled={busyId === item.id} onClick={() => organizeTask(item)}><CheckCircle2 size={15}/>转为任务</button><button disabled={busyId === item.id} onClick={() => void organizeKnowledge(item)}><NotebookPen size={15}/>转为知识库</button></>}{(item.type === "image" || item.type === "file") && <button disabled={busyId === item.id} onClick={() => void organizeFile(item)}><Archive size={15}/>移入文件库</button>}</> : <button onClick={() => store.restoreItem(item.id)}><RotateCcw size={15}/>恢复待整理</button>}
          <div className="inbox-more-wrap"><button className="inbox-more" onClick={() => setMenuId(menuId === item.id ? null : item.id)} aria-label="更多操作"><MoreHorizontal size={17}/></button>{menuId === item.id && <div className="inbox-more-menu">{(item.type === "text" || item.type === "link") && <button onClick={() => editItem(item)}>编辑内容</button>}<button className="danger" onClick={() => { if (window.confirm("删除这条收集内容？")) store.removeItem(item.id); setMenuId(null); }}><Trash2 size={14}/>删除</button></div>}</div>
        </div>
      </article>)}</div> : <div className="inbox-empty"><Archive size={34}/><h3>{filter === "pending" ? "待整理内容已经清空" : "这里还没有内容"}</h3><p>在上方输入文字、粘贴链接或上传文件</p></div>}
    </section>
  </div>;
}
