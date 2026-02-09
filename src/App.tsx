import './App.css'
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { Settings as SettingsIcon, Pin, PinOff, X } from 'lucide-react'
import Settings from './components/Settings'
import Home from './components/Home'

function App() {
  const titlebarSafeTop = 34
  const navigate = useNavigate()
  const location = useLocation()
  const isSettings = location.pathname === '/settings'
  const [isPinned, setIsPinned] = useState(false)
  const [externalSelectionPayload, setExternalSelectionPayload] = useState<ExternalSelectionPayload | null>(null)
  const [externalSelectionVersion, setExternalSelectionVersion] = useState(0)

  useEffect(() => {
    const loadPinState = async () => {
      const value = await window.appApi.windowControl.getAlwaysOnTop()
      setIsPinned(value)
    }
    void loadPinState()
  }, [])

  const togglePin = async () => {
    const next = await window.appApi.windowControl.setAlwaysOnTop(!isPinned)
    setIsPinned(next)
  }

  useEffect(() => {
    const off = window.appApi.externalSelection.onTranslated((payload) => {
      setExternalSelectionPayload(payload)
      setExternalSelectionVersion((prev) => prev + 1)
      navigate('/')
    })
    return () => off()
  }, [navigate])

  return (
    <div
      className="container"
      style={{
        position: 'relative',
        height: '100vh',
        width: '100vw',
        overflow: 'hidden',
        paddingTop: `${titlebarSafeTop}px`,
        boxSizing: 'border-box',
        borderRadius: '14px',
        background: 'rgba(17, 24, 39, 0.62)',
        border: '1px solid rgba(148, 163, 184, 0.3)'
      }}
    >
      {/* Main Content Area */}
      <main style={{ height: '100%', width: '100%', padding: '0', boxSizing: 'border-box' }}>
        <Routes>
          <Route
            path="/"
            element={
              <Home
                externalSelectionPayload={externalSelectionPayload}
                externalSelectionVersion={externalSelectionVersion}
              />
            }
          />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>

      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '30px',
          ['WebkitAppRegion' as never]: 'drag',
          cursor: 'grab',
          zIndex: 90
        }}
      />

      {!isSettings && (
        <button
          onClick={() => navigate('/settings')}
          style={{
            position: 'absolute',
            bottom: '64px',
            right: '24px',
            background: 'rgba(248, 250, 252, 0.92)',
            border: '1px solid rgba(203, 213, 225, 0.9)',
            cursor: 'pointer',
            padding: '8px',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#555',
            boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
            ['WebkitAppRegion' as never]: 'no-drag',
            zIndex: 100,
            transition: 'transform 0.2s, background 0.2s'
          }}
          title="Settings"
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'scale(1.1)';
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.98)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
            e.currentTarget.style.background = 'rgba(248, 250, 252, 0.92)';
          }}
        >
          <SettingsIcon size={20} />
        </button>
      )}

      <button
        onClick={() => void window.appApi.windowControl.close()}
        style={{
          position: 'absolute',
          top: '8px',
          right: '12px',
          background: 'rgba(248, 250, 252, 0.92)',
          border: '1px solid rgba(203, 213, 225, 0.9)',
          cursor: 'pointer',
          padding: '8px',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#555',
          boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
          ['WebkitAppRegion' as never]: 'no-drag',
          zIndex: 130
        }}
        title="Close"
      >
        <X size={18} />
      </button>

      <button
        onClick={togglePin}
        style={{
          position: 'absolute',
          bottom: '20px',
          right: '24px',
          background: isPinned ? '#ef4444' : 'rgba(248, 250, 252, 0.92)',
          border: isPinned ? '1px solid #ef4444' : '1px solid rgba(203, 213, 225, 0.9)',
          cursor: 'pointer',
          padding: '8px',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: isPinned ? '#fff' : '#555',
          boxShadow: isPinned ? '0 4px 12px rgba(239, 68, 68, 0.4)' : '0 2px 10px rgba(0,0,0,0.1)',
          ['WebkitAppRegion' as never]: 'no-drag',
          zIndex: 100
        }}
        title={isPinned ? 'Unpin window' : 'Pin window on top'}
      >
        {isPinned ? <PinOff size={18} /> : <Pin size={18} />}
      </button>
    </div>
  )
}

export default App
