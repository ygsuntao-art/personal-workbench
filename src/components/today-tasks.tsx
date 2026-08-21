"use client";

import { useMemo, useState } from "react";
import { ArrowRight, ChevronDown, ChevronRight, Plus } from "lucide-react";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { TaskStore } from "@/hooks/use-tasks";
import { InlineTaskForm } from "./inline-task-form";
import { TaskRow } from "./task-row";
import type { Task } from "@/lib/tasks";

type Filter = "pending" | "important" | "normal" | "completed";

function completedGroupLabel(task: Task) {
  if (!task.completedAt) return "历史完成";
  const completed = new Date(task.completedAt);
  const today = new Date();
  const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const startCompleted = new Date(completed.getFullYear(), completed.getMonth(), completed.getDate()).getTime();
  const dayDifference = Math.round((startToday - startCompleted) / 86400000);
  if (dayDifference === 0) return "今天";
  if (dayDifference === 1) return "昨天";
  return new Intl.DateTimeFormat("zh-CN", { year: completed.getFullYear() === today.getFullYear() ? undefined : "numeric", month: "long", day: "numeric" }).format(completed);
}

export function TodayTasks({ store, expanded = false, onViewAll }: { store: TaskStore; expanded?: boolean; onViewAll?: () => void }) {
  const { tasks, counts, toggleTask, addTask, reorderTask, updatePriority } = store;
  const [filter, setFilter] = useState<Filter>("pending");
  const [showForm, setShowForm] = useState(false);
  const [openCompletedGroups, setOpenCompletedGroups] = useState<Set<string>>(new Set(["今天", "昨天"]));
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const finishDrag = ({ active, over }: DragEndEvent) => {
    if (over && active.id !== over.id) reorderTask(String(active.id), String(over.id));
  };

  const visibleTasks = useMemo(() => {
    const filtered = tasks.filter((task) => {
      if (filter === "completed") return task.completed;
      if (filter === "important") return task.priority === "important" && !task.completed;
      if (filter === "normal") return task.priority === "normal" && !task.completed;
      return !task.completed;
    });
    return expanded ? filtered : filtered.slice(0, 5);
  }, [expanded, filter, tasks]);

  const completedGroups = useMemo(() => {
    if (filter !== "completed") return [];
    const groups = new Map<string, Task[]>();
    [...visibleTasks].sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0)).forEach((task) => {
      const label = completedGroupLabel(task);
      groups.set(label, [...(groups.get(label) ?? []), task]);
    });
    return [...groups.entries()];
  }, [filter, visibleTasks]);

  const tabs: { key: Filter; label: string; count: number }[] = [
    { key: "pending", label: "待完成", count: counts.pending },
    { key: "important", label: "重点", count: counts.important },
    { key: "normal", label: "普通", count: counts.normal },
    { key: "completed", label: "已完成", count: counts.completed },
  ];

  return (
    <section className={`tasks-card ${expanded ? "expanded" : ""}`}>
      <div className="tasks-heading">
        <h2>今日任务</h2>
        {!expanded && <button className="text-link" onClick={onViewAll}>查看全部任务（{counts.all}） <ArrowRight size={18} /></button>}
      </div>
      <div className="task-tabs" role="tablist">
        {tabs.map((tab) => (
          <button key={tab.key} className={`${filter === tab.key ? "selected" : ""} ${tab.key === "important" && tab.count > 0 ? "important-tab" : ""} ${tab.count === 0 ? "zero-count" : ""}`} onClick={() => setFilter(tab.key)}>
            {tab.label} <span>{tab.count}</span>
          </button>
        ))}
      </div>
      <div className="task-list">
        {filter === "completed" && completedGroups.length > 0 && <div className="completed-group-actions"><button onClick={() => setOpenCompletedGroups(new Set(completedGroups.map(([label]) => label)))}>全部展开</button><button onClick={() => setOpenCompletedGroups(new Set())}>全部收起</button></div>}
        <DndContext id="today-tasks-sortable" sensors={sensors} collisionDetection={closestCenter} onDragEnd={finishDrag}>
          <SortableContext items={visibleTasks.map((task) => task.id)} strategy={verticalListSortingStrategy}>
            {filter === "completed" ? completedGroups.map(([label, groupedTasks]) => { const open = openCompletedGroups.has(label); return <div className="completed-task-group" key={label}><button className="completed-group-title" onClick={() => setOpenCompletedGroups((current) => { const next = new Set(current); if (next.has(label)) next.delete(label); else next.add(label); return next; })}>{open ? <ChevronDown size={16}/> : <ChevronRight size={16}/>}<span>{label}</span><em>{groupedTasks.length}</em></button>{open && groupedTasks.map((task) => <TaskRow key={task.id} task={task} onToggle={toggleTask} onPriorityChange={updatePriority} />)}</div>; }) : visibleTasks.map((task) => <TaskRow key={task.id} task={task} onToggle={toggleTask} onPriorityChange={updatePriority} />)}
          </SortableContext>
        </DndContext>
        {visibleTasks.length === 0 && <div className="empty-tasks">这个分类里还没有任务</div>}
      </div>
      <div className="tasks-footer">
        {showForm ? <InlineTaskForm onClose={() => setShowForm(false)} onAdd={addTask} /> : <button className="add-task" onClick={() => setShowForm(true)}><Plus size={21} /> 添加任务</button>}
        {!expanded && <button className="text-link footer-link" onClick={onViewAll}>查看全部任务（{counts.all}） <ArrowRight size={18} /></button>}
      </div>
    </section>
  );
}
