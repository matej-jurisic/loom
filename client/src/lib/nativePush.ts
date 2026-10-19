import { PushNotifications } from '@capacitor/push-notifications'
import { notificationsApi } from '@/lib/api'
import { isNative } from '@/lib/server-config'

// Native (FCM) push for the Android app: register this install's token with the server and route
// notification taps. Everything here is a no-op on the web.

let lastToken: string | null = null
let listenersAttached = false
// Replaced on every register call, so a tap uses the current navigator.
let openUrl: (url: string) => void = () => {}

export async function registerNativePush(onOpen: (url: string) => void): Promise<void> {
  if (!isNative()) return
  openUrl = onOpen

  if (!listenersAttached) {
    listenersAttached = true
    await PushNotifications.addListener('registration', async ({ value }) => {
      lastToken = value
      try {
        await notificationsApi.registerDevice(value)
      } catch {
        // Retried on the next launch.
      }
    })
    await PushNotifications.addListener('pushNotificationActionPerformed', ({ notification }) => {
      const url = (notification.data as Record<string, unknown> | undefined)?.url
      openUrl(typeof url === 'string' ? url : '/plan')
    })
  }

  let permission = await PushNotifications.checkPermissions()
  if (permission.receive === 'prompt' || permission.receive === 'prompt-with-rationale') {
    permission = await PushNotifications.requestPermissions()
  }
  if (permission.receive === 'granted') await PushNotifications.register()
}

/** Drops this install's token server-side, so a signed-out device stops getting reminders. */
export async function unregisterNativePush(): Promise<void> {
  if (!isNative() || !lastToken) return
  try {
    await notificationsApi.removeDevice(lastToken)
  } catch {
    // Best-effort: a stale token is pruned once FCM reports it gone.
  }
  lastToken = null
}
