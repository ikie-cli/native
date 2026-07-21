import { AnimatePresence, motion } from 'framer-motion'
import { useCallback, useEffect, useLayoutEffect, useState } from 'react'
import { ArrowLeft, ArrowRight, Check } from 'lucide-react'
import { useSettings } from '@/stores/data'
import { PlayerHead } from '@/components/PlayerHead'
import { Button } from '@/components/ui/ui'
import { cn } from '@/lib/util'

/**
 * First-run guided tour: a spotlight glides between rail anchors
 * ([data-tour]) while a card — fronted by an animated player head —
 * explains each area step by step. Skipping or finishing persists
 * `onboardingDone`; Settings → General can replay it.
 */

type Step = {
  id: string
  /** [data-tour] anchor; centered welcome/finish card when absent. */
  target?: string
  title: string
  body: string
}

const STEPS: Step[] = [
  {
    id: 'welcome',
    title: 'Welcome to Native!',
    body: "Your new Minecraft launcher. Take the 60-second tour and you'll know every corner — or skip and explore on your own."
  },
  {
    id: 'account',
    target: 'account',
    title: 'Sign in to play',
    body: 'Add your Microsoft account here — or an offline profile for singleplayer. Once signed in, your skin shows up everywhere.'
  },
  {
    id: 'create',
    target: 'create',
    title: 'Create your first instance',
    body: 'Pick a Minecraft version and a mod loader — Fabric, Quilt, Forge and NeoForge install themselves, matching Java included.'
  },
  {
    id: 'home',
    target: 'home',
    title: 'Home — jump back in',
    body: 'Your recent instances live here with one-click Play, right next to the latest Minecraft news.'
  },
  {
    id: 'discover',
    target: 'discover',
    title: 'Discover content',
    body: 'Search mods, resource packs and shaders, filtered to what fits your instance — and install them with one click.'
  },
  {
    id: 'library',
    target: 'library',
    title: 'Your library',
    body: 'Every instance in one grid: search, sort by last played, and hit Play. Right-click-level power sits behind the ⋮ menu.'
  },
  {
    id: 'servers',
    target: 'servers',
    title: 'Servers',
    body: 'Save your favorite servers, watch who is online with live pings, and quick-join straight into the game.'
  },
  {
    id: 'settings',
    target: 'settings',
    title: 'Make it yours',
    body: 'Five themes, default RAM, Java runtimes and update behavior all live in Settings. This tour can be replayed from here too.'
  },
  {
    id: 'done',
    title: "That's it — have fun!",
    body: "Create an instance and you'll be in a world in under a minute. Good luck out there."
  }
]

const CARD_W = 340
const HOLE_PAD = 8

type Hole = { x: number; y: number; w: number; h: number }

export function OnboardingTour(): React.JSX.Element | null {
  const { settings, loaded, set } = useSettings()
  const [open, setOpen] = useState(true)
  const [idx, setIdx] = useState(0)
  const [hole, setHole] = useState<Hole | null>(null)

  const env = (window as unknown as { native?: { env?: { e2e?: boolean; forceTour?: boolean } } })
    .native?.env
  const allowed = !env?.e2e || Boolean(env?.forceTour)
  const show = loaded && open && !settings.onboardingDone && allowed

  const step = STEPS[idx]
  const last = idx === STEPS.length - 1

  const finish = useCallback((): void => {
    setOpen(false)
    void set({ onboardingDone: true })
  }, [set])

  // When "replay tour" resets the flag, start from the top again.
  useEffect(() => {
    if (!settings.onboardingDone) {
      setOpen(true)
      setIdx(0)
    }
  }, [settings.onboardingDone])

  // Measure the current anchor (and re-measure on resize).
  useLayoutEffect(() => {
    if (!show) return
    const measure = (): void => {
      const el = step.target ? document.querySelector(`[data-tour="${step.target}"]`) : null
      if (!el) {
        // Centered step (welcome/finish) — the hole collapses shut mid-screen.
        setHole({ x: innerWidth / 2, y: innerHeight / 2, w: 0, h: 0 })
        return
      }
      const r = el.getBoundingClientRect()
      setHole({
        x: r.left - HOLE_PAD,
        y: r.top - HOLE_PAD,
        w: r.width + HOLE_PAD * 2,
        h: r.height + HOLE_PAD * 2
      })
    }
    measure()
    addEventListener('resize', measure)
    return () => removeEventListener('resize', measure)
  }, [show, step.target])

  // Keyboard: Esc skips, arrows navigate.
  useEffect(() => {
    if (!show) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') finish()
      else if (e.key === 'ArrowRight') setIdx((i) => Math.min(i + 1, STEPS.length - 1))
      else if (e.key === 'ArrowLeft') setIdx((i) => Math.max(i - 1, 0))
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [show, finish])

  if (!show || !hole) return null

  const centered = !step.target
  const cardX = centered
    ? innerWidth / 2 - CARD_W / 2
    : Math.min(hole.x + hole.w + 18, innerWidth - CARD_W - 16)
  const cardY = centered
    ? innerHeight / 2 - 150
    : Math.max(16, Math.min(hole.y + hole.h / 2 - 130, innerHeight - 320))

  return (
    <div className="fixed inset-0 z-[95]" role="dialog" aria-modal="true" data-testid="tour">
      {/* Spotlight: one element whose giant shadow dims everything else; the
          hole glides and morphs between anchors on a spring. */}
      <motion.div
        className="absolute rounded-full"
        initial={false}
        animate={{ left: hole.x, top: hole.y, width: hole.w, height: hole.h }}
        transition={{ type: 'spring', stiffness: 380, damping: 34 }}
        style={{ boxShadow: '0 0 0 9999px var(--backdrop), 0 0 0 9999px rgba(0,0,0,0.35)' }}
      >
        {!centered && (
          <>
            <span className="absolute inset-0 rounded-full border-2 border-accent" />
            <motion.span
              className="absolute inset-0 rounded-full border-2 border-accent"
              animate={{ scale: [1, 1.45], opacity: [0.8, 0] }}
              transition={{ duration: 1.6, repeat: Infinity, ease: 'easeOut' }}
            />
          </>
        )}
      </motion.div>

      {/* Card */}
      <motion.div
        className="absolute"
        initial={false}
        animate={{ left: cardX, top: cardY }}
        transition={{ type: 'spring', stiffness: 380, damping: 36 }}
        style={{ width: CARD_W }}
      >
        <div className="overflow-hidden rounded-card border border-line-strong bg-surface-raised shadow-modal">
          <div className="flex items-center gap-3 border-b border-line-subtle bg-surface-inset px-5 py-3.5">
            {/* The guide — a real player head, gently bobbing. */}
            <motion.div
              animate={{ y: [0, -3, 0] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
            >
              <PlayerHead account={null} size={34} />
            </motion.div>
            <div className="min-w-0">
              <div className="text-tiny font-semibold uppercase tracking-wider text-content-muted">
                Guide · step {idx + 1} of {STEPS.length}
              </div>
            </div>
          </div>

          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={step.id}
              initial={{ opacity: 0, x: 14 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -14 }}
              transition={{ duration: 0.16 }}
              className="px-5 pb-4 pt-4"
            >
              <div className="text-h3 text-content-primary" data-testid="tour-title">
                {step.title}
              </div>
              <p className="mt-1.5 text-small text-content-secondary">{step.body}</p>
            </motion.div>
          </AnimatePresence>

          <div className="flex items-center gap-1.5 px-5">
            {STEPS.map((s, i) => (
              <span
                key={s.id}
                className={cn(
                  'h-1.5 rounded-full transition-all duration-base',
                  i === idx ? 'w-5 bg-accent' : 'w-1.5 bg-surface-active'
                )}
              />
            ))}
          </div>

          <div className="flex items-center gap-2 px-5 py-4">
            {!last && (
              <Button variant="ghost" size="sm" onClick={finish} data-testid="tour-skip">
                Skip
              </Button>
            )}
            <span className="flex-1" />
            {idx > 0 && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setIdx((i) => i - 1)}
                data-testid="tour-back"
                aria-label="Back"
              >
                <ArrowLeft size={15} />
              </Button>
            )}
            <Button
              size="sm"
              onClick={() => (last ? finish() : setIdx((i) => i + 1))}
              data-testid="tour-next"
            >
              {last ? (
                <>
                  <Check size={15} /> Let&apos;s play
                </>
              ) : idx === 0 ? (
                <>
                  Show me around <ArrowRight size={15} />
                </>
              ) : (
                <>
                  Next <ArrowRight size={15} />
                </>
              )}
            </Button>
          </div>
        </div>
      </motion.div>
    </div>
  )
}
