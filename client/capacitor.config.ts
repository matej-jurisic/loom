import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'dev.loom.app',
  appName: 'Loom',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
}

export default config
