"use client";

import { useEffect, useRef, useState } from "react";
import { EditorContent, useEditor, type JSONContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { Table, TableCell, TableHeader, TableRow } from "@tiptap/extension-table";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Placeholder from "@tiptap/extension-placeholder";
import { TextStyleKit } from "@tiptap/extension-text-style";
import { ArchiveRestore, ArrowLeft, Bold, BookOpen, ChevronDown, ChevronRight, Code2, Copy, FilePlus2, FileText, Folder, FolderOpen, FolderPlus, Heading1, Heading2, ImagePlus, Italic, List, ListChecks, ListOrdered, Maximize2, Minimize2, MoreHorizontal, MoveRight, PanelLeftClose, PanelLeftOpen, Pin, Plus, Quote, Redo2, Search, Strikethrough, Table2, Trash2, UnderlineIcon, Undo2, X } from "lucide-react";
import { emptySpreadsheet, type KnowledgeNode } from "@/lib/knowledge-base";
import { useKnowledgeBase } from "@/hooks/use-knowledge-base";

function TreeNode({ node, nodes, selectedId, expanded, onToggle, onSelect, onRename, onTrash, onMove, onCreateChild, onContextMenu }: {
  node: KnowledgeNode; nodes: KnowledgeNode[]; selectedId: string | null; expanded: Set<string>;
  onToggle: (id: string) => void; onSelect: (id: string) => void; onRename: (node: KnowledgeNode) => void; onTrash: (id: string) => void; onMove: (id: string, parentId: string | null) => void; onCreateChild?: (parentId: string, type: "document" | "table" | "folder") => void; onContextMenu?: (event: React.MouseEvent, node: KnowledgeNode) => void;
}) {
  const [menu, setMenu] = useState(false);
  const [addMenu, setAddMenu] = useState(false);
  const rowRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu && !addMenu) return;
    const closeOutside = (event: PointerEvent) => {
      if (!rowRef.current?.contains(event.target as Node)) { setMenu(false); setAddMenu(false); }
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [menu, addMenu]);
  const children = nodes.filter((item) => item.parentId === node.id).sort((a, b) => a.sortOrder - b.sortOrder);
  const open = expanded.has(node.id);
  return <div className="knowledge-tree-node">
    <div ref={rowRef} className={`knowledge-tree-row ${selectedId === node.id ? "selected" : ""}`} onContextMenu={(event) => onContextMenu?.(event, node)} onDoubleClick={() => node.type === "folder" ? onToggle(node.id) : onSelect(node.id)} draggable onDragStart={(event) => event.dataTransfer.setData("text/knowledge-id", node.id)} onDragOver={(event) => { if (node.type === "folder") event.preventDefault(); }} onDrop={(event) => { event.preventDefault(); const id = event.dataTransfer.getData("text/knowledge-id"); if (id && node.type === "folder") onMove(id, node.id); }}>
      <button className="tree-chevron" onClick={() => node.type === "folder" && onToggle(node.id)} aria-label={open ? "收起" : "展开"}>{node.type === "folder" ? (open ? <ChevronDown size={15}/> : <ChevronRight size={15}/>) : null}</button>
      <button className="knowledge-node-select" onClick={() => node.type === "document" ? onSelect(node.id) : onToggle(node.id)}>{node.type === "folder" ? (open ? <FolderOpen size={17}/> : <Folder size={17}/>) : node.documentKind === "table" ? <Table2 size={17}/> : <FileText size={17}/>}<span>{node.title}</span></button>
      {node.type === "folder" && onCreateChild && <button className="knowledge-node-add" onClick={() => { setAddMenu(!addMenu); setMenu(false); }} aria-label={`在${node.title}中新建`}><Plus size={15}/></button>}
      <button className="knowledge-node-menu" onClick={() => { setMenu(!menu); setAddMenu(false); }} aria-label="更多操作"><MoreHorizontal size={16}/></button>
      {addMenu && <div className="knowledge-row-menu knowledge-add-menu"><button onClick={() => { onCreateChild?.(node.id, "document"); setAddMenu(false); }}><FilePlus2 size={14}/>新建文档</button><button onClick={() => { onCreateChild?.(node.id, "table"); setAddMenu(false); }}><Table2 size={14}/>新建表格</button><button onClick={() => { onCreateChild?.(node.id, "folder"); setAddMenu(false); }}><FolderPlus size={14}/>新建子文件夹</button></div>}
      {menu && <div className="knowledge-row-menu"><button onClick={() => { onRename(node); setMenu(false); }}>重命名</button><button className="danger" onClick={() => onTrash(node.id)}><Trash2 size={14}/>移到回收站</button></div>}
    </div>
    {node.type === "folder" && open && <div className="knowledge-tree-children">{children.map((child) => <TreeNode key={child.id} node={child} nodes={nodes} selectedId={selectedId} expanded={expanded} onToggle={onToggle} onSelect={onSelect} onRename={onRename} onTrash={onTrash} onMove={onMove} onCreateChild={onCreateChild} onContextMenu={onContextMenu}/>)}</div>}
  </div>;
}

function EditorButton({ active, title, onClick, children }: { active?: boolean; title: string; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" className={active ? "active" : ""} title={title} onMouseDown={(event) => { event.preventDefault(); onClick(); }}>{children}</button>;
}

export function DocumentEditor({ node, onSave, setError, statusLabels }: { node: KnowledgeNode; onSave: (id: string, title: string, json: JSONContent, text: string) => Promise<void>; setError: (message: string) => void; statusLabels?: { saving: string; saved: string; error: string } }) {
  const [title, setTitle] = useState(node.title);
  const [status, setStatus] = useState<"saved" | "saving" | "error">("saved");
  const imageInput = useRef<HTMLInputElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef({ title: node.title, json: node.contentJson ?? { type: "doc" }, text: node.plainText ?? "" });
  const editor = useEditor({ immediatelyRender: false, extensions: [StarterKit.configure({ link: { openOnClick: false } }), TextStyleKit, Image.configure({ allowBase64: true }), Table.configure({ resizable: true }), TableRow, TableHeader, TableCell, TaskList, TaskItem.configure({ nested: true }), Placeholder.configure({ placeholder: "输入 / 或直接开始记录…" })], content: node.contentJson, onUpdate: ({ editor: current }) => { latest.current = { ...latest.current, json: current.getJSON(), text: current.getText() }; scheduleSave(); } });

  const scheduleSave = () => { setStatus("saving"); if (saveTimer.current) clearTimeout(saveTimer.current); saveTimer.current = setTimeout(async () => { try { await onSave(node.id, latest.current.title, latest.current.json, latest.current.text); setStatus("saved"); } catch { setStatus("error"); } }, 500); };
  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current); }, []);
  if (!editor) return <div className="knowledge-editor-loading">正在加载编辑器…</div>;

  const addImage = (file?: File) => { if (!file) return; if (!file.type.startsWith("image/")) return setError("请选择图片文件"); if (file.size > 5 * 1024 * 1024) return setError("单张图片不能超过 5MB"); const reader = new FileReader(); reader.onload = () => editor.chain().focus().setImage({ src: String(reader.result), alt: file.name }).run(); reader.readAsDataURL(file); };
  const setLink = () => { const previous = editor.getAttributes("link").href as string | undefined; const url = window.prompt("输入链接地址", previous ?? "https://"); if (url === null) return; if (!url) editor.chain().focus().unsetLink().run(); else editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run(); };

  return <section className="knowledge-editor-pane">
    <div className="knowledge-document-meta"><span>{status === "saving" ? statusLabels?.saving ?? "保存中…" : status === "error" ? statusLabels?.error ?? "保存失败" : statusLabels?.saved ?? "已保存"}</span></div>
    <input className="knowledge-title-input" value={title} onChange={(event) => { setTitle(event.target.value); latest.current.title = event.target.value; scheduleSave(); }} placeholder="无标题文档" />
    <div className="editor-toolbar">
      <EditorButton title="撤销" onClick={() => editor.chain().focus().undo().run()}><Undo2 size={16}/></EditorButton><EditorButton title="重做" onClick={() => editor.chain().focus().redo().run()}><Redo2 size={16}/></EditorButton><i/>
      <select className="editor-format-select editor-font-select" aria-label="字体" value={editor.getAttributes("textStyle").fontFamily ?? ""} onChange={(event) => event.target.value ? editor.chain().focus().setFontFamily(event.target.value).run() : editor.chain().focus().unsetFontFamily().run()}><option value="">默认字体</option><option value="Microsoft YaHei">微软雅黑</option><option value="SimSun">宋体</option><option value="SimHei">黑体</option><option value="KaiTi">楷体</option><option value="Arial">Arial</option><option value="Consolas">Consolas</option></select>
      <select className="editor-format-select" aria-label="字号" value={editor.getAttributes("textStyle").fontSize ?? ""} onChange={(event) => event.target.value ? editor.chain().focus().setFontSize(event.target.value).run() : editor.chain().focus().unsetFontSize().run()}><option value="">默认字号</option><option value="12px">12</option><option value="14px">14</option><option value="16px">16</option><option value="18px">18</option><option value="20px">20</option><option value="24px">24</option><option value="28px">28</option><option value="32px">32</option><option value="40px">40</option></select>
      <label className="editor-color-control" title="文字颜色"><input type="color" aria-label="文字颜色" value={editor.getAttributes("textStyle").color ?? "#303746"} onChange={(event) => editor.chain().focus().setColor(event.target.value).run()}/></label><i/>
      <EditorButton title="一级标题" active={editor.isActive("heading", { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}><Heading1 size={17}/></EditorButton><EditorButton title="二级标题" active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}><Heading2 size={17}/></EditorButton>
      <EditorButton title="加粗" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}><Bold size={16}/></EditorButton><EditorButton title="斜体" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}><Italic size={16}/></EditorButton><EditorButton title="下划线" active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()}><UnderlineIcon size={16}/></EditorButton><EditorButton title="删除线" active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()}><Strikethrough size={16}/></EditorButton>
      <EditorButton title="无序列表" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}><List size={17}/></EditorButton><EditorButton title="有序列表" active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}><ListOrdered size={17}/></EditorButton><EditorButton title="任务列表" active={editor.isActive("taskList")} onClick={() => editor.chain().focus().toggleTaskList().run()}><ListChecks size={17}/></EditorButton>
      <EditorButton title="引用" active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()}><Quote size={16}/></EditorButton><EditorButton title="代码块" active={editor.isActive("codeBlock")} onClick={() => editor.chain().focus().toggleCodeBlock().run()}><Code2 size={16}/></EditorButton>
      <EditorButton title="链接" active={editor.isActive("link")} onClick={setLink}>链接</EditorButton><EditorButton title="图片" onClick={() => imageInput.current?.click()}><ImagePlus size={17}/></EditorButton><EditorButton title="插入表格" onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}><Table2 size={17}/></EditorButton>
      <input ref={imageInput} type="file" accept="image/*" hidden onChange={(event) => { addImage(event.target.files?.[0]); event.target.value = ""; }}/>
    </div>
    <EditorContent editor={editor} className="knowledge-editor-content" />
  </section>;
}

export function SpreadsheetEditor({ node, onUpdate }: { node: KnowledgeNode; onUpdate: (id: string, patch: Partial<KnowledgeNode>) => Promise<void> }) {
  const [title, setTitle] = useState(node.title);
  const initialNode = useRef(node);
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"saved" | "saving" | "error">("saved");
  const titleRef = useRef(node.title);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onUpdateRef = useRef(onUpdate);
  useEffect(() => { onUpdateRef.current = onUpdate; }, [onUpdate]);
  useEffect(() => {
    let disposed = false;
    let disposeUniver = () => {};
    void (async () => {
      const [{ createUniver, LocaleType, mergeLocales }, { UniverSheetsCorePreset }, localeModule] = await Promise.all([
        import("@univerjs/presets"), import("@univerjs/preset-sheets-core"), import("@univerjs/preset-sheets-core/locales/zh-CN"),
      ]);
      if (disposed || !containerRef.current) return;
      const { univer, univerAPI } = createUniver({ locale: LocaleType.ZH_CN, locales: { [LocaleType.ZH_CN]: mergeLocales(localeModule.default) }, presets: [UniverSheetsCorePreset({ container: containerRef.current })] });
      const sourceNode = initialNode.current;
      const legacy = sourceNode.tableData ?? emptySpreadsheet();
      const workbook = univerAPI.createWorkbook(sourceNode.workbookData ?? { name: sourceNode.title });
      if (!sourceNode.workbookData) {
        const sheet = workbook.getActiveSheet();
        Object.entries(legacy.cells).forEach(([key, value]) => sheet.getRange(key).setValue(value));
      }
      requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
      window.setTimeout(() => window.dispatchEvent(new Event("resize")), 80);
      window.setTimeout(() => window.dispatchEvent(new Event("resize")), 300);
      window.setTimeout(() => window.dispatchEvent(new Event("resize")), 800);
      window.setTimeout(() => window.dispatchEvent(new Event("resize")), 1500);
      const commandDisposable = univerAPI.onCommandExecuted(() => { setStatus("saving"); if (saveTimer.current) clearTimeout(saveTimer.current); saveTimer.current = setTimeout(async () => { try { const workbookData = univerAPI.getActiveWorkbook()?.save() as unknown as Record<string, unknown>; await onUpdateRef.current(node.id, { title: titleRef.current.trim() || "无标题表格", workbookData }); setStatus("saved"); } catch { setStatus("error"); } }, 700); });
      disposeUniver = () => { commandDisposable.dispose(); univer.dispose(); };
    })().catch(() => setStatus("error"));
    return () => { disposed = true; if (saveTimer.current) clearTimeout(saveTimer.current); window.setTimeout(disposeUniver, 0); };
  }, [node.id]);
  return <section className="spreadsheet-pane">
    <div className="spreadsheet-head"><input value={title} onChange={(event) => { setTitle(event.target.value); titleRef.current = event.target.value; }} onBlur={() => void onUpdateRef.current(node.id, { title: titleRef.current.trim() || "无标题表格" })} placeholder="无标题表格"/><span>{status === "saving" ? "保存中…" : status === "error" ? "加载或保存失败" : "已保存"}</span></div>
    <div ref={containerRef} className="univer-sheet-container" />
  </section>;
}

export type KnowledgeViewMode = "normal" | "focus" | "fullscreen";

export function KnowledgeBasePage({ onViewModeChange }: { onViewModeChange?: (mode: KnowledgeViewMode) => void }) {
  const store = useKnowledgeBase();
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showTrash, setShowTrash] = useState(false);
  const [spaceId, setSpaceId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newMenu, setNewMenu] = useState(false);
  const [spaceTitle, setSpaceTitle] = useState("");
  const [spaceDescription, setSpaceDescription] = useState("");
  const [spaceCover, setSpaceCover] = useState("linear-gradient(145deg,#1677ff,#75a7ff)");
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; nodeId: string | null; trashRoot?: boolean } | null>(null);
  const [trashBulkMode, setTrashBulkMode] = useState(false);
  const [selectedTrashIds, setSelectedTrashIds] = useState<Set<string>>(new Set());
  const [moveTargetId, setMoveTargetId] = useState<string | null>(null);
  const [moveParentId, setMoveParentId] = useState<string>("");
  const [viewMode, setViewMode] = useState<KnowledgeViewMode>("normal");
  const [treeWidth, setTreeWidth] = useState(() => {
    if (typeof window === "undefined") return 265;
    const savedWidth = Number(window.localStorage.getItem("knowledge-tree-width"));
    return Number.isFinite(savedWidth) && savedWidth >= 200 && savedWidth <= 420 ? savedWidth : 265;
  });
  const [treeCollapsed, setTreeCollapsed] = useState(false);
  const [overlayOpen, setOverlayOpen] = useState(false);
  const resizeStart = useRef<{ x: number; width: number } | null>(null);
  const spaces = store.activeNodes.filter((node) => node.type === "folder" && node.parentId === null).sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || (b.lastOpenedAt ?? b.updatedAt) - (a.lastOpenedAt ?? a.updatedAt));
  const currentSpace = spaces.find((space) => space.id === spaceId) ?? null;
  const isInside = (node: KnowledgeNode, targetSpaceId: string) => { let parentId = node.parentId; while (parentId) { if (parentId === targetSpaceId) return true; parentId = store.activeNodes.find((item) => item.id === parentId)?.parentId ?? null; } return false; };
  const spaceNodes = currentSpace ? store.activeNodes.filter((node) => isInside(node, currentSpace.id)) : [];
  const roots = spaceNodes.filter((node) => node.parentId === spaceId).sort((a, b) => a.sortOrder - b.sortOrder);
  const results = query.trim() ? spaceNodes.filter((node) => node.type === "document" && `${node.title} ${node.plainText ?? ""}`.toLowerCase().includes(query.trim().toLowerCase())) : [];
  const create = async (type: "folder" | "document" | "table", targetParentId?: string) => { if (!spaceId) return; const parentId = targetParentId ?? (store.selected && isInside(store.selected, spaceId) ? (store.selected.type === "folder" ? store.selected.id : store.selected.parentId) : spaceId); const node = await store.createNode(type === "folder" ? "folder" : "document", parentId, type === "table" ? { title: "无标题表格", documentKind: "table", tableData: emptySpreadsheet(), plainText: "字段 1 字段 2 字段 3 字段 4" } : {}); if (parentId) setExpanded((current) => new Set(current).add(parentId)); if (type === "folder") rename(node); setNewMenu(false); };
  const rename = (node: KnowledgeNode) => { const title = window.prompt("输入新名称", node.title)?.trim(); if (title && title !== node.title) void store.updateNode(node.id, { title }); };
  const openSpace = (space: KnowledgeNode) => { setSpaceId(space.id); setQuery(""); setShowTrash(false); void store.updateNode(space.id, { isKnowledgeBase: true }); const firstDocument = store.activeNodes.find((node) => node.type === "document" && isInside(node, space.id)); store.setSelectedId(firstDocument?.id ?? null); setExpanded(new Set([space.id])); };
  const submitSpace = async () => { const title = spaceTitle.trim(); if (!title) return; const space = await store.createKnowledgeBase(title, spaceDescription.trim(), spaceCover); const doc = await store.createNode("document", space.id); setCreateOpen(false); setSpaceTitle(""); setSpaceDescription(""); setSpaceId(space.id); store.setSelectedId(doc.id); };
  const quickCreate = async (type: "folder" | "document" | "table") => { const target = spaces[0]; if (!target) { setCreateOpen(true); setNewMenu(false); return; } openSpace(target); const node = await store.createNode(type === "folder" ? "folder" : "document", target.id, type === "table" ? { title: "无标题表格", documentKind: "table", tableData: emptySpreadsheet(), plainText: "字段 1 字段 2 字段 3 字段 4" } : {}); if (type !== "folder") store.setSelectedId(node.id); else rename(node); setNewMenu(false); };
  useEffect(() => {
    if (!contextMenu) return;
    const close = (event: PointerEvent) => { if (!(event.target as Element).closest?.(".knowledge-context-menu")) setContextMenu(null); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setContextMenu(null); };
    const scrollClose = () => setContextMenu(null);
    document.addEventListener("pointerdown", close); document.addEventListener("keydown", escape); window.addEventListener("scroll", scrollClose, true);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", escape); window.removeEventListener("scroll", scrollClose, true); };
  }, [contextMenu]);
  useEffect(() => {
    window.localStorage.setItem("knowledge-tree-width", String(treeWidth));
  }, [treeWidth]);
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
    const timer = window.setTimeout(() => window.dispatchEvent(new Event("resize")), 240);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [overlayOpen, treeCollapsed, treeWidth, viewMode]);
  useEffect(() => {
    onViewModeChange?.(viewMode);
  }, [onViewModeChange, viewMode]);
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (overlayOpen) setOverlayOpen(false);
      else if (viewMode === "fullscreen") {
        setTreeCollapsed(false);
        setViewMode("focus");
      }
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [overlayOpen, viewMode]);
  useEffect(() => {
    const handleMove = (event: PointerEvent) => {
      if (!resizeStart.current) return;
      setTreeWidth(Math.min(420, Math.max(200, resizeStart.current.width + event.clientX - resizeStart.current.x)));
    };
    const handleUp = () => {
      resizeStart.current = null;
      document.body.classList.remove("knowledge-resizing");
    };
    document.addEventListener("pointermove", handleMove);
    document.addEventListener("pointerup", handleUp);
    return () => {
      document.removeEventListener("pointermove", handleMove);
      document.removeEventListener("pointerup", handleUp);
      document.body.classList.remove("knowledge-resizing");
    };
  }, []);
  const changeViewMode = (mode: KnowledgeViewMode) => {
    setViewMode(mode);
    setOverlayOpen(false);
    if (mode === "focus") setTreeCollapsed(false);
  };
  const startTreeResize = (event: React.PointerEvent) => {
    event.preventDefault();
    resizeStart.current = { x: event.clientX, width: treeWidth };
    document.body.classList.add("knowledge-resizing");
  };
  const openContextMenu = (event: React.MouseEvent, nodeId: string | null) => { event.preventDefault(); event.stopPropagation(); if (nodeId) store.setSelectedId(nodeId); setContextMenu({ x: Math.min(event.clientX, window.innerWidth - 205), y: Math.min(event.clientY, window.innerHeight - 265), nodeId }); };
  const contextNode = contextMenu?.nodeId ? store.activeNodes.find((node) => node.id === contextMenu.nodeId) ?? null : null;
  const startMove = (node: KnowledgeNode) => { setMoveTargetId(node.id); setMoveParentId(node.parentId ?? spaceId ?? ""); setContextMenu(null); };
  const recycleRoots = store.nodes.filter((node) => node.deletedAt && (!node.parentId || !store.nodes.find((parent) => parent.id === node.parentId)?.deletedAt));
  const confirmEmptyKnowledgeTrash = () => { const count = store.nodes.filter((node) => node.deletedAt).length; if (count && window.confirm(`永久删除知识库回收站中的 ${count} 个项目？此操作不可恢复。`)) { void store.emptyTrash(); setSelectedTrashIds(new Set()); setTrashBulkMode(false); } };

  if (store.loading) return <div className="knowledge-loading">正在打开知识库…</div>;
  if (!currentSpace) return <div className="knowledge-lobby">
    <header className="lobby-header"><div><h1>知识库</h1><p>把经验和方法沉淀成自己的知识系统</p></div><div className="lobby-actions"><button onClick={() => setCreateOpen(true)}>新建知识库</button><div className="lobby-new-wrap"><button className="primary" onClick={() => setNewMenu(!newMenu)}>新建 <ChevronDown size={16}/></button>{newMenu && <div className="lobby-new-menu"><button onClick={() => { setCreateOpen(true); setNewMenu(false); }}><BookOpen size={16}/>新建知识库</button><button onClick={() => void quickCreate("document")}><FilePlus2 size={16}/>新建文档</button><button onClick={() => void quickCreate("table")}><Table2 size={16}/>新建表格</button><button onClick={() => void quickCreate("folder")}><FolderPlus size={16}/>新建文件夹</button></div>}</div></div></header>
    <section className="lobby-section"><div className="lobby-section-head"><h2>置顶知识库</h2></div><div className="pinned-spaces">{spaces.filter((space) => space.pinned).map((space) => <button key={space.id} className="pinned-card" style={{ background: space.cover || "linear-gradient(145deg,#1677ff,#75a7ff)" }} onClick={() => openSpace(space)}><BookOpen size={25}/><strong>{space.title}</strong></button>)}{!spaces.some((space) => space.pinned) && <div className="pinned-placeholder">可以把常用知识库置顶到这里</div>}</div></section>
    <section className="lobby-section all-spaces"><div className="lobby-section-head"><h2>全部知识库</h2><label><Search size={17}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索知识库"/></label></div><div className="space-grid">{spaces.filter((space) => `${space.title} ${space.description ?? ""}`.toLowerCase().includes(query.trim().toLowerCase())).map((space, index) => <article key={space.id} className="space-card" style={{ background: space.cover || ["linear-gradient(145deg,#1677ff,#65a8ff)","linear-gradient(145deg,#7357e8,#a793ff)","linear-gradient(145deg,#0f9f7a,#77d4b8)"][index % 3] }} onClick={() => openSpace(space)}><div className="space-card-actions"><button title={space.pinned ? "取消置顶" : "置顶"} onClick={(event) => { event.stopPropagation(); void store.updateNode(space.id, { pinned: !space.pinned }); }}><Pin size={15}/></button><button title="更多" onClick={(event) => { event.stopPropagation(); rename(space); }}><MoreHorizontal size={17}/></button></div><BookOpen size={28}/><h3>{space.title}</h3><p>{space.description || "记录和整理你的知识"}</p><small>最近更新 · {new Date(space.updatedAt).toLocaleDateString("zh-CN")}</small></article>)}<button className="space-create-card" onClick={() => setCreateOpen(true)}><Plus size={28}/><span>新建知识库</span></button></div></section>
    {createOpen && <div className="knowledge-modal-backdrop"><div className="knowledge-create-modal"><button className="modal-close" onClick={() => setCreateOpen(false)}><X size={18}/></button><h2>新建知识库</h2><p>为一类工作或主题创建独立空间</p><label>名称<input autoFocus value={spaceTitle} onChange={(event) => setSpaceTitle(event.target.value)} placeholder="例如：直播运营笔记" onKeyDown={(event) => { if (event.key === "Enter") void submitSpace(); }}/></label><label>简介（选填）<textarea value={spaceDescription} onChange={(event) => setSpaceDescription(event.target.value)} placeholder="这个知识库主要记录什么？"/></label><span className="cover-label">选择封面</span><div className="cover-options">{["linear-gradient(145deg,#1677ff,#75a7ff)","linear-gradient(145deg,#7d4fe3,#b597ff)","linear-gradient(145deg,#09a477,#72d5b5)","linear-gradient(145deg,#f05a72,#ff9aac)","linear-gradient(145deg,#233654,#55769f)"].map((cover) => <button key={cover} className={spaceCover === cover ? "selected" : ""} style={{ background: cover }} onClick={() => setSpaceCover(cover)}/>)}</div><div className="modal-footer"><button onClick={() => setCreateOpen(false)}>取消</button><button className="primary" disabled={!spaceTitle.trim()} onClick={() => void submitSpace()}>创建知识库</button></div></div></div>}
  </div>;
  return <div className={`knowledge-page knowledge-view-${viewMode}`}>
    <header className="knowledge-header"><div className="knowledge-title-with-back"><button onClick={() => { changeViewMode("normal"); setSpaceId(null); setQuery(""); }}><ArrowLeft size={20}/></button><div><h1>{currentSpace.title}</h1><p>{currentSpace.description || "沉淀工作经验、SOP 和学习笔记"}</p></div></div><div className="knowledge-actions"><div className="knowledge-view-switch"><button className={viewMode === "normal" ? "active" : ""} onClick={() => changeViewMode("normal")} title="普通模式"><Minimize2 size={16}/><span>普通</span></button><button className={viewMode === "focus" ? "active" : ""} onClick={() => changeViewMode("focus")} title="专注模式"><PanelLeftClose size={16}/><span>专注</span></button><button className={viewMode === "fullscreen" ? "active" : ""} onClick={() => changeViewMode("fullscreen")} title="全屏编辑"><Maximize2 size={16}/><span>全屏</span></button></div><label><Search size={18}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索文档内容…"/></label><div className="knowledge-create-wrap"><button className="primary" onClick={() => setNewMenu(!newMenu)}><Plus size={18}/>新建<ChevronDown size={15}/></button>{newMenu && <div className="knowledge-create-menu"><button onClick={() => void create("document")}><FilePlus2 size={16}/>新建文档</button><button onClick={() => void create("table")}><Table2 size={16}/>新建表格</button><button onClick={() => void create("folder")}><FolderPlus size={16}/>新建文件夹</button></div>}</div></div></header>
    {store.error && <div className="knowledge-error">{store.error}<button onClick={() => store.setError("")}>×</button></div>}
    <div className={`knowledge-workspace ${treeCollapsed ? "tree-collapsed" : ""} ${overlayOpen ? "tree-overlay-open" : ""}`} style={viewMode === "focus" ? { gridTemplateColumns: treeCollapsed ? "0 minmax(0,1fr)" : `${treeWidth}px minmax(0,1fr)` } : undefined}>
      {viewMode === "fullscreen" && <div className="knowledge-fullscreen-controls"><button onClick={() => setOverlayOpen(!overlayOpen)}><PanelLeftOpen size={17}/>目录</button><button onClick={() => changeViewMode("focus")}><Minimize2 size={17}/>退出全屏</button></div>}
      {viewMode === "fullscreen" && overlayOpen && <button className="knowledge-tree-overlay-backdrop" aria-label="关闭目录" onClick={() => setOverlayOpen(false)}/>}
      {viewMode === "focus" && treeCollapsed && <button className="knowledge-tree-reopen" onClick={() => setTreeCollapsed(false)}><PanelLeftOpen size={17}/><span>目录</span></button>}
      <aside className="knowledge-tree-panel" style={viewMode === "fullscreen" ? { width: treeWidth } : undefined} onClick={(event) => event.stopPropagation()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { const id = event.dataTransfer.getData("text/knowledge-id"); if (id && event.target === event.currentTarget) void store.moveNode(id, spaceId); }}>
        {viewMode !== "normal" && <button className="knowledge-tree-resizer" aria-label="拖拽调整目录宽度" onPointerDown={startTreeResize}/>}
        <div className="knowledge-tree-heading"><span><BookOpen size={16}/>目录</span><div><button onClick={() => void create("document")} title="新建文档"><FilePlus2 size={16}/></button><button onClick={() => void create("table")} title="新建表格"><Table2 size={16}/></button><button onClick={() => void create("folder")} title="新建文件夹"><FolderPlus size={16}/></button>{viewMode === "focus" && <button onClick={() => setTreeCollapsed(true)} title="收起目录"><PanelLeftClose size={16}/></button>}{viewMode === "fullscreen" && <button onClick={() => setOverlayOpen(false)} title="关闭目录"><X size={16}/></button>}</div></div>
        {query ? <div className="knowledge-search-results"><strong>搜索结果 · {results.length}</strong>{results.map((node) => <button key={node.id} onClick={() => store.setSelectedId(node.id)}><FileText size={16}/><span><b>{node.title}</b><small>{node.plainText?.slice(0, 55) || "暂无正文"}</small></span></button>)}{!results.length && <p>没有找到相关文档</p>}</div> : <div className="knowledge-tree" onContextMenu={(event) => { if (event.target === event.currentTarget) openContextMenu(event, null); }}>{roots.map((node) => <TreeNode key={node.id} node={node} nodes={spaceNodes} selectedId={store.selectedId} expanded={expanded} onToggle={(id) => setExpanded((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; })} onSelect={store.setSelectedId} onRename={rename} onTrash={(id) => void store.trashNode(id)} onMove={(id, parentId) => void store.moveNode(id, parentId)} onCreateChild={(parentId, type) => void create(type, parentId)} onContextMenu={(event, node) => openContextMenu(event, node.id)}/>)}</div>}
        <button className={`knowledge-trash-button ${showTrash ? "active" : ""}`} onClick={() => { setShowTrash(!showTrash); setTrashBulkMode(false); setSelectedTrashIds(new Set()); }} onContextMenu={(event) => { event.preventDefault(); setContextMenu({ x: Math.min(event.clientX, window.innerWidth - 205), y: Math.min(event.clientY, window.innerHeight - 150), nodeId: null, trashRoot: true }); }}><Trash2 size={16}/>回收站<span>{store.nodes.filter((n) => n.deletedAt).length}</span></button>
      </aside>
      <main className="knowledge-main">{showTrash ? <div className="knowledge-recycle"><div className="knowledge-recycle-head"><div><h2>回收站 · {store.nodes.filter((node) => node.deletedAt).length}项</h2><p>删除的文档和文件夹会保留在这里。</p></div><div className="knowledge-trash-actions">{trashBulkMode ? <><button onClick={() => setSelectedTrashIds(selectedTrashIds.size === recycleRoots.length ? new Set() : new Set(recycleRoots.map((node) => node.id)))}>{selectedTrashIds.size === recycleRoots.length && recycleRoots.length ? "取消全选" : "全选"}</button><span>已选 {selectedTrashIds.size} 项</span><button disabled={!selectedTrashIds.size} onClick={() => { void store.restoreNodes([...selectedTrashIds]); setSelectedTrashIds(new Set()); }}>恢复所选</button><button className="danger" disabled={!selectedTrashIds.size} onClick={() => { const ids = [...selectedTrashIds]; if (window.confirm(`永久删除选中的 ${ids.length} 个项目？此操作不可恢复。`)) { void store.deleteNodesForever(ids); setSelectedTrashIds(new Set()); } }}>永久删除</button><button onClick={() => { setTrashBulkMode(false); setSelectedTrashIds(new Set()); }}>退出</button></> : <><button onClick={() => setTrashBulkMode(true)}>批量管理</button><button disabled={!recycleRoots.length} onClick={() => void store.restoreAllTrash()}>恢复全部</button><button className="danger" disabled={!recycleRoots.length} onClick={confirmEmptyKnowledgeTrash}>清空回收站</button></>}</div></div>{recycleRoots.map((node) => <div key={node.id}>{trashBulkMode && <input type="checkbox" checked={selectedTrashIds.has(node.id)} onChange={() => setSelectedTrashIds((current) => { const next = new Set(current); if (next.has(node.id)) next.delete(node.id); else next.add(node.id); return next; })}/>}<span>{node.type === "folder" ? <Folder size={18}/> : <FileText size={18}/>}<b>{node.title}</b></span><div><button onClick={() => void store.restoreNode(node.id)}>恢复</button><button className="danger" onClick={() => { if (window.confirm(`永久删除“${node.title}”？此操作无法撤销。`)) void store.deleteForever(node.id); }}>永久删除</button></div></div>)}{!store.nodes.some((node) => node.deletedAt) && <div className="knowledge-empty recycle-empty"><Trash2 size={34}/><p>回收站是空的</p></div>}</div> : store.selected?.type === "document" && store.selected.documentKind === "table" ? <SpreadsheetEditor key={store.selected.id} node={store.selected} onUpdate={store.updateNode}/> : store.selected?.type === "document" ? <DocumentEditor key={store.selected.id} node={store.selected} onSave={store.saveDocument} setError={store.setError}/> : <div className="knowledge-empty"><BookOpen size={38}/><h2>开始记录知识</h2><p>从左侧选择文档，或新建一篇文档。</p><button onClick={() => void create("document")}>新建文档</button></div>}</main>
    </div>
    {contextMenu && <div className="knowledge-context-menu" style={{ left: contextMenu.x, top: contextMenu.y }} onContextMenu={(event) => event.preventDefault()}>{contextMenu.trashRoot ? <><button onClick={() => { setShowTrash(true); setContextMenu(null); }}><Trash2 size={15}/>打开回收站</button><button disabled={!recycleRoots.length} onClick={() => { void store.restoreAllTrash(); setContextMenu(null); }}><ArchiveRestore size={15}/>恢复全部</button><button className="danger" disabled={!recycleRoots.length} onClick={() => { setContextMenu(null); confirmEmptyKnowledgeTrash(); }}><Trash2 size={15}/>清空回收站</button></> : <>{contextNode?.type === "folder" && <><button onClick={() => { void create("document", contextNode.id); setContextMenu(null); }}><FilePlus2 size={15}/>新建文档</button><button onClick={() => { void create("table", contextNode.id); setContextMenu(null); }}><Table2 size={15}/>新建表格</button><button onClick={() => { void create("folder", contextNode.id); setContextMenu(null); }}><FolderPlus size={15}/>新建子文件夹</button><i/></>}{!contextNode && <><button onClick={() => { void create("document", spaceId ?? undefined); setContextMenu(null); }}><FilePlus2 size={15}/>新建文档</button><button onClick={() => { void create("table", spaceId ?? undefined); setContextMenu(null); }}><Table2 size={15}/>新建表格</button><button onClick={() => { void create("folder", spaceId ?? undefined); setContextMenu(null); }}><FolderPlus size={15}/>新建文件夹</button><i/></>}{contextNode && <><button onClick={() => { rename(contextNode); setContextMenu(null); }}>重命名</button><button onClick={() => { void store.duplicateNode(contextNode.id); setContextMenu(null); }}><Copy size={15}/>创建副本</button><button onClick={() => startMove(contextNode)}><MoveRight size={15}/>移动到…</button><i/>{contextNode.type === "folder" && <button onClick={() => { setExpanded((current) => { const next = new Set(current); if (next.has(contextNode.id)) next.delete(contextNode.id); else next.add(contextNode.id); return next; }); setContextMenu(null); }}>{expanded.has(contextNode.id) ? "收起文件夹" : "展开文件夹"}</button>}<button className="danger" onClick={() => { void store.trashNode(contextNode.id); setContextMenu(null); }}><Trash2 size={15}/>移到回收站</button></>}{!contextNode && <><button onClick={() => { setExpanded(new Set(spaceNodes.filter((node) => node.type === "folder").map((node) => node.id))); setContextMenu(null); }}>全部展开</button><button onClick={() => { setExpanded(new Set()); setContextMenu(null); }}>全部收起</button></>}</>}</div>}
    {moveTargetId && <div className="knowledge-modal-backdrop"><div className="knowledge-move-modal"><h3>移动到</h3><p>选择目标文件夹</p><select value={moveParentId} onChange={(event) => setMoveParentId(event.target.value)}><option value={spaceId ?? ""}>{currentSpace.title}（根目录）</option>{spaceNodes.filter((node) => node.type === "folder" && node.id !== moveTargetId && !isInside(node, moveTargetId)).map((folder) => <option key={folder.id} value={folder.id}>{folder.title}</option>)}</select><div><button onClick={() => setMoveTargetId(null)}>取消</button><button className="primary" onClick={() => { void store.moveNode(moveTargetId, moveParentId || spaceId); setMoveTargetId(null); }}>移动</button></div></div></div>}
  </div>;
}
