'use client'

import { useState, useEffect, useCallback } from 'react'
import MessageTemplateModal, { type MessageTemplate } from './MessageTemplateModal'
import UpgradeModal from './UpgradeModal'

interface GeneratedMessage {
  id: string
  body: string
  editedBody: string | null
  deliveryStatus: string
  runResult: {
    id: string
    linkedinUrl: string
    totalScore: number | null
    rowIndex: number
  }
}

interface Props {
  runId: string
  plan: string
}

type TabState =
  | { kind: 'loading' }
  | { kind: 'no_templates' }
  | { kind: 'select_template'; templates: MessageTemplate[] }
  | { kind: 'generating'; templates: MessageTemplate[] }
  | { kind: 'ready'; templates: MessageTemplate[]; messages: GeneratedMessage[] }
  | { kind: 'error'; templates: MessageTemplate[]; message: string }

export default function MessagesTab({ runId, plan }: Props) {
  const [state, setState] = useState<TabState>({ kind: 'loading' })
  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(null)
  const [showTemplateModal, setShowTemplateModal] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<MessageTemplate | undefined>()
  const [showUpgradeModal, setShowUpgradeModal] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [savingId, setSavingId] = useState<string | null>(null)

  const isFree = plan === 'free'

  const templates =
    state.kind !== 'loading' && state.kind !== 'no_templates' ? state.templates : []
  const activeTemplate = templates.find((t) => t.id === activeTemplateId) ?? templates[0] ?? null

  const loadTemplates = useCallback(async () => {
    try {
      const res = await fetch('/api/messages/templates')
      if (!res.ok) throw new Error('Failed to load templates')
      const data = await res.json() as { templates: MessageTemplate[] }
      if (data.templates.length === 0) {
        setState({ kind: 'no_templates' })
      } else {
        setState({ kind: 'select_template', templates: data.templates })
        setActiveTemplateId((prev) => prev ?? data.templates[0].id)
      }
    } catch {
      setState({ kind: 'error', templates: [], message: 'Failed to load templates. Please refresh.' })
    }
  }, [])

  useEffect(() => { loadTemplates() }, [loadTemplates])

  async function handleGenerate(template: MessageTemplate) {
    setState((prev) =>
      prev.kind !== 'loading' && prev.kind !== 'no_templates'
        ? { kind: 'generating', templates: prev.templates }
        : { kind: 'generating', templates: [] }
    )

    try {
      const res = await fetch('/api/messages/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ run_id: runId, template_id: template.id }),
      })
      if (!res.ok) {
        const data = await res.json() as { error?: string }
        throw new Error(data.error ?? 'Generation failed')
      }
      const data = await res.json() as { messages: GeneratedMessage[] }
      setState((prev) =>
        prev.kind === 'generating'
          ? { kind: 'ready', templates: prev.templates, messages: data.messages }
          : prev
      )
    } catch (err) {
      setState((prev) =>
        prev.kind === 'generating'
          ? { kind: 'error', templates: prev.templates, message: err instanceof Error ? err.message : 'Message generation failed. Please try again.' }
          : prev
      )
    }
  }

  async function handleRegenerate(contactResultId: string, template: MessageTemplate) {
    try {
      const res = await fetch('/api/messages/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ run_id: runId, template_id: template.id, contact_ids: [contactResultId] }),
      })
      if (!res.ok) throw new Error('Regeneration failed')
      const data = await res.json() as { messages: GeneratedMessage[] }
      setState((prev) => {
        if (prev.kind !== 'ready') return prev
        return {
          ...prev,
          messages: prev.messages.map((m) =>
            m.runResult.id === contactResultId
              ? (data.messages.find((n) => n.runResult.id === contactResultId) ?? m)
              : m
          ),
        }
      })
    } catch {
      // leave existing message — user can retry
    }
  }

  async function handleSaveEdit(messageId: string) {
    setSavingId(messageId)
    try {
      const res = await fetch(`/api/messages/${messageId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ editedBody: editText }),
      })
      if (!res.ok) throw new Error('Failed to save')
      setState((prev) => {
        if (prev.kind !== 'ready') return prev
        return {
          ...prev,
          messages: prev.messages.map((m) =>
            m.id === messageId ? { ...m, editedBody: editText } : m
          ),
        }
      })
      setExpandedId(null)
    } catch {
      // leave editor open so user can retry
    } finally {
      setSavingId(null)
    }
  }

  function handleTemplateCreated(template: MessageTemplate) {
    setState((prev) => {
      if (prev.kind === 'no_templates') return { kind: 'select_template', templates: [template] }
      if (prev.kind === 'loading') return { kind: 'select_template', templates: [template] }
      return { ...prev, templates: [...prev.templates, template] }
    })
    setActiveTemplateId(template.id)
  }

  function handleTemplateUpdated(updated: MessageTemplate) {
    setState((prev) => {
      if (prev.kind === 'loading' || prev.kind === 'no_templates') return prev
      return { ...prev, templates: prev.templates.map((t) => t.id === updated.id ? updated : t) }
    })
  }

  // ── Loading ──────────────────────────────────────────────────────────────
  if (state.kind === 'loading') {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-gray-300 border-t-gray-700 rounded-full animate-spin" />
      </div>
    )
  }

  // ── No templates ─────────────────────────────────────────────────────────
  if (state.kind === 'no_templates') {
    return (
      <>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-10 text-center">
          <div className="w-10 h-10 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-3">
            <svg className="w-5 h-5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
            </svg>
          </div>
          <h3 className="text-sm font-semibold text-gray-900 mb-1">No message templates yet</h3>
          <p className="text-xs text-gray-500 mb-5 max-w-xs mx-auto">
            Create a template to start generating personalised LinkedIn messages for your scored contacts.
          </p>
          <button
            onClick={() => {
              if (isFree) { setShowUpgradeModal(true) } else { setEditingTemplate(undefined); setShowTemplateModal(true) }
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Create template
          </button>
        </div>

        <Modals
          showTemplateModal={showTemplateModal}
          onCloseTemplateModal={() => setShowTemplateModal(false)}
          onTemplateSaved={editingTemplate ? handleTemplateUpdated : handleTemplateCreated}
          editingTemplate={editingTemplate}
          plan={plan}
          showUpgradeModal={showUpgradeModal}
          onCloseUpgradeModal={() => setShowUpgradeModal(false)}
          currentPlan={plan}
        />
      </>
    )
  }

  // ── Error ────────────────────────────────────────────────────────────────
  if (state.kind === 'error') {
    return (
      <div className="bg-red-50 border border-red-100 rounded-2xl p-6 text-center">
        <p className="text-sm text-red-700 mb-3">{state.message}</p>
        <button
          onClick={loadTemplates}
          className="text-xs font-medium text-red-600 hover:text-red-800 underline"
        >
          Try again
        </button>
      </div>
    )
  }

  // ── Select template + Generate ───────────────────────────────────────────
  if (state.kind === 'select_template' || state.kind === 'generating') {
    const isGenerating = state.kind === 'generating'

    return (
      <>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-start justify-between gap-4 mb-5">
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-0.5">Generate messages</h3>
              <p className="text-xs text-gray-500">
                {plan === 'starter' ? 'Up to 100 messages per run' : 'All contacts in this run'}
              </p>
            </div>
            <button
              onClick={() => { setEditingTemplate(undefined); setShowTemplateModal(true) }}
              className="shrink-0 text-xs font-medium text-blue-600 hover:text-blue-700 transition-colors"
            >
              + New template
            </button>
          </div>

          <div className="mb-5">
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Template</label>
            <div className="flex gap-2">
              <select
                value={activeTemplate?.id ?? ''}
                onChange={(e) => setActiveTemplateId(e.target.value)}
                disabled={isGenerating}
                className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white disabled:opacity-50"
              >
                {state.templates.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
              {activeTemplate && (
                <button
                  onClick={() => { setEditingTemplate(activeTemplate); setShowTemplateModal(true) }}
                  disabled={isGenerating}
                  className="px-3 py-2 text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg disabled:opacity-50 transition-colors"
                >
                  Edit
                </button>
              )}
            </div>
            {activeTemplate && (
              <p className="mt-1.5 text-[11px] text-gray-400">
                Tone: {activeTemplate.tone} · Goal: {activeTemplate.goal}
              </p>
            )}
          </div>

          {isFree ? (
            <button
              onClick={() => setShowUpgradeModal(true)}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Generate messages — Starter+ only
            </button>
          ) : (
            <button
              onClick={() => activeTemplate && handleGenerate(activeTemplate)}
              disabled={isGenerating || !activeTemplate}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white rounded-lg transition-colors"
            >
              {isGenerating ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  Generating messages…
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  Generate messages
                </>
              )}
            </button>
          )}
        </div>

        <Modals
          showTemplateModal={showTemplateModal}
          onCloseTemplateModal={() => setShowTemplateModal(false)}
          onTemplateSaved={editingTemplate ? handleTemplateUpdated : handleTemplateCreated}
          editingTemplate={editingTemplate}
          plan={plan}
          showUpgradeModal={showUpgradeModal}
          onCloseUpgradeModal={() => setShowUpgradeModal(false)}
          currentPlan={plan}
        />
      </>
    )
  }

  // ── Ready — messages table ────────────────────────────────────────────────
  const { messages } = state

  return (
    <>
      <div className="flex items-center gap-3 mb-4">
        <div className="flex-1 flex items-center gap-2">
          <select
            value={activeTemplate?.id ?? ''}
            onChange={(e) => {
              setActiveTemplateId(e.target.value)
              const t = templates.find((t) => t.id === e.target.value)
              if (t) handleGenerate(t)
            }}
            className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            {templates.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          {activeTemplate && (
            <button
              onClick={() => { setEditingTemplate(activeTemplate); setShowTemplateModal(true) }}
              className="text-xs text-gray-500 hover:text-gray-700 transition-colors"
            >
              Edit template
            </button>
          )}
        </div>
        <button
          onClick={() => { setEditingTemplate(undefined); setShowTemplateModal(true) }}
          className="text-xs font-medium text-blue-600 hover:text-blue-700 transition-colors"
        >
          + New template
        </button>
        {activeTemplate && (
          <button
            onClick={() => handleGenerate(activeTemplate)}
            className="px-3 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
          >
            Regenerate all
          </button>
        )}
      </div>

      <p className="text-xs text-gray-500 mb-3">
        {messages.length} message{messages.length !== 1 ? 's' : ''} generated
        {plan === 'starter' && ' (100-contact limit)'}
      </p>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        {messages.length === 0 ? (
          <div className="p-10 text-center text-sm text-gray-400">No messages generated yet.</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {messages.map((msg, i) => {
              const displayText = msg.editedBody ?? msg.body
              const isExpanded = expandedId === msg.id

              return (
                <div key={msg.id} className="px-5 py-4">
                  <div className="flex items-start gap-3">
                    <span className="shrink-0 w-6 h-6 rounded-full bg-gray-100 text-[11px] font-semibold text-gray-500 flex items-center justify-center mt-0.5">
                      {i + 1}
                    </span>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <a
                          href={msg.runResult.linkedinUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs font-medium text-blue-600 hover:underline truncate max-w-[220px]"
                        >
                          {msg.runResult.linkedinUrl.replace('https://www.linkedin.com/in/', '')}
                        </a>
                        {msg.runResult.totalScore !== null && (
                          <span className="shrink-0 text-[10px] text-gray-400">
                            Score: {Math.round(msg.runResult.totalScore)}%
                          </span>
                        )}
                        {msg.editedBody && (
                          <span className="shrink-0 text-[10px] font-medium text-amber-600 bg-amber-50 border border-amber-100 px-1.5 py-0.5 rounded-full">
                            Edited
                          </span>
                        )}
                      </div>

                      {isExpanded ? (
                        <div className="mt-2 space-y-2">
                          <textarea
                            value={editText}
                            onChange={(e) => setEditText(e.target.value)}
                            rows={4}
                            className="w-full px-3 py-2 text-xs border border-blue-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                          />
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleSaveEdit(msg.id)}
                              disabled={savingId === msg.id}
                              className="px-3 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white rounded-lg transition-colors"
                            >
                              {savingId === msg.id ? 'Saving…' : 'Save'}
                            </button>
                            <button
                              onClick={() => setExpandedId(null)}
                              className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700 transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <p className="text-xs text-gray-700 line-clamp-2">{displayText}</p>
                      )}
                    </div>

                    {!isExpanded && (
                      <div className="shrink-0 flex items-center gap-1.5">
                        <button
                          onClick={() => { setExpandedId(msg.id); setEditText(displayText) }}
                          className="px-2.5 py-1 text-[11px] text-gray-500 hover:text-gray-700 border border-gray-200 rounded-md transition-colors"
                        >
                          Edit
                        </button>
                        {activeTemplate && (
                          <button
                            onClick={() => handleRegenerate(msg.runResult.id, activeTemplate)}
                            className="px-2.5 py-1 text-[11px] text-gray-500 hover:text-gray-700 border border-gray-200 rounded-md transition-colors"
                          >
                            Regenerate
                          </button>
                        )}
                        <button
                          title="LinkedIn delivery — coming in Phase 8"
                          disabled
                          className="px-2.5 py-1 text-[11px] text-gray-300 border border-gray-100 rounded-md cursor-not-allowed"
                        >
                          Send
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <Modals
        showTemplateModal={showTemplateModal}
        onCloseTemplateModal={() => setShowTemplateModal(false)}
        onTemplateSaved={editingTemplate ? handleTemplateUpdated : handleTemplateCreated}
        editingTemplate={editingTemplate}
        plan={plan}
        showUpgradeModal={showUpgradeModal}
        onCloseUpgradeModal={() => setShowUpgradeModal(false)}
        currentPlan={plan}
      />
    </>
  )
}

// Shared modal group to avoid duplication across branches
function Modals({
  showTemplateModal,
  onCloseTemplateModal,
  onTemplateSaved,
  editingTemplate,
  plan,
  showUpgradeModal,
  onCloseUpgradeModal,
  currentPlan,
}: {
  showTemplateModal: boolean
  onCloseTemplateModal: () => void
  onTemplateSaved: (t: MessageTemplate) => void
  editingTemplate: MessageTemplate | undefined
  plan: string
  showUpgradeModal: boolean
  onCloseUpgradeModal: () => void
  currentPlan: string
}) {
  return (
    <>
      <MessageTemplateModal
        isOpen={showTemplateModal}
        onClose={onCloseTemplateModal}
        onSaved={onTemplateSaved}
        plan={plan}
        initial={editingTemplate}
      />
      <UpgradeModal
        trigger="Generate personalised messages"
        requiredPlan="starter"
        isOpen={showUpgradeModal}
        onClose={onCloseUpgradeModal}
        currentPlan={currentPlan as 'free' | 'starter' | 'pro' | 'enterprise'}
      />
    </>
  )
}
