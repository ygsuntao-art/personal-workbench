"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { JSONContent } from "@tiptap/react";
import { createKnowledgeNode, descendants, type KnowledgeNode, type KnowledgeNodeType } from "@/lib/knowledge-base";
import { deleteKnowledgeNodes, loadKnowledgeNodes, saveKnowledgeNode, saveKnowledgeNodes } from "@/lib/knowledge-store";

export function useKnowledgeBase() {
  const [nodes, setNodes] = useState<KnowledgeNode[]>([]);
  const nodesRef = useRef<KnowledgeNode[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const initialized = useRef(false);

  useEffect(() => { if (initialized.current) return; initialized.current = true; loadKnowledgeNodes().then((stored) => {
    if (stored.length) { nodesRef.current = stored; setNodes(stored); setSelectedId(stored.find((n) => n.type === "document" && !n.deletedAt)?.id ?? null); }
    else {
      const folder = createKnowledgeNode("folder", null, 0); folder.title = "我的知识库";
      const doc = createKnowledgeNode("document", folder.id, 0); doc.title = "欢迎使用知识库";
      doc.contentJson = { type: "doc", content: [{ type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "从这里开始记录" }] }, { type: "paragraph", content: [{ type: "text", text: "左侧管理多级目录，右侧直接编辑内容，停止输入后自动保存。" }] }] };
      doc.plainText = "从这里开始记录 左侧管理多级目录，右侧直接编辑内容，停止输入后自动保存。";
      nodesRef.current = [folder, doc]; setNodes([folder, doc]); setSelectedId(doc.id); void saveKnowledgeNodes([folder, doc]);
    }
  }).catch(() => setError("知识库初始化失败，请刷新页面重试")).finally(() => setLoading(false)); }, []);

  const activeNodes = useMemo(() => nodes.filter((node) => !node.deletedAt), [nodes]);
  const selected = nodes.find((node) => node.id === selectedId && !node.deletedAt) ?? null;

  const createNode = useCallback(async (type: KnowledgeNodeType, parentId: string | null, initial: Partial<KnowledgeNode> = {}) => {
    const siblings = nodes.filter((node) => node.parentId === parentId && !node.deletedAt);
    const node = { ...createKnowledgeNode(type, parentId, siblings.length), ...initial };
    nodesRef.current = [...nodesRef.current, node]; setNodes(nodesRef.current); if (type === "document") setSelectedId(node.id);
    await saveKnowledgeNode(node); return node;
  }, [nodes]);

  const updateNode = useCallback(async (id: string, patch: Partial<KnowledgeNode>) => {
    const current = nodesRef.current.find((node) => node.id === id);
    if (!current) return;
    const saved = { ...current, ...patch, updatedAt: Date.now() };
    nodesRef.current = nodesRef.current.map((node) => node.id === id ? saved : node);
    setNodes(nodesRef.current);
    await saveKnowledgeNode(saved);
  }, []);

  const saveDocument = useCallback(async (id: string, title: string, contentJson: JSONContent, plainText: string) => {
    await updateNode(id, { title: title.trim() || "无标题文档", contentJson, plainText, lastSavedAt: Date.now() });
  }, [updateNode]);

  const trashNode = useCallback(async (id: string) => {
    const ids = descendants(nodes, id); ids.add(id); const now = Date.now();
    const changed = nodes.filter((node) => ids.has(node.id)).map((node) => ({ ...node, originalParentId: node.parentId, deletedAt: now }));
    nodesRef.current = nodesRef.current.map((node) => changed.find((item) => item.id === node.id) ?? node); setNodes(nodesRef.current);
    if (ids.has(selectedId ?? "")) setSelectedId(null); await saveKnowledgeNodes(changed);
  }, [nodes, selectedId]);

  const moveNode = useCallback(async (id: string, parentId: string | null) => {
    if (id === parentId || descendants(nodes, id).has(parentId ?? "")) { setError("不能移动到自身或下级目录"); return; }
    await updateNode(id, { parentId, sortOrder: nodes.filter((n) => n.parentId === parentId && !n.deletedAt).length });
  }, [nodes, updateNode]);

  const restoreNode = useCallback(async (id: string) => {
    const ids = descendants(nodesRef.current, id); ids.add(id);
    const changed = nodesRef.current.filter((node) => ids.has(node.id)).map((node) => ({ ...node, parentId: node.originalParentId, originalParentId: null, deletedAt: null, updatedAt: Date.now() }));
    nodesRef.current = nodesRef.current.map((node) => changed.find((item) => item.id === node.id) ?? node); setNodes(nodesRef.current); await saveKnowledgeNodes(changed);
  }, []);

  const deleteForever = useCallback(async (id: string) => {
    const ids = descendants(nodesRef.current, id); ids.add(id);
    nodesRef.current = nodesRef.current.filter((node) => !ids.has(node.id)); setNodes(nodesRef.current); await deleteKnowledgeNodes([...ids]);
  }, []);

  const restoreNodes = useCallback(async (rootIds: string[]) => {
    const ids = new Set<string>(); rootIds.forEach((id) => { ids.add(id); descendants(nodesRef.current, id).forEach((childId) => ids.add(childId)); });
    const changed = nodesRef.current.filter((node) => ids.has(node.id)).map((node) => ({ ...node, parentId: node.originalParentId, originalParentId: null, deletedAt: null, updatedAt: Date.now() }));
    nodesRef.current = nodesRef.current.map((node) => changed.find((item) => item.id === node.id) ?? node); setNodes(nodesRef.current); await saveKnowledgeNodes(changed);
  }, []);

  const deleteNodesForever = useCallback(async (rootIds: string[]) => {
    const ids = new Set<string>(); rootIds.forEach((id) => { ids.add(id); descendants(nodesRef.current, id).forEach((childId) => ids.add(childId)); });
    nodesRef.current = nodesRef.current.filter((node) => !ids.has(node.id)); setNodes(nodesRef.current); await deleteKnowledgeNodes([...ids]);
  }, []);

  const restoreAllTrash = useCallback(async () => {
    const changed = nodesRef.current.filter((node) => node.deletedAt).map((node) => ({ ...node, parentId: node.originalParentId, originalParentId: null, deletedAt: null, updatedAt: Date.now() }));
    nodesRef.current = nodesRef.current.map((node) => changed.find((item) => item.id === node.id) ?? node); setNodes(nodesRef.current); await saveKnowledgeNodes(changed);
  }, []);

  const emptyTrash = useCallback(async () => {
    const ids = nodesRef.current.filter((node) => node.deletedAt).map((node) => node.id);
    nodesRef.current = nodesRef.current.filter((node) => !node.deletedAt); setNodes(nodesRef.current); await deleteKnowledgeNodes(ids);
  }, []);

  const createKnowledgeBase = useCallback(async (title: string, description: string, cover: string) => {
    const node = createKnowledgeNode("folder", null, nodesRef.current.filter((item) => item.parentId === null && !item.deletedAt).length);
    Object.assign(node, { title, description, cover, isKnowledgeBase: true, pinned: false, lastOpenedAt: Date.now() });
    nodesRef.current = [...nodesRef.current, node]; setNodes(nodesRef.current); await saveKnowledgeNode(node); return node;
  }, []);

  const duplicateNode = useCallback(async (id: string) => {
    const source = nodesRef.current.find((node) => node.id === id);
    if (!source) return null;
    const sourceIds = descendants(nodesRef.current, id); sourceIds.add(id);
    const originals = nodesRef.current.filter((node) => sourceIds.has(node.id)).sort((a, b) => a.createdAt - b.createdAt);
    const idMap = new Map(originals.map((node) => [node.id, crypto.randomUUID()]));
    const now = Date.now();
    const copies = originals.map((node) => ({ ...node, id: idMap.get(node.id)!, parentId: node.id === id ? node.parentId : idMap.get(node.parentId ?? "") ?? node.parentId, title: node.id === id ? `${node.title} 副本` : node.title, createdAt: now, updatedAt: now, deletedAt: null, originalParentId: null }));
    nodesRef.current = [...nodesRef.current, ...copies]; setNodes(nodesRef.current); await saveKnowledgeNodes(copies);
    const rootCopy = copies.find((node) => node.id === idMap.get(id)) ?? null;
    if (rootCopy?.type === "document") setSelectedId(rootCopy.id);
    return rootCopy;
  }, []);

  return { nodes, activeNodes, selected, selectedId, loading, error, setError, setSelectedId, createNode, createKnowledgeBase, duplicateNode, updateNode, saveDocument, trashNode, moveNode, restoreNode, restoreNodes, deleteForever, deleteNodesForever, restoreAllTrash, emptyTrash };
}
