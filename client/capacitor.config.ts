import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'dev.loom.app',
  appName: 'Loom',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  plugins: {
    // Android drops a push that arrives while the app is open unless this asks for it to be shown.
    PushNotifications: {
      presentationOptions: ['sound', 'alert'],
    },
  },
}

export default config
