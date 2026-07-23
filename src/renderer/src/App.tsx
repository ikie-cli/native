import { AnimatePresence, motion } from 'framer-motion'
import { Suspense, lazy, useEffect } from 'react'
import { Titlebar } from '@/components/layout/Titlebar'
import { Rail } from '@/components/layout/Rail'
import { RightSidebar } from '@/components/layout/RightSidebar'
import { Spinner } from '@/components/ui/ui'
import { useNav } from '@/stores/nav'
import { bootstrapStores } from '@/stores/data'
import { HomeScreen } from '@/screens/Home'
import { ToastLayer } from '@/components/ToastLayer'
import { OnboardingTour } from '@/components/OnboardingTour'
import { UpdateToast } from '@/components/UpdateToast'
import { CrashDialog } from '@/components/CrashDialog'
import { JavaDownloadDialog } from '@/components/JavaDownloadDialog'
import { DownloadsIndicator } from '@/components/DownloadsIndicator'

// Heavy views are lazy-loaded; Home is eager for instant cold start.
const LibraryScreen = lazy(() => import('@/screens/Library').then((m) => ({ default: m.LibraryScreen })))
const DiscoverScreen = lazy(() => import('@/screens/Discover').then((m) => ({ default: m.DiscoverScreen })))
const InstanceScreen = lazy(() => import('@/screens/Instance').then((m) => ({ default: m.InstanceScreen })))
const ServersScreen = lazy(() => import('@/screens/Servers').then((m) => ({ default: m.ServersScreen })))
const SettingsModal = lazy(() => import('@/screens/SettingsModal').then((m) => ({ default: m.SettingsModal })))
const CreateInstanceModal = lazy(() =>
  import('@/screens/CreateInstanceModal').then((m) => ({ default: m.CreateInstanceModal }))
)
const AccountsModal = lazy(() => import('@/screens/AccountsModal').then((m) => ({ default: m.AccountsModal })))
const ProjectModal = lazy(() => import('@/components/ProjectModal').then((m) => ({ default: m.ProjectModal })))
const NewsModal = lazy(() => import('@/components/NewsModal').then((m) => ({ default: m.NewsModal })))

function ScreenFallback(): React.JSX.Element {
  return (
    <div className="flex h-full items-center justify-center">
      <Spinner size={28} />
    </div>
  )
}

export default function App(): React.JSX.Element {
  const route = useNav((s) => s.route)

  useEffect(() => {
    void bootstrapStores()
  }, [])

  const routeKey =
    route.name === 'instance'
      ? `instance:${route.id}`
      : route.name === 'discover'
        ? `discover:${route.instanceId ?? ''}:${route.contentType ?? 'mod'}`
        : route.name

  return (
    <div className="flex h-full flex-col overflow-hidden bg-surface-window">
      <Titlebar />
      <div className="flex min-h-0 flex-1">
        <Rail />
        <main className="relative min-w-0 flex-1 bg-surface-base">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.div
              key={routeKey}
              className="absolute inset-0 overflow-y-auto"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              // pointerEvents none on exit: a fading layer must never swallow
              // clicks aimed at the incoming screen.
              exit={{ opacity: 0, pointerEvents: 'none', transition: { duration: 0.12 } }}
              transition={{ duration: 0.22, ease: [0.25, 1, 0.5, 1] }}
            >
              <Suspense fallback={<ScreenFallback />}>
                {route.name === 'home' && <HomeScreen />}
                {route.name === 'library' && <LibraryScreen />}
                {route.name === 'discover' && (
                  <DiscoverScreen instanceId={route.instanceId} contentType={route.contentType} />
                )}
                {route.name === 'instance' && <InstanceScreen id={route.id} tab={route.tab} />}
                {route.name === 'servers' && <ServersScreen />}
              </Suspense>
            </motion.div>
          </AnimatePresence>
          <DownloadsIndicator />
        </main>
        <RightSidebar />
      </div>

      <Suspense fallback={null}>
        <SettingsModal />
        <CreateInstanceModal />
        <AccountsModal />
        <ProjectModal />
        <NewsModal />
      </Suspense>
      <UpdateToast />
      <CrashDialog />
      <JavaDownloadDialog />
      <ToastLayer />
      <OnboardingTour />
    </div>
  )
}
