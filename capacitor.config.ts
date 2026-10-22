import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.zajilpost.app',
  appName: 'زاجل',
  webDir: '.',
  // Prototype wrapper: loads the currently working hosted website.
  // This does not modify or deploy the production website.
  server: {
    url: 'https://zajil-post-grkd1uyl4-zajil-post.vercel.app',
    cleartext: false,
    androidScheme: 'https',
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;
