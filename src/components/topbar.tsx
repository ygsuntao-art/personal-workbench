"use client";

import { Bell, ChevronDown, Search } from "lucide-react";

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 11) return "早上好";
  if (hour < 14) return "中午好";
  if (hour < 18) return "下午好";
  return "晚上好";
}

export function Topbar() {
  const date = new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "long", day: "numeric", weekday: "long" }).format(new Date());

  return (
    <header className="topbar">
      <div className="greeting">
        <h1>{getGreeting()}，太阳Ygusn <span>👋</span></h1>
        <p>{date}</p>
      </div>
      <div className="top-actions">
        <label className="search-box">
          <Search size={21} />
          <input aria-label="全局搜索" placeholder="搜索任务、文档、文件、数据等..." />
          <kbd>⌘K</kbd>
        </label>
        <button className="icon-button" aria-label="通知">
          <Bell size={23} />
          <span className="notice-count">5</span>
        </button>
        <button className="profile" aria-label="个人菜单">
          <span className="avatar">太阳</span>
          <ChevronDown size={17} />
        </button>
      </div>
    </header>
  );
}
