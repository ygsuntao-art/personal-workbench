"use client";

import { Archive, BookOpen, CalendarCheck, Database, Folder, HardDrive, Home, Settings, Trash2 } from "lucide-react";

export type PageKey = "home" | "tasks" | "inbox" | "knowledge" | "files" | "trash" | "tables" | "settings";

const mainItems = [
  { key: "home" as const, label: "首页", icon: Home },
  { key: "tasks" as const, label: "今日任务", icon: CalendarCheck },
  { key: "inbox" as const, label: "收集箱", icon: Archive },
  { key: "knowledge" as const, label: "知识库", icon: BookOpen },
  { key: "files" as const, label: "文件库", icon: Folder },
  { key: "trash" as const, label: "回收站", icon: Trash2 },
  { key: "tables" as const, label: "数据表", icon: Database },
];

export function Sidebar({ active, taskCount, inboxCount, onChange }: { active: PageKey; taskCount: number; inboxCount: number; onChange: (page: PageKey) => void }) {
  return (
    <aside className="sidebar">
      <button className="brand" onClick={() => onChange("home")} aria-label="返回首页">
        <span className="brand-mark"><span /></span>
        <strong>个人工作台</strong>
      </button>

      <nav className="nav-list" aria-label="主导航">
        {mainItems.map(({ key, label, icon: Icon }) => (
          <button key={key} className={`nav-item ${active === key ? "active" : ""}`} onClick={() => onChange(key)}>
            <Icon size={22} strokeWidth={1.9} />
            <span>{label}</span>
            {(key === "tasks" || key === "inbox") && <em>{key === "tasks" ? taskCount : inboxCount}</em>}
          </button>
        ))}
      </nav>

      <div className="nav-divider" />
      <button className={`nav-item settings ${active === "settings" ? "active" : ""}`} onClick={() => onChange("settings")}>
        <Settings size={22} strokeWidth={1.9} />
        <span>设置</span>
      </button>

      <div className="storage-card">
        <div className="storage-title"><HardDrive size={17} /><strong>存储空间</strong></div>
        <div className="storage-track"><span /></div>
        <p>128GB / 500GB</p>
        <button>管理存储空间 <span>›</span></button>
      </div>
    </aside>
  );
}
