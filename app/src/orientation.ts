// Screen rotation. The app is a portrait app — but the full-screen word card
// is meant to be read with the phone held either way, so it temporarily allows
// rotation and locks back to portrait when it closes. The Info.plist lists the
// landscape orientations so iOS is willing to rotate at all.
import * as ScreenOrientation from 'expo-screen-orientation';

export function lockPortrait() {
  // Fire and forget — a failed lock must never break rendering.
  ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
}

export function allowRotation() {
  // DEFAULT on iOS = every orientation except upside-down portrait.
  ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.DEFAULT).catch(() => {});
}
