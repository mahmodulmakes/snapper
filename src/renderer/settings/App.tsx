import { useCallback, useEffect, useState, type KeyboardEvent } from 'react'
import type { SettingsState, ShortcutActionId } from '../../shared/types'
import { buildAccelerator, formatAcceleratorForDisplay, type ModifierState } from './acceleratorRecorder'

const SHORTCUT_LABELS: Record<ShortcutActionId, string> = {
  captureArea: 'Capture Area',
  captureFullScreen: 'Capture Full Screen',
  captureText: 'Capture Text'
}

interface ToggleProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
}

/** One consistent switch style for every on/off setting in this window, replacing a mix of default browser checkboxes. */
function Toggle({ checked, onChange, label }: ToggleProps): JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${checked ? 'bg-blue-500' : 'bg-neutral-300 dark:bg-neutral-700'}`}
    >
      <span
        className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
          checked ? 'translate-x-4' : 'translate-x-0'
        }`}
      />
    </button>
  )
}

interface ShortcutRowProps {
  id: ShortcutActionId
  accelerator: string
  conflicted: boolean
  onRebind: (id: ShortcutActionId, accelerator: string) => Promise<boolean>
}

function ShortcutRow({ id, accelerator, conflicted, onRebind }: ShortcutRowProps): JSX.Element {
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
    <div className="flex items-center justify-between py-2.5">
      <span className="flex items-center gap-1.5 text-sm text-neutral-800 dark:text-neutral-200">
        {SHORTCUT_LABELS[id]}
        {conflicted && (
          <span
            className="text-amber-600 dark:text-amber-400"
            title="Already used by another app, so this shortcut won't respond. Click the keybinding below to change it."
          >
            ⚠
          </span>
        )}
      </span>
      <div className="flex items-center gap-3">
        {error && (
          <span className="max-w-[220px] text-right text-xs text-red-600 dark:text-red-400">{error}</span>
        )}
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
              ? 'border-blue-500 bg-blue-500/10 text-blue-600 dark:text-blue-300'
              : 'border-neutral-300 bg-neutral-100 text-neutral-900 hover:bg-neutral-200 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 dark:hover:bg-neutral-700'
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
      setState((prev) =>
        prev
          ? {
              ...prev,
              shortcuts: { ...prev.shortcuts, [id]: accelerator },
              shortcutConflicts: { ...prev.shortcutConflicts, [id]: false }
            }
          : prev
      )
    }
    return ok
  }, [])

  if (!state) {
    return (
      <div className="flex h-screen items-center justify-center bg-white text-sm text-neutral-600 dark:text-neutral-500 dark:bg-neutral-900">
        {loadError ? 'Could not load settings.' : 'Loading…'}
      </div>
    )
  }

  return (
    <main className="h-screen overflow-y-auto bg-white px-5 py-5 text-neutral-900 dark:bg-neutral-900 dark:text-neutral-100">
      <section className="mb-4 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-neutral-600 dark:text-neutral-500">General</h2>

        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-neutral-800 dark:text-neutral-200">Launch at login</div>
            <div className="mt-0.5 text-xs text-neutral-600 dark:text-neutral-500">Automatically start Snapper when you log in.</div>
          </div>
          <Toggle
            checked={state.launchAtLogin}
            onChange={(enabled) => {
              setState({ ...state, launchAtLogin: enabled })
              window.settingsApi.setLaunchAtLogin(enabled)
            }}
            label="Launch at login"
          />
        </div>

        <div className="mt-4 flex items-center justify-between">
          <div>
            <div className="text-sm text-neutral-800 dark:text-neutral-200">Pause shortcuts</div>
            <div className="mt-0.5 text-xs text-neutral-600 dark:text-neutral-500">Temporarily disable every capture shortcut.</div>
          </div>
          <Toggle
            checked={state.shortcutsPaused}
            onChange={(paused) => {
              setState({ ...state, shortcutsPaused: paused })
              window.settingsApi.setShortcutsPaused(paused)
            }}
            label="Pause shortcuts"
          />
        </div>

        <div className="mt-4 flex items-center justify-between">
          <div>
            <div className="text-sm text-neutral-800 dark:text-neutral-200">Save screenshots to disk</div>
            <div className="mt-0.5 text-xs text-neutral-600 dark:text-neutral-500">
              Also save a copy of every screenshot to a folder on your Mac.
            </div>
          </div>
          <Toggle
            checked={state.saveToDisk}
            onChange={(enabled) => {
              setState({ ...state, saveToDisk: enabled })
              window.settingsApi.setSaveToDisk(enabled)
            }}
            label="Save screenshots to disk"
          />
        </div>
        {state.saveToDisk && (
          <div className="mt-3 flex items-center gap-2">
            <span
              className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap rounded-md border border-neutral-300 bg-neutral-100 px-2.5 py-1.5 text-xs text-neutral-600 opacity-60 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
              title={state.saveDirectory}
            >
              {state.saveDirectory}
            </span>
            <button
              type="button"
              onClick={() => {
                window.settingsApi.chooseSaveFolder().then((chosen) => {
                  if (chosen) setState((prev) => (prev ? { ...prev, saveDirectory: chosen } : prev))
                })
              }}
              className="shrink-0 rounded-md border border-neutral-300 bg-neutral-100 px-3 py-1.5 text-xs text-neutral-900 hover:bg-neutral-200 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 dark:hover:bg-neutral-700"
            >
              Choose…
            </button>
          </div>
        )}
      </section>

      <section className="mb-4 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
        <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-600 dark:text-neutral-500">Shortcuts</h2>
        <div className="divide-y divide-neutral-200 dark:divide-neutral-800">
          <ShortcutRow
            id="captureArea"
            accelerator={state.shortcuts.captureArea}
            conflicted={state.shortcutConflicts.captureArea}
            onRebind={rebind}
          />
          <ShortcutRow
            id="captureFullScreen"
            accelerator={state.shortcuts.captureFullScreen}
            conflicted={state.shortcutConflicts.captureFullScreen}
            onRebind={rebind}
          />
          <ShortcutRow
            id="captureText"
            accelerator={state.shortcuts.captureText}
            conflicted={state.shortcutConflicts.captureText}
            onRebind={rebind}
          />
        </div>
      </section>

      <section className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-600 dark:text-neutral-500">Advanced</h2>
        <button
          type="button"
          onClick={() => window.settingsApi.openKeyboardSettings()}
          className="block text-xs text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300"
        >
          Take over the system screenshot shortcuts (⌘⇧3/4/5) →
        </button>
        <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-500">
          Opens System Settings → Keyboard → Shortcuts, where you can disable Apple's screenshot shortcuts yourself.
        </p>
      </section>
    </main>
  )
}
