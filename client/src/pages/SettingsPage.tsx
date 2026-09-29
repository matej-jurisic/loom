import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Download, LogOut, Monitor, Moon, Sun, Trash2 } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { SettingSection, SettingRow, SectionFooter, inputCls } from '@/components/settings/SettingSection'
import { settingsApi, authApi, exportApi, occurrencesApi, ApiError } from '@/lib/api'
import { toastError } from '@/store/toasts'
import { useAuthStore } from '@/store/auth'
import { getThemePref, setThemePref, type ThemePref } from '@/lib/theme'
import { isNative, getServerUrl, setServerUrl } from '@/lib/server-config'

function timezoneOptions(current: string): string[] {
  const supported =
    'supportedValuesOf' in Intl
      ? (Intl as { supportedValuesOf(key: string): string[] }).supportedValuesOf('timeZone')
      : []
  return supported.includes(current) || !current ? supported : [current, ...supported]
}

const THEME_OPTIONS: { value: ThemePref; label: string; Icon: typeof Sun }[] = [
  { value: 'light',  label: 'Light',  Icon: Sun },
  { value: 'dark',   label: 'Dark',   Icon: Moon },
  { value: 'system', label: 'System', Icon: Monitor },
]

const CLEAR_SCOPES = [
  { value: true,  label: 'Only the past',  hint: 'Before today' },
  { value: false, label: 'Everything',     hint: 'Including upcoming' },
]

// ── page ───────────────────────────────────────────────────────────────────

export function SettingsPage() {
  const qc = useQueryClient()
  const { user, clear } = useAuthStore()
  const [theme, setTheme] = useState<ThemePref>(getThemePref)
  const [serverUrl, setServerUrlState] = useState(getServerUrl)
  const [serverUrlSaved, setServerUrlSaved] = useState(false)

  const { data: settings, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: settingsApi.get,
  })

  const [form, setForm] = useState({ timezone: '', dayBoundaryTime: '00:00', maxFocusGoals: 3 })
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (settings) {
      setForm({
        timezone: settings.timezone,
        dayBoundaryTime: settings.dayBoundaryTime,
        maxFocusGoals: settings.maxFocusGoals,
      })
    }
  }, [settings])

  const saveMutation = useMutation({
    mutationFn: () => settingsApi.update(form),
    onSuccess: () => {
      setSaved(true)
      qc.invalidateQueries({ queryKey: ['settings'] })
      qc.invalidateQueries({ queryKey: ['events'] })
    },
  })


  async function handleLogout() {
    try { await authApi.logout() } finally { clear() }
  }

  const [exporting, setExporting] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const [clearPastOnly, setClearPastOnly] = useState(true)

  const clearMutation = useMutation({
    mutationFn: () => occurrencesApi.clearAll(clearPastOnly),
    onSuccess: () => {
      setConfirmClear(false)
      // Goal progress, heatmaps and activity counts are all derived from occurrences.
      qc.invalidateQueries({ queryKey: ['events'] })
      qc.invalidateQueries({ queryKey: ['activities'] })
      qc.invalidateQueries({ queryKey: ['goals'] })
      qc.invalidateQueries({ queryKey: ['insights'] })
    },
    onError: (err) => toastError(err),
  })

  async function handleExport() {
    setExporting(true)
    try {
      const data = await exportApi.get()
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `loom-export-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      toastError(err)
    } finally {
      setExporting(false)
    }
  }

  function selectTheme(pref: ThemePref) {
    setTheme(pref)
    setThemePref(pref)
  }

  const saveError =
    saveMutation.error instanceof ApiError
      ? saveMutation.error.message
      : saveMutation.error
        ? 'Something went wrong.'
        : null

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <PageHeader title="Settings" />

      <div className="flex-1 overflow-y-auto px-4 py-4 md:px-6 md:py-6">
        <div className="mx-auto max-w-lg">
          {isLoading ? (
            <div className="flex justify-center py-16">
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : (
            <div className="flex flex-col gap-6">

              <SettingSection label="Planning">
                <SettingRow label="Timezone">
                  <select
                    value={form.timezone}
                    onChange={(e) => { setSaved(false); setForm((f) => ({ ...f, timezone: e.target.value })) }}
                    className={`${inputCls} max-w-[200px]`}
                  >
                    {timezoneOptions(form.timezone).map((tz) => (
                      <option key={tz} value={tz}>{tz}</option>
                    ))}
                  </select>
                </SettingRow>

                <SettingRow label="Day start">
                  <input
                    type="time"
                    lang="en-GB"
                    value={form.dayBoundaryTime}
                    onChange={(e) => { setSaved(false); setForm((f) => ({ ...f, dayBoundaryTime: e.target.value })) }}
                    className={inputCls}
                  />
                </SettingRow>

                <SettingRow label="Max focus goals">
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={form.maxFocusGoals}
                    onChange={(e) => { setSaved(false); setForm((f) => ({ ...f, maxFocusGoals: Number(e.target.value) })) }}
                    className={`${inputCls} w-16 text-center`}
                  />
                </SettingRow>

                <SectionFooter
                  status={saved && !saveMutation.isPending ? 'Changes saved.' : undefined}
                  error={saveError}
                  onSave={() => saveMutation.mutate()}
                  isPending={saveMutation.isPending}
                />
              </SettingSection>

              <SettingSection label="Appearance">
                <SettingRow label="Theme">
                  <div className="flex overflow-hidden rounded-md border border-border">
                    {THEME_OPTIONS.map(({ value, label, Icon }) => (
                      <button
                        key={value}
                        onClick={() => selectTheme(value)}
                        className={`flex items-center gap-1.5 border-l border-border px-3 py-1.5 text-xs font-medium transition-colors first:border-l-0 ${
                          theme === value
                            ? 'bg-primary text-primary-foreground'
                            : 'text-muted-foreground hover:bg-muted'
                        }`}
                      >
                        <Icon className="h-3.5 w-3.5" strokeWidth={2} />
                        {label}
                      </button>
                    ))}
                  </div>
                </SettingRow>
              </SettingSection>

              {isNative() && (
                <SettingSection label="Connection">
                  <SettingRow label="Server URL">
                    <input
                      type="url"
                      placeholder="http://192.168.1.100:8080"
                      value={serverUrl}
                      onChange={(e) => { setServerUrlSaved(false); setServerUrlState(e.target.value) }}
                      className={`${inputCls} w-52`}
                    />
                  </SettingRow>
                  <SectionFooter
                    status={serverUrlSaved ? 'Saved.' : undefined}
                    onSave={() => { setServerUrl(serverUrl); setServerUrlSaved(true) }}
                    isPending={false}
                    label="Save"
                  />
                </SettingSection>
              )}

              <SettingSection label="Data">
                <SettingRow label="Export data" hint="Download everything as JSON: goals, checkpoints, categories, activities, occurrences.">
                  <Button variant="outline" size="sm" onClick={handleExport} loading={exporting}>
                    <Download className="mr-1.5 h-3.5 w-3.5" strokeWidth={2} />
                    Export
                  </Button>
                </SettingRow>
                <SettingRow label="Delete history" hint="Clear occurrences and start fresh. Activities and goals stay.">
                  <Button variant="outline" size="sm" onClick={() => setConfirmClear(true)}>
                    <Trash2 className="mr-1.5 h-3.5 w-3.5" strokeWidth={2} />
                    Delete
                  </Button>
                </SettingRow>
              </SettingSection>

              <SettingSection label="Account">
                <SettingRow label={user?.username ?? ''} hint="Signed in">
                  <Button variant="outline" size="sm" onClick={handleLogout}>
                    <LogOut className="mr-1.5 h-3.5 w-3.5" strokeWidth={2} />
                    Sign out
                  </Button>
                </SettingRow>
              </SettingSection>

            </div>
          )}
        </div>
      </div>

      <Modal
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        title="Delete history?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmClear(false)} disabled={clearMutation.isPending}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => clearMutation.mutate()} loading={clearMutation.isPending}>
              Delete history
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            This cannot be undone.
          </p>
          {CLEAR_SCOPES.map(({ value, label, hint }) => (
            <label key={String(value)} className="flex cursor-pointer items-start gap-2.5 text-sm">
              <input
                type="radio"
                name="clear-scope"
                checked={clearPastOnly === value}
                onChange={() => setClearPastOnly(value)}
                className="mt-1"
              />
              <span>
                <span className="font-medium text-foreground">{label}</span>
                <span className="block text-xs text-muted-foreground">{hint}</span>
              </span>
            </label>
          ))}
        </div>
      </Modal>
    </div>
  )
}
