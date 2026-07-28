import * as ImagePicker from 'expo-image-picker';

// Sentinel thrown when the OS permission for the camera / photo library was
// denied — the caller turns it into a localized alert.
export const SCAN_PERMISSION_DENIED = 'scan/permission-denied';

export type ScanSource = 'camera' | 'library';

// Capture (camera) or pick (library) one image and return it as base64 JPEG,
// ready to hand to the vision API. Returns null when the user cancels the
// picker. Throws SCAN_PERMISSION_DENIED when access was refused. The image is
// downscaled/compressed so the upload stays small.
export async function captureImageBase64(source: ScanSource): Promise<string | null> {
  const perm =
    source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) throw new Error(SCAN_PERMISSION_DENIED);

  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'],
    base64: true,
    quality: 0.5,
    exif: false,
  };
  const result =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);

  if (result.canceled) return null;
  return result.assets?.[0]?.base64 ?? null;
}
