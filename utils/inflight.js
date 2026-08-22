// Registry of running article generations, so a Stop button can reach one.
//
// There was no way to cancel anything before: the article id lived only inside the route handler's
// closure, and utils/llm.js owned the only AbortController (driven purely by the 120s timeout). An
// abandoned generation kept burning tokens AND held one of llmGuard's 3 concurrency slots until it
// timed out.

const controllers = new Map()   // articleId -> AbortController

function start(id) {
  cancel(id)   // never leak a previous controller for the same id
  const controller = new AbortController()
  controllers.set(id, controller)
  return controller
}

function finish(id) {
  controllers.delete(id)
}

// Returns true if something was actually running.
function cancel(id) {
  const controller = controllers.get(id)
  if (!controller) return false
  controller.abort()
  controllers.delete(id)
  return true
}

function isRunning(id) {
  return controllers.has(id)
}

module.exports = { start, finish, cancel, isRunning }
