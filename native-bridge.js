import { Capacitor } from '@capacitor/core';
import { StatusBar } from '@capacitor/status-bar';
import { PushNotifications } from '@capacitor/push-notifications';

// Expose the supported native plugins to the existing vanilla-JS app.
window.__ZajilNative = {
  isNativePlatform: () => Capacitor.isNativePlatform(),
  StatusBar,
  PushNotifications,
};
