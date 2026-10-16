'use client';

import React, { useEffect, useState } from 'react';
import { TaskDraft } from '@/types/chat';

interface GroupOption {
  id: number;
  name: string;
}

interface TaskDraftCardProps {
  draft: TaskDraft;
  token?: string;
}

type CardState = 'idle' | 'creating' | 'done';

// Confirm card rendered under an assistant message that carried a
// ```task_draft block. Loads the caller's groups, lets them edit the fields,
// and POSTs to the Rails task bridge only when Create is clicked.
export default function TaskDraftCard({ draft, token }: TaskDraftCardProps) {
  const [title, setTitle] = useState(draft.title);
  const [description, setDescription] = useState(draft.description);
  const [hours, setHours] = useState(String(draft.hours));
  const [groups, setGroups] = useState<GroupOption[]>([]);
  const [groupsLoaded, setGroupsLoaded] = useState(false);
  const [groupId, setGroupId] = useState('');
  const [state, setState] = useState<CardState>('idle');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  const base = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3000';

  useEffect(() => {
    if (!token) return;
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`${base}/api/v1/tasks/groups`, {
          headers: { token },
        });
        if (res.status === 401 || res.status === 403) {
          // Guest/embed token or expired session — tell the user the truth.
          setError('Sign in to your Needpedia account to create tasks.');
          setGroupsLoaded(true);
          return;
        }
        if (!res.ok) throw new Error('groups fetch failed');
        const data = (await res.json()) as GroupOption[];
        if (!alive) return;
        setGroups(Array.isArray(data) ? data : []);
        setGroupsLoaded(true);
        if (data.length === 1) setGroupId(String(data[0].id));
      } catch {
        if (alive) {
          setError('Could not load your groups.');
          setGroupsLoaded(true);
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [token, base]);

  const handleCreate = async () => {
    if (state !== 'idle') return; // in-flight guard: no double submit
    if (!token) {
      setError('Sign in to create tasks.');
      return;
    }
    if (!groupId) {
      setError('Choose a group first.');
      return;
    }
    setState('creating');
    setError('');
    setStatus('');
    try {
      const res = await fetch(`${base}/api/v1/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', token },
        body: JSON.stringify({
          group_id: Number(groupId),
          title,
          description,
          hours: Number(hours) > 0 ? Number(hours) : 1,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        errors?: string[];
        title?: string;
      };
      if (res.status === 401) {
        throw new Error('Sign in to your Needpedia account to create tasks.');
      }
      if (!res.ok) {
        throw new Error(
          data.error || (data.errors && data.errors.join(', ')) || 'Could not create task'
        );
      }
      setState('done');
      setStatus(`Task "${data.title || title}" created in this group.`);
    } catch (e) {
      setState('idle');
      setError(e instanceof Error ? e.message : 'Could not create task.');
    }
  };

  if (!token) {
    return (
      <div className="mb-4 max-w-[85%] rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        Task draft — sign in to create tasks.
      </div>
    );
  }

  return (
    <div className="mb-4 max-w-[85%] rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-zinc-900 shadow-sm">
      <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
        Task draft
      </div>

      <label className="mb-1 block text-xs font-medium text-zinc-600" htmlFor="task-draft-title">
        Title
      </label>
      <input
        id="task-draft-title"
        className="mb-2 w-full rounded-lg border border-zinc-300 px-2.5 py-1.5 text-sm focus:border-zinc-500 focus:outline-none"
        value={title}
        onChange={e => setTitle(e.target.value)}
        disabled={state === 'done'}
      />

      <label className="mb-1 block text-xs font-medium text-zinc-600" htmlFor="task-draft-description">
        Description
      </label>
      <textarea
        id="task-draft-description"
        className="mb-2 w-full rounded-lg border border-zinc-300 px-2.5 py-1.5 text-sm focus:border-zinc-500 focus:outline-none"
        rows={3}
        value={description}
        onChange={e => setDescription(e.target.value)}
        disabled={state === 'done'}
      />

      <div className="mb-2 flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-600" htmlFor="task-draft-hours">
            Hours
          </label>
          <input
            id="task-draft-hours"
            type="number"
            min={0.01}
            max={999.99}
            step={0.5}
            className="w-24 rounded-lg border border-zinc-300 px-2.5 py-1.5 text-sm focus:border-zinc-500 focus:outline-none"
            value={hours}
            onChange={e => setHours(e.target.value)}
            disabled={state === 'done'}
          />
        </div>
        <div className="min-w-[12rem] flex-1">
          <label className="mb-1 block text-xs font-medium text-zinc-600" htmlFor="task-draft-group">
            Group
          </label>
          <select
            id="task-draft-group"
            className="w-full rounded-lg border border-zinc-300 px-2.5 py-1.5 text-sm bg-white focus:border-zinc-500 focus:outline-none"
            value={groupId}
            onChange={e => setGroupId(e.target.value)}
            disabled={state === 'done'}
          >
            <option value="">-- select group --</option>
            {groups.map(g => (
              <option key={g.id} value={String(g.id)}>
                {g.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <button
        type="button"
        onClick={handleCreate}
        disabled={state !== 'idle'}
        className="rounded-lg bg-zinc-900 px-3.5 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {state === 'creating' ? 'Creating…' : state === 'done' ? 'Created' : 'Create'}
      </button>

      {status && <p className="mt-2 text-sm text-green-700">{status}</p>}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      {groupsLoaded && groups.length === 0 && !error && (
        <p className="mt-2 text-xs text-zinc-500">
          You have no groups yet — create or join a group first.
        </p>
      )}
      {!groupsLoaded && !error && (
        <p className="mt-2 text-xs text-zinc-500">Loading your groups…</p>
      )}
    </div>
  );
}
