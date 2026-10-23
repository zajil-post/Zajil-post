import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.zajilpost.app',
  appName: 'زاجل',
  webDir: 'www',
  // Bundle the interface locally. Backend/API requests remain online.
  android: {
    allowMixedContent: false,
  },
};

export default config;
