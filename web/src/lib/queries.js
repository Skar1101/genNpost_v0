import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, apiText, getToken } from './api.js'

// ── Queue (draft lifecycle) ────────────────────────────────────────────────────

// state=null/undefined → every draft regardless of lifecycle state (matches GET /api/queue's own
// "no filter" behavior when the query param is omitted entirely).
export function useQueue(state = 'generated') {
  return useQuery({ queryKey: ['queue', state], queryFn: () => api(state ? `/queue?state=${state}` : '/queue') })
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

// Heron's own auto-run toggle — independent of the Raven/Quill switch above.
export function useSetHeronScheduler() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (heronEnabled) => api('/scheduler', { method: 'PUT', body: { heronEnabled } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['scheduler'] }),
  })
}

// Edit the daily slot times — times: { morningResearch?, dailyDrop?, eveningResearch? }, "HH:mm" 24h.
export function useSetScheduleTimes() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (times) => api('/scheduler', { method: 'PUT', body: { times } }),
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

// Multi-run history — full run objects, newest first (for the collapsible run-sections view).
export function useResearchRuns(limit = 10) {
  return useQuery({ queryKey: ['research-runs', limit], queryFn: () => api(`/research/runs?limit=${limit}`) })
}

// GET /api/logs/* — text logs (Today / Errors / per-source scrape logs). `logPath` is
// one of 'today', 'errors', or `scrape/<source>`; null disables the fetch.
export function useLogText(logPath) {
  return useQuery({
    queryKey: ['log', logPath],
    queryFn: () => apiText(`/logs/${logPath}`),
    enabled: !!logPath,
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

// Reloads Koel's knowledge files (profile/voice/approvals) from disk without a server restart.
export function useKoelReload() {
  return useMutation({ mutationFn: () => api('/koel/reload', { method: 'POST' }) })
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

// Manual daily drop — same run the 3:45pm schedule fires, results arrive via Telegram + WS.
export function useQuillTriggerDaily() {
  return useMutation({ mutationFn: () => api('/quill/trigger', { method: 'POST' }) })
}

// Manual weekly wrap-up run — same as the Sunday 6am schedule.
export function useQuillTriggerWeekly() {
  return useMutation({ mutationFn: () => api('/quill/weekly', { method: 'POST' }) })
}

// Past planning sessions (pillars/suggestions/drafts), newest first — powers "Previous plans".
export function useQuillSessions() {
  return useQuery({ queryKey: ['quill-sessions'], queryFn: () => api('/quill/sessions') })
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
    // `brief` is whatever was typed — the server splits out a searchable topic and keeps the rest as
    // a binding instruction. Sending it as `topic` used to make the whole sentence the article title.
    mutationFn: ({ brief, model }) => api('/article/generate', { method: 'POST', body: { brief, model } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['articles'] }),
  })
}

export function useCancelArticle() {
  return useMutation({
    mutationFn: ({ id }) => api(`/article/${id}/cancel`, { method: 'POST' }),
  })
}

export function useRefineArticle() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, instruction, model }) => api('/article/refine', { method: 'POST', body: { id, instruction, model } }),
    // The route responds immediately and streams the result over WS, so the new version doesn't
    // exist yet at this point — the page re-invalidates on article_done. Without any invalidation
    // at all the VERSIONS list silently stayed on the pre-rewrite state.
    onSettled: (_d, _e, vars) => {
      queryClient.invalidateQueries({ queryKey: ['article', vars?.id] })
      queryClient.invalidateQueries({ queryKey: ['articles'] })
    },
  })
}

export function useRevertArticle() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, version }) => api(`/article/${id}/revert`, { method: 'POST', body: { version } }),
    onSuccess: (_, { id }) => queryClient.invalidateQueries({ queryKey: ['article', id] }),
  })
}

// ── Heron (Substack) ─────────────────────────────────────────────────────────────

export function useHeronTopics() {
  return useQuery({ queryKey: ['heron-topics'], queryFn: () => api('/heron/topics') })
}

export function useHeronSearchTopics() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ query = null, count } = {}) => api('/heron/topics/search', { method: 'POST', body: { query, count } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['heron-topics'] }),
  })
}

export function useGenerateHeronArticle() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ idx, topic, model }) => api('/heron/article/generate', { method: 'POST', body: { idx, topic, model } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['articles'] }),
  })
}

export function useRefineHeronArticle() {
  return useMutation({
    mutationFn: ({ id, instruction, model }) => api('/heron/article/refine', { method: 'POST', body: { id, instruction, model } }),
  })
}

export function useHeronWriteNote() {
  return useMutation({
    mutationFn: ({ topic, count = 1 }) => api('/heron/note/write', { method: 'POST', body: { topic, count } }),
  })
}

// ── Parrot (LinkedIn) — the only agent with a real posting path. Generation is on-demand here;
// the actual LinkedIn post only happens on Approve (Telegram or the Queue page's Approve button). ──

export function useParrotStatus() {
  return useQuery({ queryKey: ['parrot-status'], queryFn: () => api('/parrot/status') })
}

export function useParrotWrite() {
  return useMutation({
    mutationFn: ({ topic, count = 1 }) => api('/parrot/write', { method: 'POST', body: { topic, count } }),
  })
}

// Parrot's own auto-run toggle — independent of the Raven/Quill and Heron switches.
export function useSetParrotScheduler() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (parrotEnabled) => api('/scheduler', { method: 'PUT', body: { parrotEnabled } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['scheduler'] }),
  })
}

// "Plan LinkedIn Posts" — fresh-search + category-matched suggestions, same shape as Quill's plan flow.
export function useParrotPlan() {
  return useMutation({
    mutationFn: ({ forceFresh = false } = {}) => api('/parrot/plan', { method: 'POST', body: { forceFresh } }),
  })
}

export function useParrotDraftFromSuggestion() {
  return useMutation({
    mutationFn: ({ suggestion, sessionId }) =>
      api('/parrot/draft', { method: 'POST', body: { suggestion, sessionId } }),
  })
}

// Past planning sessions, newest first — powers Parrot's "Previous plans".
export function useParrotSessions() {
  return useQuery({ queryKey: ['parrot-sessions'], queryFn: () => api('/parrot/sessions') })
}

export function useParrotSession(id) {
  return useQuery({ queryKey: ['parrot-session', id], queryFn: () => api(`/parrot/sessions/${id}`), enabled: !!id })
}

// ── Analyst ──────────────────────────────────────────────────────────────────────

export function useInsights() {
  return useQuery({ queryKey: ['insights'], queryFn: () => api('/insights') })
}

// Real X brand-gap audit — pulls Souvik's actual tweet history + real niche comparison. See
// agents/analyst.js's auditBrand().
export function useBrandAudit() {
  return useQuery({ queryKey: ['brand-audit'], queryFn: () => api('/brand-audit') })
}

export function useTriggerBrandAudit() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ screenname } = {}) => api('/brand-audit/trigger', { method: 'POST', body: { screenname } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['brand-audit'] }),
  })
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

// First-run bootstrap: infers voice + starter pillars from a niche + optional sample posts,
// pre-filling Settings instead of a blank form. Also refreshes strategy since pillars change.
export function useBootstrapProfile() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ niche, samples }) => api('/profile/bootstrap', { method: 'POST', body: { niche, samples } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile'] })
      queryClient.invalidateQueries({ queryKey: ['strategy'] })
    },
  })
}

export function useSkipBootstrap() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => api('/profile/skip-bootstrap', { method: 'POST' }),
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

// ── Calendar / slots ─────────────────────────────────────────────────────────────

export function useSchedule({ start = null, days = 7 } = {}) {
  const qs = new URLSearchParams({ days: String(days) })
  if (start) qs.set('start', start)
  return useQuery({ queryKey: ['schedule', start, days], queryFn: () => api(`/schedule?${qs}`) })
}

export function useReschedule() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ assetId, scheduledFor }) => api(`/schedule/${assetId}`, { method: 'PUT', body: { scheduledFor } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedule'] })
      queryClient.invalidateQueries({ queryKey: ['assets'] })
    },
  })
}

// Click an empty slot → write into it. Goes through the platform-aware Koel path.
export function useGenerateIntoSlot() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body) => api('/schedule/generate', { method: 'POST', body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedule'] })
      queryClient.invalidateQueries({ queryKey: ['assets'] })
    },
  })
}

// ── Asset library ────────────────────────────────────────────────────────────────

export function useAssets({ platform = null, state = null } = {}) {
  const qs = new URLSearchParams()
  if (platform) qs.set('platform', platform)
  if (state) qs.set('state', state)
  const suffix = qs.toString() ? `?${qs}` : ''
  return useQuery({ queryKey: ['assets', platform, state], queryFn: () => api(`/assets${suffix}`) })
}

export function useCreateAsset() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body) => api('/assets', { method: 'POST', body }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['assets'] }),
  })
}

export function useUpdateAsset() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }) => api(`/assets/${id}`, { method: 'PUT', body }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['assets'] }),
  })
}

export function useRevertAsset() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, v }) => api(`/assets/${id}/revert`, { method: 'POST', body: { v } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['assets'] }),
  })
}

export function useDeleteAsset() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id) => api(`/assets/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['assets'] }),
  })
}

// Rewrite an asset for a different platform — a real rewrite in that platform's register,
// not a reformat. Returns a NEW asset; the original is untouched.
export function useAdaptAsset() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, platform }) => api(`/assets/${id}/adapt`, { method: 'POST', body: { platform } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['assets'] }),
  })
}

// Write something with AI and get the TEXT BACK for editing — nothing is saved or scheduled.
export function useGenerateAssetText() {
  return useMutation({
    mutationFn: ({ brief, platform }) => api('/assets/generate', { method: 'POST', body: { brief, platform } }),
  })
}

// Deliver an asset to Telegram right now, bypassing its slot.
export function useSendAsset() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id) => api(`/assets/${id}/send`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assets'] })
      queryClient.invalidateQueries({ queryKey: ['schedule'] })
    },
  })
}

// Split + validate without saving — powers the live warning strip while typing.
export function usePreviewAsset() {
  return useMutation({ mutationFn: ({ text, platform }) => api('/assets/preview', { method: 'POST', body: { text, platform } }) })
}

// ── Images ───────────────────────────────────────────────────────────────────────

export function useImages() {
  return useQuery({ queryKey: ['images'], queryFn: () => api('/images') })
}

export function useGenerateImage() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body) => api('/images/generate', { method: 'POST', body }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['images'] }),
  })
}

export function useUploadImage() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body) => api('/images/upload', { method: 'POST', body }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['images'] }),
  })
}

// approved/rejected accumulates the training set for a future LoRA.
export function useImageVerdict() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, verdict }) => api(`/images/${id}/verdict`, { method: 'POST', body: { verdict } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['images'] }),
  })
}

// ── Article preferences (the template files) + learned corrections ───────────────

export function useArticleTemplate(platform) {
  return useQuery({
    queryKey: ['article-template', platform],
    queryFn: () => api(`/article-template?platform=${platform}`),
  })
}

export function useSaveArticleTemplate() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body) => api('/article-template', { method: 'PUT', body }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['article-template'] }),
  })
}

export function useArticleLessons() {
  return useQuery({ queryKey: ['article-lessons'], queryFn: () => api('/article-lessons') })
}

export function useLearnArticleLessons() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => api('/article-lessons/learn', { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['article-lessons'] }),
  })
}

export function useAddArticleLesson() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (text) => api('/article-lessons', { method: 'POST', body: { text } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['article-lessons'] }),
  })
}

export function useRemoveArticleLesson() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id) => api(`/article-lessons/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['article-lessons'] }),
  })
}

// ── Content strategy (pillars, positioning, exclusions) ──────────────────────────

export function useStrategy() {
  return useQuery({ queryKey: ['strategy'], queryFn: () => api('/strategy') })
}

export function useSaveStrategy() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body) => api('/strategy', { method: 'PUT', body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['strategy'] })
      // Ranking, thread themes and the repost filter all derive from this, so anything showing
      // research results is now stale.
      queryClient.invalidateQueries({ queryKey: ['research-runs'] })
    },
  })
}

// ── Per-platform keywords ────────────────────────────────────────────────────────

export function useKeywords() {
  return useQuery({ queryKey: ['keywords'], queryFn: () => api('/keywords') })
}

export function useSaveKeywords() {
  const queryClient = useQueryClient()
  return useMutation({
    // Patch shape: { x?: [{term, weight}], linkedin?: [...], substack?: [...] } — omitted platforms
    // are left untouched server-side.
    mutationFn: (patch) => api('/keywords', { method: 'PUT', body: patch }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['keywords'] }),
  })
}

// Scores candidate keywords against the CURRENT research pool (real occurrence counts).
export function useKeywordSearch() {
  return useMutation({
    mutationFn: ({ seed, platform }) => api('/keywords/search', { method: 'POST', body: { seed, platform } }),
  })
}

// ── Activity ─────────────────────────────────────────────────────────────────────

export function useActivity(limit = 100) {
  return useQuery({ queryKey: ['activity', limit], queryFn: () => api(`/activity?limit=${limit}`) })
}

// ── Expenses (LLM spend, day-wise) ──────────────────────────────────────────────

export function useExpenses(days = 30) {
  return useQuery({ queryKey: ['expenses', days], queryFn: () => api(`/expenses?days=${days}`) })
}

// ── Video + link card (Studio media rail) ────────────────────────────────────
export function useVideos() {
  return useQuery({ queryKey: ['videos'], queryFn: () => api('/videos') })
}

// Video goes up as RAW BINARY, not through api() — base64 in JSON inflates ~33% and the JSON body
// cap is 15mb, which a video blows past immediately.
export function useUploadVideo() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (file) => {
      const token = getToken()
      const headers = { 'Content-Type': file.type, 'X-Filename': encodeURIComponent(file.name || 'video') }
      if (token) headers.Authorization = `Bearer ${token}`
      const res = await fetch('/api/videos/upload', { method: 'POST', headers, body: file })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || `Upload failed (${res.status})`)
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['videos'] }),
  })
}

export function useLinkCard() {
  return useMutation({
    mutationFn: ({ url }) => api('/link-card', { method: 'POST', body: { url } }),
  })
}
