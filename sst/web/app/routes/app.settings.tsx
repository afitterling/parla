import { Scaffold } from '~/components/Scaffold';

// Settings screen — languages, UI language, theme, start mode, Pro.
//
// Port from: desktop/src/renderer/src/screens/SettingsScreen.tsx
export default function SettingsRoute() {
  return (
    <Scaffold
      title="Einstellungen"
      portedFrom="desktop/src/renderer/src/screens/SettingsScreen.tsx"
      todo={[
        'Input/goal language pickers (LanguagePicker — searchable, ~101 Whisper languages)',
        'UI language select + theme (light/dark/system) + default dialog mode',
        'NOTE: no OpenAI-key field here. On the web the key is an SST secret and',
        '  never reaches the browser — that row from the desktop UI does not port.',
        'Parla Pro: needs a web billing path (Stripe?) — RevenueCat/StoreKit is iOS-only.',
        '  See TODO.md, "Confirm the desktop (Electron) app\'s Pro story separately".',
      ]}
    />
  );
}
