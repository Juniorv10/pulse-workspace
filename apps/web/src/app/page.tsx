'use client';

import { useState } from 'react';
import { CollaborativeEditor } from '@/components/CollaborativeEditor';
import { KanbanBoard, Role } from '@/components/KanbanBoard';
import { WorkflowBuilder } from '@/components/WorkflowBuilder';
import { Shield } from 'lucide-react';

export default function Home() {
  const [tab, setTab] = useState<'kanban' | 'doc' | 'workflows'>('kanban');
  const [role, setRole] = useState<Role>('OWNER');

  return (
    <main className="min-h-screen bg-black text-white p-8">
      <div className="max-w-6xl mx-auto mb-8 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 border-b border-neutral-800 pb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Pulse Workspace</h1>
          <p className="text-sm text-neutral-400 mt-0.5">
            Acme Corp • Product Engineering
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Recruiter Sandbox RBAC Role Switcher */}
          <div className="flex items-center gap-2 rounded-lg bg-neutral-900 px-3 py-1.5 border border-neutral-800">
            <Shield className="w-3.5 h-3.5 text-blue-400" />
            <span className="text-xs text-neutral-400">Role:</span>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              className="bg-transparent text-xs font-semibold text-white focus:outline-none cursor-pointer"
            >
              <option value="OWNER" className="bg-neutral-900">Owner (Full Access)</option>
              <option value="EDITOR" className="bg-neutral-900">Editor (No Automations)</option>
              <option value="VIEWER" className="bg-neutral-900">Viewer (Read-Only)</option>
            </select>
          </div>

          <div className="inline-flex rounded-lg bg-neutral-900 p-1 border border-neutral-800">
            <button
              onClick={() => setTab('kanban')}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition ${
                tab === 'kanban'
                  ? 'bg-neutral-800 text-white shadow'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              Kanban Board
            </button>
            <button
              onClick={() => setTab('doc')}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition ${
                tab === 'doc'
                  ? 'bg-neutral-800 text-white shadow'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              Architecture RFC Doc
            </button>
            <button
              onClick={() => setTab('workflows')}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition ${
                tab === 'workflows'
                  ? 'bg-neutral-800 text-white shadow'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              Automations
            </button>
          </div>
        </div>
      </div>

      {tab === 'kanban' && (
        <KanbanBoard
          workspaceId="00000000-0000-0000-0000-000000000100"
          role={role}
        />
      )}
      {tab === 'doc' && (
        <CollaborativeEditor docId="00000000-0000-0000-0000-000000000001" />
      )}
      {tab === 'workflows' && (
        <WorkflowBuilder
          workspaceId="00000000-0000-0000-0000-000000000100"
          role={role}
        />
      )}
    </main>
  );
}