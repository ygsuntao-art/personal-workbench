"use client";

import { useEffect, useMemo, useState } from "react";
import { defaultTasks, type Priority, type Task } from "@/lib/tasks";

const STORAGE_KEY = "personal-workbench.tasks.v1";

export function useTasks() {
  const [tasks, setTasks] = useState<Task[]>(defaultTasks);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const loadSavedTasks = window.setTimeout(() => {
      try {
        const saved = window.localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const migrationTime = Date.now();
          const parsed = JSON.parse(saved) as Task[];
          setTasks(parsed.map((task) => task.completed && !task.completedAt ? { ...task, completedAt: task.createdAt > 1577836800000 ? task.createdAt : migrationTime } : task));
        }
      } catch {
        // Keep the built-in demo data when local storage is unavailable.
      } finally {
        setReady(true);
      }
    }, 0);

    return () => window.clearTimeout(loadSavedTasks);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
    } catch {
      // The prototype remains usable without persistence.
    }
  }, [ready, tasks]);

  const counts = useMemo(() => ({
    all: tasks.length,
    pending: tasks.filter((task) => !task.completed).length,
    important: tasks.filter((task) => task.priority === "important" && !task.completed).length,
    normal: tasks.filter((task) => task.priority === "normal" && !task.completed).length,
    completed: tasks.filter((task) => task.completed).length,
  }), [tasks]);

  const toggleTask = (id: string) => {
    setTasks((current) => current.map((task) => task.id === id ? { ...task, completed: !task.completed, completedAt: task.completed ? undefined : Date.now() } : task));
  };

  const addTask = (task: Omit<Task, "id" | "completed" | "createdAt">) => {
    setTasks((current) => [...current, {
      ...task,
      id: crypto.randomUUID(),
      completed: false,
      createdAt: Date.now(),
    }]);
  };

  const reorderTask = (activeId: string, overId: string) => {
    setTasks((current) => {
      const from = current.findIndex((task) => task.id === activeId);
      const to = current.findIndex((task) => task.id === overId);
      if (from < 0 || to < 0 || from === to) return current;
      const reordered = [...current];
      const [moved] = reordered.splice(from, 1);
      reordered.splice(to, 0, moved);
      return reordered;
    });
  };

  const updatePriority = (id: string, priority: Priority) => {
    setTasks((current) => current.map((task) => task.id === id ? { ...task, priority } : task));
  };

  return { tasks, counts, toggleTask, addTask, reorderTask, updatePriority };
}

export type TaskStore = ReturnType<typeof useTasks>;
