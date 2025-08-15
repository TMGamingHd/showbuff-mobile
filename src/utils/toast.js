import { Platform, ToastAndroid } from 'react-native';

export const showToast = (message) => {
  if (!message) return;
  if (Platform.OS === 'android') {
    try {
      ToastAndroid.show(message, ToastAndroid.SHORT);
    } catch (e) {
      console.log('Toast error:', e, message);
    }
  } else {
    // Non-blocking fallback for iOS: log for now.
    // Consider integrating a UI toast library later.
    console.log('Toast:', message);
  }
};

export default { showToast };
