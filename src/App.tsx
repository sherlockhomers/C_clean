import { Suspense, lazy } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import AppLayout from './components/layout/AppLayout'

const Dashboard = lazy(() => import('./pages/Dashboard'))
const QuickClean = lazy(() => import('./pages/QuickClean'))
const Detective = lazy(() => import('./pages/Detective'))
const DeepScan = lazy(() => import('./pages/DeepScan'))
const SoftwareMigrate = lazy(() => import('./pages/SoftwareMigrate'))
const PathMigrate = lazy(() => import('./pages/PathMigrate'))
const AIAssistant = lazy(() => import('./pages/AIAssistant'))
const Monitor = lazy(() => import('./pages/Monitor'))
const Settings = lazy(() => import('./pages/Settings'))
const About = lazy(() => import('./pages/About'))

function PageFallback() {
  return (
    <div className="card-base p-6 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
      正在加载页面...
    </div>
  )
}

export default function App() {
  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>
        <Route path="/" element={<AppLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="quick-clean" element={<QuickClean />} />
          <Route path="detective" element={<Detective />} />
          <Route path="deep-scan" element={<DeepScan />} />
          <Route path="software-migrate" element={<SoftwareMigrate />} />
          <Route path="path-migrate" element={<PathMigrate />} />
          <Route path="ai-assistant" element={<AIAssistant />} />
          <Route path="monitor" element={<Monitor />} />
          <Route path="settings" element={<Settings />} />
          <Route path="about" element={<About />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </Suspense>
  )
}
