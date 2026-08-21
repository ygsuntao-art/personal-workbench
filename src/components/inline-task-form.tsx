"use client";

import { useEffect, useRef, useState } from "react";
import { Clock3, Flag, Tags } from "lucide-react";
import type { Priority, Task } from "@/lib/tasks";

const LAST_CATEGORY_KEY = "personal-workbench.last-task-category";

export function InlineTaskForm({ onClose, onAdd }: {
  onClose: () => void;
  onAdd: (task: Omit<Task, "id" | "completed" | "createdAt">) => void;
}) {
  const containerRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState(() => {
    if (typeof window === "undefined") return "个人";
    return window.localStorage.getItem(LAST_CATEGORY_KEY) || "个人";
  });
  const [priority, setPriority] = useState<Priority>("normal");
  const [time, setTime] = useState("");

  useEffect(() => {
    inputRef.current?.focus();

    const closeWhenClickingOutside = (event: MouseEvent) => {
      if (!title && !containerRef.current?.contains(event.target as Node)) onClose();
    };

    document.addEventListener("mousedown", closeWhenClickingOutside);
    return () => document.removeEventListener("mousedown", closeWhenClickingOutside);
  }, [onClose, title]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim()) return;
    onAdd({ title: title.trim(), category, priority, time });
    window.localStorage.setItem(LAST_CATEGORY_KEY, category);
    setTitle("");
    inputRef.current?.focus();
  };

  return (
    <form ref={containerRef} className="inline-task-form" onSubmit={submit} onKeyDown={(event) => {
      if (event.key === "Escape") onClose();
    }}>
      <div className="quick-input-row">
        <input ref={inputRef} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="写下任务，按 Enter 添加…" aria-label="任务名称" />
        <button type="submit" disabled={!title.trim()}>添加</button>
      </div>
      <div className="quick-options">
        <label><Tags size={15} /><select aria-label="分类" value={category} onChange={(event) => setCategory(event.target.value)}>
          <option>个人</option><option>直播</option><option>投流</option><option>公司管理</option><option>学习</option>
        </select></label>
        <label><Flag size={15} /><select aria-label="优先级" value={priority} onChange={(event) => setPriority(event.target.value as Priority)}>
          <option value="normal">普通</option><option value="important">重点</option>
        </select></label>
        <label className="free-time"><Clock3 size={15} /><input aria-label="时间" type="text" value={time} onChange={(event) => setTime(event.target.value)} placeholder="时间（可不填）" /></label>
        <span className="keyboard-hint">Enter 添加 · Esc 收起</span>
      </div>
    </form>
  );
}
