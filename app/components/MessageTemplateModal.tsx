'use client'

import { useState, useEffect } from 'react'
import { DEFAULT_SYSTEM_PROMPT } from '@/app/lib/message-defaults'

export interface MessageTemplate {
  id: string
  name: string
  tone: string
  goal: string
  systemPrompt: string
}

interface Props {
  isOpen: boolean
  onClose: () => void
  onSaved: (template: MessageTemplate) => void
  plan: string
  initial?: MessageTemplate
}

const TONES = ['Professional', 'Friendly', 'Direct', 'Consultative'] as const

export default function MessageTemplateModal({ isOpen, onClose, onSaved, plan, initial }: Props) {
  const [name, setName] = useState('')
  const [tone, setTone] = useState<typeof TONES[number]>('Professional')
  const [goal, setGoal] = useState('')
  const [systemPrompt, setSystemPrompt] = useState(DEFAULT_SYSTEM_PROMPT)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canCustomizePrompt = plan === 'pro' || plan === 'enterprise'
  const isEdit = !!initial

  useEffect(() => {
    if (!isOpen) return
    if (initial) {
      setName(initial.name)
      setTone(initial.tone as typeof TONES[number])
      setGoal(initial.goal)
      setSystemPrompt(initial.systemPrompt)
    } else {
      setName('')
      setTone('Professional')
      setGoal('')
      setSystemPrompt(DEFAULT_SYSTEM_PROMPT)
    }
    setError(null)
  }, [isOpen, initial])

  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, onClose])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSaving(true)

    try {
      const url = isEdit
        ? `/api/messages/templates/${initial!.id}`
        : '/api/messages/templates'
      const method = isEdit ? 'PUT' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          tone,
          goal,
          ...(canCustomizePrompt ? { systemPrompt } : {}),
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? 'Failed to save template')
      }

      const data = await res.json()
      onSaved(data.template)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900">
            {isEdit ? 'Edit template' : 'New message template'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {/* Name */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Template name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Discovery call outreach"
              required
              maxLength={100}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Tone */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Tone</label>
            <select
              value={tone}
              onChange={(e) => setTone(e.target.value as typeof TONES[number])}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
            >
              {TONES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          {/* Goal */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Goal</label>
            <input
              type="text"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="e.g. Book a 20-minute discovery call"
              required
              maxLength={200}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Custom system prompt — Pro+ only */}
          {canCustomizePrompt && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Custom AI prompt
                <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-50 text-purple-700 border border-purple-100">Pro</span>
              </label>
              <textarea
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                rows={5}
                className="w-full px-3 py-2 text-xs font-mono border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              />
              <p className="mt-1 text-[11px] text-gray-400">
                Must end with: Return ONLY valid JSON: {"{ \"body\": \"...\" }"}
              </p>
            </div>
          )}

          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white rounded-lg transition-colors"
            >
              {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create template'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
