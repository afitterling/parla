import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  MapPin,
  Copy,
  Check,
  ExternalLink,
  X,
  Volume2,
  Square,
  Mic,
} from 'lucide-react';
import { Settings } from '../storage';
import { findLanguage, speechLocale } from '../languages';
import { EMERGENCY_PHRASES, emergencyText, hasEmergencyTexts } from '../emergency';
import { transcribeAudio, translateSpeech } from '../api';
import { useRecorder } from '../recorder';
import { BusyOverlay } from '../components/BusyOverlay';
import { useT } from '../i18n/I18nContext';

type Props = {
  onClose: () => void;
  settings: Settings;
};

// Which side of the conversation is speaking into the interpreter: 'me' = the
// learner (input language), 'them' = the local person (goal language).
type Side = 'me' | 'them';

type Exchange = {
  side: Side;
  heard: string; // what was transcribed
  translated: string; // the translation into the other side's language
  reading?: string; // Latin reading of the translation, when its script needs one
};

type LocationState =
  | { status: 'idle' | 'loading' | 'denied' | 'error' }
  | { status: 'ready'; address: string; coords: string };

// Pick the best-matching installed voice for a BCP-47 locale (exact first, then
// same base language) so phrases are read by a native voice.
function pickVoice(locale?: string): SpeechSynthesisVoice | undefined {
  if (!locale) return undefined;
  const voices = window.speechSynthesis.getVoices();
  const want = locale.toLowerCase();
  const base = want.split('-')[0];
  return (
    voices.find((v) => v.lang.toLowerCase() === want) ??
    voices.find((v) => v.lang.toLowerCase().startsWith(base))
  );
}

// Reverse-geocode coordinates to a human address, best-effort, via OpenStreetMap
// Nominatim. On any failure we return '' — the coordinates alone are still
// useful. (webSecurity is off in the main window, so this cross-origin fetch is
// allowed.)
async function reverseGeocode(lat: number, lon: number): Promise<string> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`;
    const res = await fetch(url, { headers: { 'Accept-Language': 'en' } });
    if (!res.ok) return '';
    const data = await res.json();
    const a = data?.address ?? {};
    return [
      [a.road, a.house_number].filter(Boolean).join(' '),
      a.postcode,
      a.city ?? a.town ?? a.village ?? a.suburb,
      a.state,
      a.country,
    ]
      .filter(Boolean)
      .join(', ');
  } catch {
    return '';
  }
}

// Full-screen emergency mode: fixed phrases in the local (goal) language, the
// current location to show a helper, and a turn-based two-way interpreter on
// the current language pair. Opened from the red header button (opt-in via
// Settings).
export function EmergencyScreen({ onClose, settings }: Props) {
  const t = useT();
  const recorder = useRecorder();

  const input = findLanguage(settings.inputLanguage);
  const goal = findLanguage(settings.goalLanguage);

  const [loc, setLoc] = useState<LocationState>({ status: 'idle' });
  const [recordingSide, setRecordingSide] = useState<Side | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [exchange, setExchange] = useState<Exchange | null>(null);
  const [speakingKey, setSpeakingKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Fetch the location when the screen opens — in an emergency the fix must be
  // current, not from the last time the screen was used.
  useEffect(() => {
    let alive = true;
    setLoc({ status: 'loading' });
    if (!navigator.geolocation) {
      setLoc({ status: 'error' });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const coords = `${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`;
        const address = await reverseGeocode(pos.coords.latitude, pos.coords.longitude);
        if (alive) setLoc({ status: 'ready', address, coords });
      },
      (err) => {
        if (alive) setLoc({ status: err.code === err.PERMISSION_DENIED ? 'denied' : 'error' });
      },
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 }
    );
    return () => {
      alive = false;
    };
  }, []);

  // Stop speech / recording / in-flight work when the screen unmounts.
  useEffect(() => {
    return () => {
      window.speechSynthesis.cancel();
      abortRef.current?.abort();
    };
  }, []);

  function speakPhrase(key: string, text: string, locale: string) {
    if (speakingKey === key) {
      window.speechSynthesis.cancel();
      setSpeakingKey(null);
      return;
    }
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = locale;
    const voice = pickVoice(locale);
    if (voice) u.voice = voice;
    u.onend = () => setSpeakingKey(null);
    u.onerror = () => setSpeakingKey(null);
    setSpeakingKey(key);
    window.speechSynthesis.speak(u);
  }

  function speakOut(text: string, locale: string) {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = locale;
    const voice = pickVoice(locale);
    if (voice) u.voice = voice;
    window.speechSynthesis.speak(u);
  }

  function cancel() {
    abortRef.current?.abort();
    setBusy(null);
  }

  // Build the worded distress message: what it is, where I am, and what I need,
  // plus a maps link the recipient can open directly.
  function distressMessage(): string | null {
    if (loc.status !== 'ready') return null;
    const query = loc.coords.replace(/\s/g, ''); // "lat, lng" → "lat,lng"
    const mapsUrl = `https://maps.google.com/?q=${query}`;
    const where = [loc.address, loc.coords].filter(Boolean).join(' — ');
    return [`${t('emergency.shareIntro')} ${where}`, mapsUrl, t('emergency.shareOutro')]
      .filter(Boolean)
      .join('\n');
  }

  async function copyDistress() {
    const message = distressMessage();
    if (!message) return;
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard blocked — nothing to do
    }
  }

  // Open the location in the system browser's map (main routes window.open to
  // the OS browser via setWindowOpenHandler).
  function openMaps() {
    if (loc.status !== 'ready') return;
    const query = loc.coords.replace(/\s/g, '');
    window.open(`https://maps.google.com/?q=${query}`, '_blank');
  }

  // One interpreter turn: click a side's button to record, click again to stop —
  // then Whisper transcribes in that side's language, the translation into the
  // other language is shown big and spoken aloud. Then the other side clicks.
  async function onSidePress(side: Side) {
    // A click on the *other* button while recording is ignored — the running
    // turn must be stopped first.
    if (recordingSide && recordingSide !== side) return;

    const from = side === 'me' ? input : goal;
    const to = side === 'me' ? goal : input;

    if (!recordingSide) {
      try {
        window.speechSynthesis.cancel();
        await recorder.start();
        setRecordingSide(side);
      } catch (e: any) {
        window.alert(e?.message ?? String(e));
      }
      return;
    }

    // Stop pressed → transcribe → translate → show + speak.
    setRecordingSide(null);
    const blob = await recorder.stop();
    if (!blob) return;
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      setBusy(t('dialog.transcribing'));
      const heard = await transcribeAudio(blob, settings.openaiKey, from, ctrl.signal);
      if (!heard.trim()) throw new Error(t('emergency.nothingHeard'));
      setBusy(t('emergency.translating'));
      const res = await translateSpeech(
        settings.openaiKey,
        heard,
        from,
        to,
        !!to.romanize,
        ctrl.signal
      );
      setExchange({ side, heard, translated: res.text, reading: res.reading });
      speakOut(res.text, speechLocale(to));
    } catch (e: any) {
      if (!ctrl.signal.aborted) window.alert(e?.message ?? String(e));
    } finally {
      setBusy(null);
      abortRef.current = null;
    }
  }

  const fallbackToEnglish = !hasEmergencyTexts(goal.code);

  return (
    <div className="emergency-root">
      {/* Red header — unmistakably the emergency context. */}
      <div className="emergency-header">
        <div className="emergency-hicon">
          <AlertTriangle size={20} />
        </div>
        <div className="emergency-htext">
          <h2 className="emergency-title">{t('emergency.title')}</h2>
          <div className="emergency-subtitle">
            {input.nativeName} ↔ {goal.nativeName}
          </div>
        </div>
        <button
          className="emergency-share"
          onClick={copyDistress}
          disabled={loc.status !== 'ready'}
          title={t('emergency.shareLocation')}
          aria-label={t('emergency.shareLocation')}
        >
          {copied ? <Check size={18} /> : <Copy size={18} />}
        </button>
        <button className="emergency-close" onClick={onClose} aria-label={t('common.cancel')}>
          <X size={22} />
        </button>
      </div>

      <div className="emergency-body">
        {/* Current location — show it to a helper or read it to the dispatcher. */}
        <div className="emergency-loc-card">
          <MapPin size={20} className="emergency-loc-pin" />
          <div className="emergency-loc-text">
            {loc.status === 'ready' ? (
              <>
                {!!loc.address && <div className="emergency-loc-address">{loc.address}</div>}
                <div className="emergency-loc-coords">{loc.coords}</div>
              </>
            ) : (
              <div className="emergency-loc-hint">
                {loc.status === 'loading'
                  ? t('emergency.locating')
                  : loc.status === 'denied'
                    ? t('emergency.locationDenied')
                    : t('emergency.locationFailed')}
              </div>
            )}
          </div>
          {loc.status === 'ready' && (
            <button className="emergency-maps" onClick={openMaps} title={t('emergency.openMaps')}>
              <ExternalLink size={16} />
            </button>
          )}
        </div>

        {/* Fixed phrases: local language big (show the screen to someone),
            reading + app-language meaning underneath, click to speak. */}
        <div className="emergency-section-label">{t('emergency.phrases').toUpperCase()}</div>
        {fallbackToEnglish && (
          <div className="emergency-fallback">{t('emergency.fallbackEn')}</div>
        )}
        {EMERGENCY_PHRASES.map((p) => {
          const local = emergencyText(p, goal.code);
          const speaking = speakingKey === p.key;
          return (
            <button
              key={p.key}
              className={`emergency-phrase${speaking ? ' active' : ''}`}
              onClick={() => speakPhrase(p.key, local.text, speechLocale(goal))}
            >
              <div className="emergency-phrase-text">
                <div className="emergency-phrase-local">{local.text}</div>
                {!!local.reading && (
                  <div className="emergency-phrase-reading">{local.reading}</div>
                )}
                <div className="emergency-phrase-meaning">{t('emergency.p.' + p.key)}</div>
              </div>
              {speaking ? <Square size={20} /> : <Volume2 size={20} />}
            </button>
          );
        })}
      </div>

      {/* Two-way interpreter, pinned at the bottom. */}
      <div className="emergency-interpreter">
        {exchange && (
          <div className="emergency-exchange">
            <div className="emergency-exchange-heard">{exchange.heard}</div>
            <div className="emergency-exchange-text">{exchange.translated}</div>
            {!!exchange.reading && (
              <div className="emergency-exchange-reading">{exchange.reading}</div>
            )}
          </div>
        )}
        <div className="emergency-interpreter-hint">
          {recordingSide ? t('dialog.recHint') : t('emergency.interpreterHint')}
        </div>
        <div className="emergency-mic-row">
          {(['me', 'them'] as Side[]).map((side) => {
            const lang = side === 'me' ? input : goal;
            const active = recordingSide === side;
            const disabled = !!recordingSide && !active;
            return (
              <button
                key={side}
                className={`emergency-mic${active ? ' active' : ''}`}
                disabled={disabled}
                onClick={() => onSidePress(side)}
              >
                {active ? <Square size={24} /> : <Mic size={24} />}
                <span className="emergency-mic-label">{lang.nativeName}</span>
              </button>
            );
          })}
        </div>
      </div>

      <BusyOverlay visible={!!busy} label={busy} onCancel={cancel} />
    </div>
  );
}
