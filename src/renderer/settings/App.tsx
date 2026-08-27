import { useCallback, useEffect, useState, type KeyboardEvent } from 'react'
import type { SettingsState, ShortcutActionId } from '../../shared/types'
import { buildAccelerator, formatAcceleratorForDisplay, type ModifierState } from './acceleratorRecorder'

const SHORTCUT_LABELS: Record<ShortcutActionId, string> = {
  captureArea: 'Capture Area',
  captureFullScreen: 'Capture Full Screen',
  captureText: 'Capture Text (beta)'
}

interface ShortcutRowProps {
  id: ShortcutActionId
  accelerator: string
  onRebind: (id: ShortcutActionId, accelerator: string) => Promise<boolean>
}

function ShortcutRow({ id, accelerator, onRebind }: ShortcutRowProps): JSX.Element {
  const [recording, setRecording] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>) => {
      if (!recording) return
      event.preventDefault()
      if (event.key === 'Escape') {
        setRecording(false)
        setError(null)
        return
      }

      const mods: ModifierState = {
        meta: event.metaKey,
        control: event.ctrlKey,
        alt: event.altKey,
        shift: event.shiftKey
      }
      const result = buildAccelerator(mods, event.key)
      if (result.status === 'pending') return
      if (result.status === 'error') {
        setError(result.message)
        return
      }

      setRecording(false)
      setError(null)
      onRebind(id, result.accelerator)
        .then((ok) => {
          if (!ok) {
            setError(`"${formatAcceleratorForDisplay(result.accelerator)}" is already used by another app.`)
          }
        })
        .catch(() => setError('Could not save this shortcut.'))
    },
    [recording, id, onRebind]
  )

  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-sm text-neutral-200">{SHORTCUT_LABELS[id]}</span>
      <div className="flex items-center gap-2">
        {error && <span className="max-w-[220px] text-right text-xs text-red-400">{error}</span>}
        <button
          type="button"
          onClick={() => {
            setRecording(true)
            setError(null)
          }}
          onKeyDown={handleKeyDown}
          onBlur={() => setRecording(false)}
          className={`min-w-[96px] rounded-md border px-3 py-1.5 font-mono text-sm ${
            recording
              ? 'border-blue-500 bg-blue-500/10 text-blue-300'
              : 'border-neutral-700 bg-neutral-800 text-neutral-100 hover:bg-neutral-700'
          }`}
        >
          {recording ? 'Press keys…' : formatAcceleratorForDisplay(accelerator)}
        </button>
      </div>
    </div>
  )
}

export default function App(): JSX.Element {
  const [state, setState] = useState<SettingsState | null>(null)
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    window.settingsApi
      .getState()
      .then(setState)
      .catch(() => setLoadError(true))
  }, [])

  const rebind = useCallback(async (id: ShortcutActionId, accelerator: string) => {
    const ok = await window.settingsApi.setShortcut(id, accelerator)
    if (ok) {
      setState((prev) => (prev ? { ...prev, shortcuts: { ...prev.shortcuts, [id]: accelerator } } : prev))
    }
    return ok
  }, [])

  if (!state) {
    return (
      <div className="flex h-screen items-center justify-center bg-neutral-900 text-sm text-neutral-500">
        {loadError ? 'Could not load settings.' : 'Loading…'}
      </div>
    )
  }

  return (
    <div className="h-screen overflow-y-auto bg-neutral-900 px-6 py-5 text-neutral-100">
      <section className="mb-6">
        <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">General</h2>
        <label className="flex items-center justify-between py-2">
          <span className="text-sm text-neutral-200">Launch at login</span>
          <input
            type="checkbox"
            checked={state.launchAtLogin}
            onChange={(event) => {
              const enabled = event.target.checked
              setState({ ...state, launchAtLogin: enabled })
              window.settingsApi.setLaunchAtLogin(enabled)
            }}
            className="h-4 w-4 accent-blue-500"
          />
        </label>
      </section>

      <section>
        <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">Shortcuts</h2>
        <div className="divide-y divide-neutral-800">
          <ShortcutRow id="captureArea" accelerator={state.shortcuts.captureArea} onRebind={rebind} />
          <ShortcutRow id="captureFullScreen" accelerator={state.shortcuts.captureFullScreen} onRebind={rebind} />
          <ShortcutRow id="captureText" accelerator={state.shortcuts.captureText} onRebind={rebind} />
        </div>

        <label className="mt-3 flex items-center justify-between py-2">
          <span className="text-sm text-neutral-200">Pause shortcuts</span>
          <input
            type="checkbox"
            checked={state.shortcutsPaused}
            onChange={(event) => {
              const paused = event.target.checked
              setState({ ...state, shortcutsPaused: paused })
              window.settingsApi.setShortcutsPaused(paused)
            }}
            className="h-4 w-4 accent-blue-500"
          />
        </label>

        <button
          type="button"
          onClick={() => window.settingsApi.openKeyboardSettings()}
          className="mt-3 block text-xs text-blue-400 hover:text-blue-300"
        >
          Take over the system screenshot shortcuts (⌘⇧3/4/5) →
        </button>
        <p className="mt-1 text-xs text-neutral-500">
          Opens System Settings → Keyboard → Shortcuts, where you can disable Apple's screenshot shortcuts yourself.
        </p>
      </section>
    </div>
  )
}
