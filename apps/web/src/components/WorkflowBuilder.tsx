'use client';

import { useState, useCallback, useEffect } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  addEdge,
  useNodesState,
  useEdgesState,
  Connection,
  Edge,
  Node,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Save, Zap, CheckCircle2, ShieldAlert } from 'lucide-react';
import type { Role } from './KanbanBoard';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

const INITIAL_NODES: Node[] = [
  {
    id: 'node-1',
    type: 'trigger',
    position: { x: 80, y: 120 },
    data: { label: 'Trigger: Task Status Changed' },
    style: {
      background: '#172554',
      color: '#93c5fd',
      border: '1px solid #1d4ed8',
      borderRadius: '10px',
      padding: '12px 16px',
      fontSize: '13px',
      fontWeight: 600,
    },
  },
  {
    id: 'node-2',
    type: 'condition',
    position: { x: 360, y: 120 },
    data: { label: 'Condition: Status == DONE', targetStatus: 'DONE' },
    style: {
      background: '#451a03',
      color: '#fcd34d',
      border: '1px solid #b45309',
      borderRadius: '10px',
      padding: '12px 16px',
      fontSize: '13px',
      fontWeight: 600,
    },
  },
  {
    id: 'node-3',
    type: 'action',
    position: { x: 640, y: 120 },
    data: {
      label: 'Action: POST Signed Webhook',
      webhookUrl: 'https://httpbin.org/post',
    },
    style: {
      background: '#064e3b',
      color: '#6ee7b7',
      border: '1px solid #047857',
      borderRadius: '10px',
      padding: '12px 16px',
      fontSize: '13px',
      fontWeight: 600,
    },
  },
];

const INITIAL_EDGES: Edge[] = [
  { id: 'e1-2', source: 'node-1', target: 'node-2', animated: true },
  { id: 'e2-3', source: 'node-2', target: 'node-3', animated: true },
];

export function WorkflowBuilder({
  workspaceId,
  role,
}: {
  workspaceId: string;
  role: Role;
}) {
  const [nodes, setNodes, onNodesChange] = useNodesState(INITIAL_NODES);
  const [edges, setEdges, onEdgesChange] = useEdgesState(INITIAL_EDGES);
  const [webhookUrl, setWebhookUrl] = useState('https://httpbin.org/post');
  const [saved, setSaved] = useState(false);
  const [isActiveInDb, setIsActiveInDb] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API_URL}/api/workspaces/${workspaceId}/workflows`)
      .then((res) => res.json())
      .then((data) => {
        if (data.length > 0 && data[0].graphDefinition) {
          setIsActiveInDb(true);
          setNodes(data[0].graphDefinition.nodes || INITIAL_NODES);
          setEdges(data[0].graphDefinition.edges || INITIAL_EDGES);
          const actionNode = data[0].graphDefinition.nodes?.find(
            (n: Node) => n.type === 'action'
          );
          if (actionNode?.data?.webhookUrl) {
            setWebhookUrl(actionNode.data.webhookUrl as string);
          }
        }
      });
  }, [workspaceId, setNodes, setEdges]);

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge({ ...params, animated: true }, eds)),
    [setEdges]
  );

  async function handleSave() {
    setErrorMsg(null);
    const updatedNodes = nodes.map((node) =>
      node.type === 'action'
        ? { ...node, data: { ...node.data, webhookUrl } }
        : node
    );

    const res = await fetch(`${API_URL}/api/workspaces/${workspaceId}/workflows`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-pulse-role': role,
      },
      body: JSON.stringify({
        name: 'Auto-Notify on Done',
        triggerType: 'TASK_MOVED',
        graphDefinition: { nodes: updatedNodes, edges },
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      setErrorMsg(err.error || 'Only OWNER can update workflows');
      return;
    }

    setNodes(updatedNodes);
    setIsActiveInDb(true);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  return (
    <div className="w-full max-w-6xl mx-auto">
      {errorMsg && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-900 bg-red-950/60 px-4 py-2.5 text-xs text-red-300">
          <ShieldAlert className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4 p-4 rounded-xl bg-neutral-950 border border-neutral-800">
        <div className="flex items-center gap-2.5">
          <Zap className="w-5 h-5 text-amber-400" />
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-white">Auto-Notify on Task Completion</h2>
              {isActiveInDb && (
                <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800">
                  ● Active Worker
                </span>
              )}
            </div>
            <p className="text-xs text-neutral-400">
              Drag nodes to rearrange, then save to update the BullMQ background worker.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="url"
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
            placeholder="https://webhook.site/..."
            className="px-3 py-1.5 rounded-lg bg-neutral-900 border border-neutral-800 text-xs text-neutral-200 w-64 focus:outline-none focus:border-blue-500"
          />
          <button
            onClick={handleSave}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white transition"
          >
            {saved ? <CheckCircle2 className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            {saved ? 'Saved!' : 'Save & Activate'}
          </button>
        </div>
      </div>

      <div className="h-[420px] w-full rounded-xl border border-neutral-800 bg-neutral-950 overflow-hidden">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          fitView
        >
          <Background color="#262626" gap={16} />
          <Controls className="!bg-neutral-900 !border-neutral-800 !text-white" />
        </ReactFlow>
      </div>
    </div>
  );
}