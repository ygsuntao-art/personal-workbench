export type Priority = "important" | "normal";

export type Task = {
  id: string;
  title: string;
  category: string;
  priority: Priority;
  time: string;
  completed: boolean;
  createdAt: number;
  completedAt?: number;
};

export const defaultTasks: Task[] = [
  { id: "demo-1", title: "检查昨日投流数据，分析 CPA 异常原因", category: "投流", priority: "important", time: "10:00", completed: false, createdAt: 1 },
  { id: "demo-2", title: "跟进小王提供直播复盘数据", category: "直播", priority: "normal", time: "14:00", completed: false, createdAt: 2 },
  { id: "demo-3", title: "直播话术优化和测试", category: "直播", priority: "important", time: "16:00", completed: false, createdAt: 3 },
  { id: "demo-4", title: "处理公司费用报销审批", category: "公司管理", priority: "normal", time: "17:00", completed: false, createdAt: 4 },
  { id: "demo-5", title: "学习：AI 新工具应用 30 分钟", category: "学习", priority: "normal", time: "21:00", completed: false, createdAt: 5 },
  { id: "demo-6", title: "整理本周工作记录", category: "个人", priority: "normal", time: "09:00", completed: true, createdAt: 6 },
];

export const categoryColors: Record<string, string> = {
  投流: "tag-green",
  直播: "tag-purple",
  公司管理: "tag-teal",
  学习: "tag-blue",
  个人: "tag-gray",
};
