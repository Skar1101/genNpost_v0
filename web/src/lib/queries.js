import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './api.js'

// ── Queue (draft lifecycle) ────────────────────────────────────────────────────

export function useQueue(state = 'generated') {
  return useQuery({ queryKey: ['queue', state], queryFn: () => api(`/queue?state=${state}`) })
}

export function useTransition() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, state, reason, editedText }) =>
      api(`/draft/${id}/transition`, { method: 'POST', body: { state, reason, editedText } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['queue'] }),
  })
}

// ── Control Center ──────────────────────────────────────────────────────────────

export function useAgents() {
  return useQuery({ queryKey: ['agents'], queryFn: () => api('/agents') })
}

export function useScheduler() {
  return useQuery({ queryKey: ['scheduler'], queryFn: () => api('/scheduler') })
}

export function useSetScheduler() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (enabled) => api('/scheduler', { method: 'PUT', body: { enabled } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['scheduler'] }),
  })
}

// ── Titto chat ───────────────────────────────────────────────────────────────────

export function useChat() {
  return useMutation({
    mutationFn: ({ message, sessionId = 'web-default' }) => api('/chat', { method: 'POST', body: { message, sessionId } }),
  })
}

// ── Raven (research) ────────────────────────────────────────────────────────────

export function useResearch() {
  return useQuery({ queryKey: ['research'], queryFn: () => api('/research/latest') })
}

export function useTriggerResearch() {
  return useMutation({
    mutationFn: ({ filterSources = null, triggerLabel = null } = {}) =>
      api('/research/trigger', { method: 'POST', body: { filterSources, triggerLabel } }),
  })
}

export function useReplies() {
  return useQuery({ queryKey: ['replies'], queryFn: () => api('/replies/latest') })
}

export function useTriggerReplies() {
  return useMutation({
    mutationFn: ({ domains = null, keywords = null } = {}) =>
      api('/replies/trigger', { method: 'POST', body: { domains, keywords } }),
  })
}

export function useDraftReply() {
  return useMutation({
    mutationFn: ({ url, index }) => api('/replies/draft', { method: 'POST', body: { url, index } }),
  })
}

// ── Koel (writer) ────────────────────────────────────────────────────────────────

export function useKoelWrite() {
  return useMutation({
    mutationFn: ({ format, input, inputType, count, extraInstructions }) =>
      api('/koel/write', { method: 'POST', body: { format, input, inputType, count, extraInstructions } }),
  })
}

export function useKoelHistory() {
  return useQuery({ queryKey: ['koel-history'], queryFn: () => api('/koel/history') })
}

// ── Quill (X content ops) ────────────────────────────────────────────────────────

export function useQuillLatest() {
  return useQuery({ queryKey: ['quill-latest'], queryFn: () => api('/quill/latest') })
}

export function useQuillHistory() {
  return useQuery({ queryKey: ['quill-history'], queryFn: () => api('/quill/history') })
}

export function useQuillPillars() {
  return useQuery({ queryKey: ['quill-pillars'], queryFn: () => api('/quill/pillars') })
}

export function useQuillPlan() {
  return useMutation({
    mutationFn: ({ forceFresh = false } = {}) => api('/quill/plan', { method: 'POST', body: { forceFresh } }),
  })
}

export function useQuillDraft() {
  return useMutation({
    mutationFn: ({ suggestion, format, sessionId, sid }) =>
      api('/quill/draft', { method: 'POST', body: { suggestion, format, sessionId, sid } }),
  })
}

export function useQuillRefine() {
  return useMutation({
    mutationFn: ({ draftText, instruction, format, sessionId, draftUid }) =>
      api('/quill/refine', { method: 'POST', body: { draftText, instruction, format, sessionId, draftUid } }),
  })
}

// ── Article Writer ───────────────────────────────────────────────────────────────

export function useModels() {
  return useQuery({ queryKey: ['models'], queryFn: () => api('/models') })
}

export function useArticles() {
  return useQuery({ queryKey: ['articles'], queryFn: () => api('/article') })
}

export function useArticle(id) {
  return useQuery({ queryKey: ['article', id], queryFn: () => api(`/article/${id}`), enabled: !!id })
}

export function useGenerateArticle() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ topic, model }) => api('/article/generate', { method: 'POST', body: { topic, model } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['articles'] }),
  })
}

export function useRefineArticle() {
  return useMutation({
    mutationFn: ({ id, instruction, model }) => api('/article/refine', { method: 'POST', body: { id, instruction, model } }),
  })
}

export function useRevertArticle() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, version }) => api(`/article/${id}/revert`, { method: 'POST', body: { version } }),
    onSuccess: (_, { id }) => queryClient.invalidateQueries({ queryKey: ['article', id] }),
  })
}

// ── Analyst ──────────────────────────────────────────────────────────────────────

export function useInsights() {
  return useQuery({ queryKey: ['insights'], queryFn: () => api('/insights') })
}

// ── Profile / Settings ───────────────────────────────────────────────────────────

export function useProfile() {
  return useQuery({ queryKey: ['profile'], queryFn: () => api('/profile') })
}

export function useSaveProfile() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (profile) => api('/profile', { method: 'PUT', body: { profile } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['profile'] }),
  })
}

export function useReplyDomains() {
  return useQuery({ queryKey: ['reply-domains'], queryFn: () => api('/replies/domains') })
}

export function useSaveReplyDomains() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (enabled) => api('/replies/domains', { method: 'PUT', body: { enabled } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['reply-domains'] }),
  })
}

// ── Activity ─────────────────────────────────────────────────────────────────────

export function useActivity(limit = 100) {
  return useQuery({ queryKey: ['activity', limit], queryFn: () => api(`/activity?limit=${limit}`) })
}
