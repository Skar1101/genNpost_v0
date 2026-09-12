import { useNavigate } from 'react-router-dom'

// Public marketing entry point — genNpost's front door. No auth exists yet (see PIVOT_PLAN.txt:
// multi-user is out of V0 scope), so both CTAs just drop straight into the dashboard at "/" for now.
// Swap their targets for a real sign-up/sign-in flow once accounts exist; nothing else here depends
// on that. Deliberately its own route ("/welcome"), not "/", so the existing dashboard keeps loading
// at the root for the one real user today — this page doesn't replace anything.
//
// Visual direction picked 2026-09-12 from a 3-option design canvas (mocked up against a ClimbX
// screenshot): full-bleed gradient-glow hero split into headline + a Telegram chat/draft-preview
// card, orange numbered-circle steps, icon-accented "why" cards, dark high-contrast final CTA band.
// Content stays honest to what genNpost actually is today: no fabricated testimonials, user counts,
// or pricing — there's no billing system yet, so pricing says "free while in beta," not an invented
// number.

const HOW_IT_WORKS = [
  { n: 1, title: 'Research', body: 'Raven scans Hacker News, Reddit, GitHub, YouTube, arXiv, and X for what’s trending in your niche.' },
  { n: 2, title: 'Learns your voice', body: 'Every approve, edit, or reject teaches it your tone. It gets more like you over time — not more generic.' },
  { n: 3, title: 'Drafts for every platform', body: 'One idea becomes a LinkedIn post, an X thread, a Substack draft, and more — each shaped for that platform.' },
  { n: 4, title: 'Approve from Telegram', body: 'Nothing goes out unattended. Every real post waits for your tap — no dashboard required.' },
]

// Decorative icon-tint pairs pulled straight from the palette's documented accent colors
// (amber/purple/coral) — icons only, never primary chrome, per the branding discipline.
const WHY = [
  {
    title: 'Chat-first, not another dashboard',
    body: 'You don’t log in and check a queue — Titto messages you on Telegram when something’s ready for your call.',
    tint: 'rgba(108,92,231,0.14)', stroke: '#6C5CE7',
    path: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
  },
  {
    title: 'Multi-platform from one idea',
    body: 'Most tools like this lock you into one platform. genNpost isn’t one of them — one idea becomes content shaped for everywhere you post.',
    tint: 'rgba(245,184,76,0.18)', stroke: '#C9891A',
    path: null, // grid icon, drawn separately below
  },
  {
    title: 'A real feedback loop',
    body: 'Your approvals and edits are the training data. The voice it writes in next week is shaped by what you actually kept.',
    tint: 'rgba(242,135,107,0.18)', stroke: '#D9613F',
    path: 'M21 2v6h-6M3 12a9 9 0 0 1 15-6.7L21 8M3 22v-6h6M21 12a9 9 0 0 1-15 6.7L3 16',
  },
  {
    title: 'A team of agents, working in parallel',
    body: 'Research, voice-matching, and drafting for each platform run as specialized agents at the same time — not one model working through your platforms one by one.',
    tint: 'rgba(58,168,118,0.14)', stroke: '#2F8F66',
    path: 'M6 4v16M12 4v16M18 4v16',
  },
]

const FAQ = [
  { q: 'Does it post without me approving?', a: 'No. Every real post — LinkedIn included — waits for a tap from you in Telegram before it goes live.' },
  { q: 'What platforms does it support?', a: 'LinkedIn, X, and Substack today, with more on the way. LinkedIn auto-posts once you approve; X and Substack drafts arrive ready to copy — genNpost doesn’t auto-post to those yet.' },
  { q: 'Do I need to give it my passwords?', a: 'No. LinkedIn connects through its official sign-in flow (OAuth) — genNpost never sees or stores your password.' },
  { q: 'What does it cost?', a: 'Free while in beta. There’s no billing system yet, so nothing to pay today.' },
  { q: 'Do I need to be at my computer?', a: 'No — the whole loop, from reviewing ideas to approving a post, runs from a Telegram chat.' },
]

function CTAButtons({ navigate, size = '', dark = false }) {
  const pad = size === 'lg' ? { padding: '14px 26px', fontSize: 15 } : { padding: '9px 18px', fontSize: 14 }
  return (
    <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
      <button
        className="btn primary"
        style={{ ...pad, boxShadow: '0 10px 24px rgba(239,125,26,0.35)' }}
        onClick={() => navigate('/')}
      >
        Start free
      </button>
      <button
        className="btn"
        style={{
          ...pad,
          background: dark ? 'rgba(255,255,255,0.08)' : 'transparent',
          borderColor: dark ? 'rgba(255,255,255,0.28)' : 'var(--border)',
          color: dark ? '#FFFFFF' : 'var(--ink)',
        }}
        onClick={() => navigate('/')}
      >
        Log in
      </button>
    </div>
  )
}

// The hero's visual anchor: a mock Titto/Telegram exchange showing a real draft with Approve/Edit —
// this is what the product actually produces, not a generic illustration.
function ProductPreview() {
  return (
    <div style={{ position: 'relative' }}>
      <div style={{
        position: 'absolute', inset: -30, zIndex: 0,
        background: 'radial-gradient(ellipse at 50% 40%, rgba(239,125,26,0.28), rgba(239,125,26,0) 65%)',
      }} />
      <div style={{
        position: 'relative', zIndex: 1, background: '#FFFFFF', borderRadius: 18, overflow: 'hidden',
        border: '1px solid var(--border)', boxShadow: '0 30px 60px rgba(21,24,30,0.18), 0 4px 12px rgba(21,24,30,0.08)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#F2876B' }} />
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#F5B84C' }} />
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--accent)' }} />
          <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--faint)', fontWeight: 600 }}>Titto · Telegram</span>
        </div>
        <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12, background: 'var(--canvas)' }}>
          <div style={{ alignSelf: 'flex-start', maxWidth: '82%', background: '#FFFFFF', borderRadius: '12px 12px 12px 3px', padding: '12px 14px', boxShadow: '0 1px 2px rgba(0,0,0,0.06)' }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--accent)', marginBottom: 4 }}>Titto</div>
            <div style={{ fontSize: 13.5, lineHeight: 1.45 }}>Found a trending angle on AI workflow tools. Drafted for LinkedIn + X. Want to review?</div>
          </div>
          <div style={{ alignSelf: 'flex-start', maxWidth: '88%', background: '#FFFFFF', borderRadius: 12, padding: 14, border: '1px solid var(--border)', boxShadow: '0 1px 2px rgba(0,0,0,0.06)' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--faint)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 6 }}>LinkedIn draft</div>
            <div style={{ fontSize: 13, lineHeight: 1.5, marginBottom: 10 }}>“Most teams don’t have an AI problem. They have a workflow problem AI just made visible…”</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <span style={{ background: 'var(--accent)', color: '#fff', fontSize: 12, fontWeight: 700, padding: '7px 14px', borderRadius: 8 }}>✓ Approve</span>
              <span style={{ background: 'var(--surface-2)', color: 'var(--muted)', fontSize: 12, fontWeight: 700, padding: '7px 14px', borderRadius: 8 }}>Edit</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function LandingPage() {
  const navigate = useNavigate()

  return (
    <div style={{ minHeight: '100vh', background: '#FFFFFF', color: 'var(--ink)' }}>
      <header style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '22px 32px', maxWidth: 1200, margin: '0 auto',
      }}>
        <div style={{ fontWeight: 800, fontSize: 20, letterSpacing: '-.01em' }}>genNpost</div>
        <CTAButtons navigate={navigate} />
      </header>

      {/* Hero — full-bleed gradient glow, split into copy + product preview */}
      <section style={{
        position: 'relative', overflow: 'hidden',
        background: 'linear-gradient(180deg, #EAF6F0 0%, #FBF3E7 55%, #FDEBD8 100%)',
      }}>
        <div style={{
          position: 'absolute', right: -120, top: -160, width: 620, height: 620, borderRadius: '50%',
          background: 'radial-gradient(circle at 40% 40%, rgba(239,125,26,0.32), rgba(239,125,26,0) 70%)',
        }} />
        <div style={{
          position: 'absolute', left: -180, bottom: -220, width: 560, height: 560, borderRadius: '50%',
          background: 'radial-gradient(circle at 60% 60%, rgba(58,168,118,0.28), rgba(58,168,118,0) 70%)',
        }} />

        <div style={{
          position: 'relative', maxWidth: 1200, margin: '0 auto', padding: '64px 32px 96px',
          display: 'grid', gridTemplateColumns: '1.05fr 0.95fr', gap: 48, alignItems: 'center',
        }}>
          <div>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(58,168,118,0.12)',
              border: '1px solid rgba(58,168,118,0.25)', borderRadius: 999, padding: '6px 14px',
              fontSize: 12.5, fontWeight: 700, color: '#226b4c', marginBottom: 22,
            }}>
              Built for anyone who doesn’t have time to create and manage content
            </div>
            <h1 style={{ fontSize: 'clamp(32px, 4.2vw, 52px)', fontWeight: 820, lineHeight: 1.08, letterSpacing: '-.02em', marginBottom: 22 }}>
              Your personal brand, on <span style={{ color: 'var(--cta)' }}>autopilot</span> — approved by you, every time.
            </h1>
            <p style={{ fontSize: 17, lineHeight: 1.6, color: 'var(--muted)', maxWidth: 480, marginBottom: 30 }}>
              genNpost researches what’s trending in your field, learns how you write, and drafts
              ready-to-post content for every platform you show up on — all run from a chat with Titto,
              your Telegram-based chief of staff.
            </p>
            <CTAButtons navigate={navigate} size="lg" />
            <p className="hint" style={{ marginTop: 14 }}>No account system yet — both buttons take you straight into the dashboard.</p>
          </div>

          <ProductPreview />
        </div>
      </section>

      {/* How it works */}
      <section style={{ maxWidth: 1200, margin: '0 auto', padding: '88px 32px 72px' }}>
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <div className="hint" style={{ fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--cta)' }}>How it works</div>
          <h2 style={{ fontSize: 32, fontWeight: 780, margin: '10px 0 0', letterSpacing: '-.01em' }}>From idea to posted, in four steps</h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 22 }}>
          {HOW_IT_WORKS.map((s) => (
            <div key={s.n} className="card" style={{ padding: '26px 22px' }}>
              <div style={{
                width: 40, height: 40, borderRadius: '50%', background: 'var(--cta)', color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 16, marginBottom: 18,
              }}>
                {s.n}
              </div>
              <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>{s.title}</div>
              <p className="hint" style={{ lineHeight: 1.55 }}>{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Why genNpost — honest differentiation, not fabricated testimonials */}
      <section style={{ position: 'relative', background: 'var(--canvas)', overflow: 'hidden' }}>
        <div style={{
          position: 'absolute', right: -160, top: -100, width: 480, height: 480, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(58,168,118,0.14), rgba(58,168,118,0) 70%)',
        }} />
        <div style={{ position: 'relative', maxWidth: 1200, margin: '0 auto', padding: '80px 32px' }}>
          <div style={{ textAlign: 'center', marginBottom: 44 }}>
            <div className="hint" style={{ fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--accent)' }}>Why genNpost</div>
            <h2 style={{ fontSize: 32, fontWeight: 780, margin: '10px 0 0', letterSpacing: '-.01em' }}>Not another scheduler</h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 22 }}>
            {WHY.map((w) => (
              <div key={w.title} className="card" style={{ padding: 26 }}>
                <div style={{ width: 42, height: 42, borderRadius: 11, background: w.tint, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                  {w.path ? (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={w.stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d={w.path} />
                    </svg>
                  ) : (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={w.stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" />
                      <rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" />
                    </svg>
                  )}
                </div>
                <div style={{ fontWeight: 700, fontSize: 15.5, marginBottom: 8 }}>{w.title}</div>
                <p className="hint" style={{ lineHeight: 1.55 }}>{w.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section style={{ maxWidth: 760, margin: '0 auto', padding: '88px 32px' }}>
        <h2 style={{ fontSize: 30, fontWeight: 780, textAlign: 'center', marginBottom: 36, letterSpacing: '-.01em' }}>Questions</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {FAQ.map((f) => (
            <div key={f.q} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '20px 22px' }}>
              <div style={{ fontWeight: 700, fontSize: 14.5, marginBottom: 6 }}>{f.q}</div>
              <p className="hint" style={{ lineHeight: 1.55 }}>{f.a}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Final CTA — high-contrast dark band with a warm glow, not a soft pale one */}
      <section style={{ position: 'relative', background: '#15181E', padding: '76px 32px', textAlign: 'center', overflow: 'hidden' }}>
        <div style={{
          position: 'absolute', left: '50%', top: -180, transform: 'translateX(-50%)', width: 700, height: 400,
          borderRadius: '50%', background: 'radial-gradient(circle, rgba(239,125,26,0.25), rgba(239,125,26,0) 70%)',
        }} />
        <div style={{ position: 'relative' }}>
          <h2 style={{ fontSize: 30, fontWeight: 780, color: '#FFFFFF', marginBottom: 26, letterSpacing: '-.01em' }}>Ready to hand off the busywork?</h2>
          <CTAButtons navigate={navigate} size="lg" dark />
        </div>
      </section>

      <footer style={{ textAlign: 'center', padding: 32, color: 'var(--faint)', fontSize: 12.5 }}>
        genNpost — built on Titto
      </footer>
    </div>
  )
}
