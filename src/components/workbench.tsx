"use client";

import { useState } from "react";
import { Construction } from "lucide-react";
import { useTasks } from "@/hooks/use-tasks";
import { Sidebar, type PageKey } from "./sidebar";
import { TodayTasks } from "./today-tasks";
import { Topbar } from "./topbar";
import { FileLibraryPage } from "./file-library-page";
import { KnowledgeBasePage, type KnowledgeViewMode } from "./knowledge-base-page";
import { InboxPage } from "./inbox-page";
import { useInbox } from "@/hooks/use-inbox";

const pageNames: Record<PageKey, string> = {
  home: "首页", tasks: "今日任务", inbox: "收集箱", knowledge: "知识库", files: "文件库", trash: "回收站", tables: "数据表", settings: "设置",
};

export function Workbench() {
  const [page, setPage] = useState<PageKey>("home");
  const [knowledgeViewMode, setKnowledgeViewMode] = useState<KnowledgeViewMode>("normal");
  const taskStore = useTasks();
  const inboxStore = useInbox();

  const changePage = (nextPage: PageKey) => {
    setPage(nextPage);
    if (nextPage !== "knowledge") setKnowledgeViewMode("normal");
  };

  return (
    <div className={`app-shell ${page === "knowledge" ? `knowledge-shell-${knowledgeViewMode}` : ""}`}>
      <Sidebar active={page} taskCount={taskStore.counts.all} inboxCount={inboxStore.pendingCount} onChange={changePage} />
      <main className="main-content">
        {page === "home" && <><Topbar /><TodayTasks store={taskStore} onViewAll={() => setPage("tasks")} /></>}
        {page === "tasks" && <><Topbar /><TodayTasks store={taskStore} expanded /></>}
        {page === "files" && <FileLibraryPage />}
        {page === "trash" && <FileLibraryPage initialShowTrash />}
        {page === "knowledge" && <KnowledgeBasePage onViewModeChange={setKnowledgeViewMode} />}
        {page === "inbox" && <InboxPage store={inboxStore} taskStore={taskStore} />}
        {page !== "home" && page !== "tasks" && page !== "inbox" && page !== "files" && page !== "trash" && page !== "knowledge" && (
          <div className="placeholder-page">
            <span><Construction size={28} /></span>
            <h1>{pageNames[page]}</h1>
            <p>这个模块将在首页确认后继续开发。</p>
            <button onClick={() => setPage("home")}>返回首页</button>
          </div>
        )}
      </main>
    </div>
  );
}
