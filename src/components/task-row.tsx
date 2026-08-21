"use client";

import { Check, GripVertical } from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { categoryColors, type Priority, type Task } from "@/lib/tasks";

export function TaskRow({ task, onToggle, onPriorityChange }: {
  task: Task;
  onToggle: (id: string) => void;
  onPriorityChange: (id: string, priority: Priority) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });
  const style = { transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 2 : undefined };

  return (
    <div ref={setNodeRef} style={style} className={`task-row ${task.completed ? "done" : ""} ${isDragging ? "dragging" : ""}`}>
      <button className="drag-handle" aria-label={`拖动排序 ${task.title}`} {...attributes} {...listeners}><GripVertical size={17} /></button>
      <button className="checkbox" onClick={() => onToggle(task.id)} aria-label={task.completed ? `取消完成 ${task.title}` : `完成 ${task.title}`}>
        {task.completed && <Check size={14} strokeWidth={3} />}
      </button>
      <div className="task-main">
        <span className="task-title">{task.title}</span>
        <span className={`category-tag ${categoryColors[task.category] ?? "tag-gray"}`}>{task.category}</span>
      </div>
      <button className={`priority priority-switch ${task.priority}`} onClick={() => onPriorityChange(task.id, task.priority === "important" ? "normal" : "important")} aria-label={`切换为${task.priority === "important" ? "普通" : "重点"}`}>
        {task.priority === "important" ? "重点" : "普通"}
      </button>
      <time>{task.time || "未设时间"}</time>
    </div>
  );
}
