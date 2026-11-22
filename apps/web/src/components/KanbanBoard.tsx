'use client';

import { useEffect, useState } from 'react';
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  useDroppable,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { generateKeyBetween } from 'fractional-indexing';
import { Plus, GripVertical, ShieldAlert } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:4000';

type Status = 'BACKLOG' | 'TODO' | 'IN_PROGRESS' | 'DONE';
export type Role = 'OWNER' | 'EDITOR' | 'VIEWER';

interface Task {
  id: string;
  workspaceId: string;
  title: string;
  status: Status;
  position: string;
}

const COLUMNS: { id: Status; label: string; badge: string }[] = [
  { id: 'BACKLOG', label: 'Backlog', badge: 'bg-neutral-800 text-neutral-300' },
  { id: 'TODO', label: 'To Do', badge: 'bg-blue-950 text-blue-300' },
  { id: 'IN_PROGRESS', label: 'In Progress', badge: 'bg-amber-950 text-amber-300' },
  { id: 'DONE', label: 'Done', badge: 'bg-emerald-950 text-emerald-300' },
];

function SortableCard({ task, disabled }: { task: Task; disabled: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    data: { task },
    disabled,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`group flex items-start gap-2 p-3 rounded-lg border bg-neutral-900/90 border-neutral-800 transition ${
        disabled
          ? 'cursor-not-allowed opacity-80'
          : 'hover:border-neutral-700 cursor-grab active:cursor-grabbing'
      } ${isDragging ? 'opacity-50 ring-2 ring-blue-500' : ''}`}
    >
      <GripVertical className="w-4 h-4 text-neutral-600 mt-0.5 shrink-0 group-hover:text-neutral-400" />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-neutral-100 font-medium break-words">{task.title}</p>
        <span className="text-[10px] font-mono text-neutral-500 mt-1 block">
          pos: {task.position}
        </span>
      </div>
    </div>
  );
}

function KanbanColumn({
  col,
  colTasks,
  disabled,
}: {
  col: { id: Status; label: string; badge: string };
  colTasks: Task[];
  disabled: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: col.id });

  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col rounded-xl bg-neutral-950 border p-3 min-h-[380px] transition ${
        isOver ? 'border-blue-500 bg-neutral-900/50' : 'border-neutral-800/80'
      }`}
    >
      <div className="flex items-center justify-between mb-3 px-1">
        <span className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
          {col.label}
        </span>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${col.badge}`}>
          {colTasks.length}
        </span>
      </div>

      <SortableContext
        id={col.id}
        items={colTasks.map((t) => t.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="flex-1 space-y-2.5 min-h-[300px]">
          {colTasks.map((task) => (
            <SortableCard key={task.id} task={task} disabled={disabled} />
          ))}
          {colTasks.length === 0 && (
            <div className="h-24 rounded-lg border border-dashed border-neutral-800 flex items-center justify-center text-xs text-neutral-600">
              Drop task here
            </div>
          )}
        </div>
      </SortableContext>
    </div>
  );
}

export function KanbanBoard({
  workspaceId,
  role,
}: {
  workspaceId: string;
  role: Role;
}) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [newTitle, setNewTitle] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const isReadOnly = role === 'VIEWER';

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  useEffect(() => {
    fetch(`${API_URL}/api/workspaces/${workspaceId}/tasks`)
      .then((res) => res.json())
      .then((data) => setTasks(data));

    const ws = new WebSocket(`${WS_URL}/ws/tasks/${workspaceId}`);
    ws.onmessage = (event) => {
      const payload = JSON.parse(event.data);
      if (payload.type === 'TASK_CREATED') {
        setTasks((prev) =>
          prev.some((t) => t.id === payload.task.id) ? prev : [...prev, payload.task]
        );
      } else if (payload.type === 'TASK_MOVED') {
        setTasks((prev) =>
          prev
            .map((t) => (t.id === payload.task.id ? payload.task : t))
            .sort((a, b) => (a.position < b.position ? -1 : a.position > b.position ? 1 : 0))
        );
      }
    };

    return () => ws.close();
  }, [workspaceId]);

  async function handleCreateTask(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setErrorMsg(null);

    const title = newTitle.trim();
    const res = await fetch(`${API_URL}/api/workspaces/${workspaceId}/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-pulse-role': role,
      },
      body: JSON.stringify({ title, status: 'TODO' }),
    });

    if (!res.ok) {
      const err = await res.json();
      setErrorMsg(err.error || 'Permission denied');
      return;
    }

    setNewTitle('');
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeTask = tasks.find((t) => t.id === active.id);
    if (!activeTask) return;

    const overTask = tasks.find((t) => t.id === over.id);
    const targetStatus: Status = overTask
      ? overTask.status
      : (over.id as Status);

    const columnTasks = tasks
      .filter((t) => t.status === targetStatus && t.id !== activeTask.id)
      .sort((a, b) => (a.position < b.position ? -1 : 1));

    const overIndex = overTask ? columnTasks.findIndex((t) => t.id === overTask.id) : columnTasks.length;
    const prevPos = overIndex > 0 ? columnTasks[overIndex - 1].position : null;
    const nextPos = overIndex >= 0 && overIndex < columnTasks.length ? columnTasks[overIndex].position : null;

    const optimisticPos = generateKeyBetween(prevPos, nextPos);
    const previousTasks = [...tasks];

    setTasks((prev) =>
      prev
        .map((t) =>
          t.id === activeTask.id ? { ...t, status: targetStatus, position: optimisticPos } : t
        )
        .sort((a, b) => (a.position < b.position ? -1 : 1))
    );

    const res = await fetch(`${API_URL}/api/tasks/${activeTask.id}/move`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-pulse-role': role,
      },
      body: JSON.stringify({
        status: targetStatus,
        prevPosition: prevPos,
        nextPosition: nextPos,
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      setErrorMsg(err.error || 'Permission denied');
      setTasks(previousTasks);
    }
  }

  return (
    <div className="w-full max-w-6xl mx-auto">
      {errorMsg && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-900 bg-red-950/60 px-4 py-2.5 text-xs text-red-300">
          <ShieldAlert className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      <form onSubmit={handleCreateTask} className="flex gap-2 mb-6 max-w-md">
        <input
          type="text"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder={
            isReadOnly
              ? 'Read-only mode (Switch role to Owner/Editor to add tasks)'
              : 'Add a new engineering task...'
          }
          className="flex-1 px-3.5 py-2 rounded-lg bg-neutral-900 border border-neutral-800 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-blue-500"
        />
        <button
          type="submit"
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-sm font-medium text-white transition"
        >
          <Plus className="w-4 h-4" />
          Add Task
        </button>
      </form>

      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={handleDragEnd}>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {COLUMNS.map((col) => {
            const colTasks = tasks
              .filter((t) => t.status === col.id)
              .sort((a, b) => (a.position < b.position ? -1 : 1));

            return (
              <KanbanColumn
                key={col.id}
                col={col}
                colTasks={colTasks}
                disabled={isReadOnly}
              />
            );
          })}
        </div>
      </DndContext>
    </div>
  );
}