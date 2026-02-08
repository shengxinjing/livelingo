import './App.css'
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { Settings as SettingsIcon, Pin, PinOff } from 'lucide-react'
import Settings from './components/Settings'
import Home from './components/Home'

function App() {
  const navigate = useNavigate()
  const location = useLocation()
  const isSettings = location.pathname === '/settings'
  const [isPinned, setIsPinned] = useState(false)

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

  return (
    <div
      className="container"
      style={{
        position: 'relative',
        height: '100vh',
        width: '100vw',
        overflow: 'hidden',
        background: 'rgba(255, 255, 255, 0.88)'
      }}
    >
      {/* Main Content Area */}
      <main style={{ height: '100%', width: '100%', padding: '0', boxSizing: 'border-box' }}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>

      {!isSettings && (
        <button
          onClick={() => navigate('/settings')}
          style={{
            position: 'absolute',
            bottom: '64px',
            left: '24px',
            background: 'rgba(255, 255, 255, 0.9)',
            border: '1px solid #ddd',
            cursor: 'pointer',
            padding: '8px',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#555',
            boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
            zIndex: 100,
            transition: 'transform 0.2s, background 0.2s'
          }}
          title="Settings"
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'scale(1.1)';
            e.currentTarget.style.background = '#fff';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.9)';
          }}
        >
          <SettingsIcon size={20} />
        </button>
      )}

      <button
        onClick={togglePin}
        style={{
          position: 'absolute',
          bottom: '20px',
          left: '24px',
          background: isPinned ? '#ef4444' : 'rgba(255, 255, 255, 0.9)',
          border: isPinned ? '1px solid #ef4444' : '1px solid #ddd',
          cursor: 'pointer',
          padding: '8px',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: isPinned ? '#fff' : '#555',
          boxShadow: isPinned ? '0 4px 12px rgba(239, 68, 68, 0.4)' : '0 2px 10px rgba(0,0,0,0.1)',
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
