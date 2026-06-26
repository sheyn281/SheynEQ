import { ChevronDown, ChevronRight, Heart, Moon, Power, SlidersHorizontal, Sun, Waves } from 'lucide-react';
import type { ChangeEvent, CSSProperties, PointerEvent, ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GlassPanel } from '../components/GlassPanel';
import { IconButton } from '../components/IconButton';
import { SliderField } from '../components/SliderField';
import { ToggleSwitch } from '../components/ToggleSwitch';
import { ThemeProvider } from '../theme/ThemeProvider';
import { EQ_BANDS, type AnalyzerSnapshot, type EqFrequency, type EqSettings, type TabEffectsSettings } from './tabAudioEngine';

type ThemeName = 'dark' | 'light';
type EqMode = 'sliders' | 'curve';
type SectionId = 'equalizer' | 'effects';

interface AppSettings {
  enabled: boolean;
  theme: ThemeName;
  eqMode: EqMode;
  collapsed: Record<SectionId, boolean>;
  eq: EqSettings;
  effects: TabEffectsSettings;
}

interface OffscreenSettings {
  eq: EqSettings;
  effects: TabEffectsSettings;
}

interface OffscreenStatus {
  running: boolean;
  level: AnalyzerSnapshot;
  message: string;
}

interface OffscreenResponse {
  ok: boolean;
  status?: OffscreenStatus;
  error?: string;
}

type OffscreenCommand =
  | { type: 'SHEYNFX_OFFSCREEN_START'; streamId: string; settings: OffscreenSettings }
  | { type: 'SHEYNFX_OFFSCREEN_STOP' }
  | { type: 'SHEYNFX_OFFSCREEN_UPDATE_SETTINGS'; settings: OffscreenSettings }
  | { type: 'SHEYNFX_OFFSCREEN_GET_STATUS' };

const STORAGE_KEY = 'sheynfx.tabcapture.v1';
const OFFSCREEN_DOCUMENT_PATH = 'offscreen.html';

const FLAT_EQ = EQ_BANDS.reduce<EqSettings>((eq, frequency) => {
  eq[frequency] = 0;
  return eq;
}, {} as EqSettings);

const DEFAULT_SETTINGS: AppSettings = {
  enabled: false,
  theme: 'dark',
  eqMode: 'curve',
  collapsed: {
    equalizer: false,
    effects: false
  },
  eq: FLAT_EQ,
  effects: {
    bassBoost: { enabled: false, amount: 0.35, autoProtect: true, protection: 0.6 },
    volumeBoost: { amount: 1 },
    reverb: { enabled: false, mix: 0.18 },
    nightMode: { enabled: false, amount: 0.5 },
    slowedReverb: { enabled: false, amount: 0.45 },
    nightcore: { enabled: false, amount: 0.5 },
    speed: { enabled: false, rate: 1 },
    pitch: { enabled: false, semitones: 0 }
  }
};

function formatDb(value: number): string {
  return `${value > 0 ? '+' : ''}${value.toFixed(1)} dB`;
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function sanitizeSettings(value: Partial<AppSettings> | undefined): AppSettings {
  return {
    ...DEFAULT_SETTINGS,
    ...value,
    eq: { ...DEFAULT_SETTINGS.eq, ...value?.eq },
    effects: {
      bassBoost: { ...DEFAULT_SETTINGS.effects.bassBoost, ...value?.effects?.bassBoost },
      volumeBoost: { ...DEFAULT_SETTINGS.effects.volumeBoost, ...value?.effects?.volumeBoost },
      reverb: { ...DEFAULT_SETTINGS.effects.reverb, ...value?.effects?.reverb },
      nightMode: { ...DEFAULT_SETTINGS.effects.nightMode, ...value?.effects?.nightMode },
      slowedReverb: { ...DEFAULT_SETTINGS.effects.slowedReverb, ...value?.effects?.slowedReverb },
      nightcore: { ...DEFAULT_SETTINGS.effects.nightcore, ...value?.effects?.nightcore },
      speed: { ...DEFAULT_SETTINGS.effects.speed, ...value?.effects?.speed },
      pitch: { ...DEFAULT_SETTINGS.effects.pitch, ...value?.effects?.pitch }
    },
    collapsed: { ...DEFAULT_SETTINGS.collapsed, ...value?.collapsed }
  };
}

async function loadSettings(): Promise<AppSettings> {
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    return sanitizeSettings(result[STORAGE_KEY] as Partial<AppSettings> | undefined);
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);
  return sanitizeSettings(raw ? (JSON.parse(raw) as Partial<AppSettings>) : undefined);
}

async function saveSettings(settings: AppSettings): Promise<void> {
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    await chrome.storage.local.set({ [STORAGE_KEY]: settings });
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

async function ensureOffscreenDocument(): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.offscreen) {
    throw new Error('chrome.offscreen is unavailable. Reload the extension after adding offscreen permission.');
  }

  try {
    await chrome.offscreen.createDocument({
      url: OFFSCREEN_DOCUMENT_PATH,
      reasons: [chrome.offscreen.Reason.USER_MEDIA],
      justification: 'SheynEQ keeps tab audio processing active after the popup closes.'
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes('Only a single offscreen document')) {
      throw error;
    }
  }
}

async function getActiveTabId(): Promise<number> {
  if (typeof chrome === 'undefined' || !chrome.tabs) {
    throw new Error('Chrome tabs API is unavailable.');
  }

  return new Promise((resolve, reject) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tabId = tabs[0]?.id;
      if (typeof tabId === 'number') {
        resolve(tabId);
        return;
      }
      reject(new Error('No active tab is available.'));
    });
  });
}

async function getActiveTabStreamId(): Promise<string> {
  if (typeof chrome === 'undefined' || !chrome.tabCapture?.getMediaStreamId) {
    throw new Error('chrome.tabCapture.getMediaStreamId is unavailable. Reload the extension after adding tabCapture permission.');
  }

  const targetTabId = await getActiveTabId();

  return new Promise((resolve, reject) => {
    chrome.tabCapture.getMediaStreamId({ targetTabId }, (streamId) => {
      const lastError = chrome.runtime.lastError;
      if (lastError || !streamId) {
        reject(new Error(lastError?.message ?? 'Could not create a tab audio stream id.'));
        return;
      }
      resolve(streamId);
    });
  });
}

async function sendOffscreenCommand(command: OffscreenCommand): Promise<OffscreenResponse> {
  if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) {
    return { ok: false, error: 'Chrome runtime messaging is unavailable.' };
  }

  return new Promise((resolve) => {
    chrome.runtime.sendMessage(command, (response?: OffscreenResponse) => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        resolve({ ok: false, error: lastError.message });
        return;
      }
      resolve(response ?? { ok: false, error: 'SheynEQ offscreen audio engine did not respond.' });
    });
  });
}

interface SectionProps {
  children: ReactNode;
  collapsed: boolean;
  icon: ReactNode;
  onToggle: () => void;
  title: string;
}

function Section({ children, collapsed, icon, onToggle, title }: SectionProps) {
  return (
    <GlassPanel>
      <button className="section-header" onClick={onToggle} type="button">
        <span className="panel-heading">
          {icon}
          <h2>{title}</h2>
        </span>
        {collapsed ? <ChevronRight size={17} /> : <ChevronDown size={17} />}
      </button>
      {!collapsed && children}
    </GlassPanel>
  );
}

interface EqCurveProps {
  disabled: boolean;
  eq: EqSettings;
  onChange: (frequency: EqFrequency, gainDb: number) => void;
}

function EqCurve({ disabled, eq, onChange }: EqCurveProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const width = 330;
  const height = 180;
  const paddingX = 18;
  const paddingY = 22;
  const usableWidth = width - paddingX * 2;
  const usableHeight = height - paddingY * 2;

  const points = EQ_BANDS.map((frequency, index) => {
    const x = paddingX + (index / (EQ_BANDS.length - 1)) * usableWidth;
    const y = paddingY + ((12 - eq[frequency]) / 24) * usableHeight;
    return { frequency, x, y };
  });

  const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(' ');

  const updateFromPointer = (event: PointerEvent<SVGCircleElement>, frequency: EqFrequency): void => {
    if (disabled || !svgRef.current) {
      return;
    }

    const bounds = svgRef.current.getBoundingClientRect();
    const y = event.clientY - bounds.top;
    const normalized = Math.min(Math.max((y - paddingY) / usableHeight, 0), 1);
    const gainDb = Math.round((12 - normalized * 24) * 2) / 2;
    onChange(frequency, gainDb);
  };

  return (
    <svg className="eq-curve" ref={svgRef} viewBox={`0 0 ${width} ${height}`}>
      <line className="eq-curve__grid" x1={paddingX} x2={width - paddingX} y1={paddingY} y2={paddingY} />
      <line className="eq-curve__grid eq-curve__grid--zero" x1={paddingX} x2={width - paddingX} y1={height / 2} y2={height / 2} />
      <line className="eq-curve__grid" x1={paddingX} x2={width - paddingX} y1={height - paddingY} y2={height - paddingY} />
      <path className="eq-curve__path" d={path} />
      {points.map((point) => (
        <circle
          className="eq-curve__point"
          cx={point.x}
          cy={point.y}
          key={point.frequency}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            updateFromPointer(event, point.frequency);
          }}
          onPointerMove={(event) => {
            if (event.buttons === 1) {
              updateFromPointer(event, point.frequency);
            }
          }}
          r="6"
        />
      ))}
      {points.map((point, index) => (
        <text className="eq-curve__label" key={`${point.frequency}-label`} x={point.x} y={height - 4}>
          {index % 2 === 0 ? point.frequency : ''}
        </text>
      ))}
    </svg>
  );
}

export function App() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [isLoaded, setLoaded] = useState(false);
  const [isRunning, setRunning] = useState(false);
  const [level, setLevel] = useState(0);
  const [message, setMessage] = useState('Click power to capture this tab audio.');

  useEffect(() => {
    let mounted = true;
    void loadSettings().then((loaded) => {
      if (mounted) {
        setSettings({ ...loaded, enabled: false });
        setLoaded(true);
        void sendOffscreenCommand({ type: 'SHEYNFX_OFFSCREEN_GET_STATUS' }).then((response) => {
          if (!mounted || !response.status) {
            return;
          }
          setRunning(response.status.running);
          setLevel(Math.max(response.status.level.rms, response.status.level.peak));
          setMessage(response.status.message);
        });
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      void sendOffscreenCommand({ type: 'SHEYNFX_OFFSCREEN_GET_STATUS' }).then((response) => {
        if (!response.status) {
          setRunning(false);
          setLevel(0);
          return;
        }

        setRunning(response.status.running);
        setLevel(Math.max(response.status.level.rms, response.status.level.peak));
        setMessage(response.status.message);
      });
    }, 250);

    return () => window.clearInterval(intervalId);
  }, []);

  const persist = useCallback((nextSettings: AppSettings) => {
    setSettings(nextSettings);
    void saveSettings(nextSettings);
    void sendOffscreenCommand({ type: 'SHEYNFX_OFFSCREEN_UPDATE_SETTINGS', settings: { eq: nextSettings.eq, effects: nextSettings.effects } }).then((response) => {
      if (response.status) {
        setRunning(response.status.running);
        setLevel(Math.max(response.status.level.rms, response.status.level.peak));
        setMessage(response.status.message);
      }
    });
  }, []);

  const togglePower = useCallback(() => {
    if (isRunning) {
      const next = { ...settings, enabled: false };
      setSettings(next);
      setRunning(false);
      setLevel(0);
      void saveSettings(next);
      void sendOffscreenCommand({ type: 'SHEYNFX_OFFSCREEN_STOP' }).then((response) => {
        setMessage(response.status?.message ?? 'Tab capture stopped.');
      });
      return;
    }

    setMessage('Requesting tab audio...');
    void getActiveTabStreamId()
      .then(async (streamId) => {
        await ensureOffscreenDocument();
        return streamId;
      })
      .then((streamId) =>
        sendOffscreenCommand({
          type: 'SHEYNFX_OFFSCREEN_START',
          streamId,
          settings: { eq: settings.eq, effects: settings.effects }
        })
      )
      .then((response) => {
        if (!response.ok) {
          throw new Error(response.error ?? 'Could not start offscreen tab audio.');
        }
        const next = { ...settings, enabled: true };
        setSettings(next);
        setRunning(Boolean(response.status?.running));
        setLevel(Math.max(response.status?.level.rms ?? 0, response.status?.level.peak ?? 0));
        setMessage(response.status?.message ?? 'Tab audio captured. EQ is active.');
        void saveSettings(next);
      })
      .catch((error: unknown) => {
        setRunning(false);
        setMessage(error instanceof Error ? error.message : 'Could not capture tab audio.');
      });
  }, [isRunning, settings]);

  const updateEqBand = useCallback(
    (frequency: EqFrequency, gainDb: number) => {
      const next = { ...settings, eq: { ...settings.eq, [frequency]: gainDb } };
      persist(next);
    },
    [persist, settings]
  );

  const updateEffect = useCallback(
    <Key extends keyof TabEffectsSettings>(effect: Key, value: Partial<TabEffectsSettings[Key]>) => {
      const next = {
        ...settings,
        effects: {
          ...settings.effects,
          [effect]: { ...settings.effects[effect], ...value }
        }
      };
      persist(next);
    },
    [persist, settings]
  );

  const updateTheme = useCallback(
    (theme: ThemeName) => {
      persist({ ...settings, theme });
    },
    [persist, settings]
  );

  const updateEqMode = useCallback(
    (eqMode: EqMode) => {
      persist({ ...settings, eqMode });
    },
    [persist, settings]
  );

  const toggleSection = useCallback(
    (sectionId: SectionId) => {
      persist({ ...settings, collapsed: { ...settings.collapsed, [sectionId]: !settings.collapsed[sectionId] } });
    },
    [persist, settings]
  );

  const eqSliders = useMemo(
    () =>
      EQ_BANDS.map((frequency) => (
        <SliderField
          disabled={!isLoaded}
          key={frequency}
          label={`${frequency} Hz`}
          max="12"
          min="-12"
          onChange={(event: ChangeEvent<HTMLInputElement>) => updateEqBand(frequency, Number(event.target.value))}
          step="0.5"
          value={settings.eq[frequency]}
          valueLabel={formatDb(settings.eq[frequency])}
        />
      )),
    [isLoaded, settings.eq, updateEqBand]
  );

  return (
    <ThemeProvider theme={settings.theme}>
      <main className="shell">
        <header className="topbar">
          <div className="brand">
            <div>
              <h1 className="brand-logo">
                <span className="brand-logo__main">Sheyn</span>
                <span className="brand-logo__eq">EQ</span>
              </h1>
              <p className="brand-byline">Made with <Heart size={10} fill="currentColor" /> by Sheyn</p>
            </div>
          </div>
          <div className="topbar__actions">
            <IconButton icon={<Moon size={16} />} label="Dark theme" onClick={() => updateTheme('dark')} variant={settings.theme === 'dark' ? 'primary' : 'ghost'} />
            <IconButton icon={<Sun size={16} />} label="Light theme" onClick={() => updateTheme('light')} variant={settings.theme === 'light' ? 'primary' : 'ghost'} />
            <span className="status-pill">{isRunning ? 'LIVE' : 'OFF'}</span>
          </div>
        </header>

        <section className="power-section">
          <button
            aria-label="Toggle SheynEQ"
            className={`power-orb${isRunning ? ' power-orb--on' : ''}`}
            onClick={togglePower}
            style={{ '--level': level.toFixed(3) } as CSSProperties}
            type="button"
          >
            <span className="power-orb__bars" aria-hidden="true">
              <span />
              <span />
              <span />
              <span />
            </span>
            <Power size={34} />
          </button>
          <p className="status-message">{message}</p>
        </section>

        <Section collapsed={settings.collapsed.equalizer} icon={<SlidersHorizontal size={20} />} onToggle={() => toggleSection('equalizer')} title="Equalizer">
          <div className="segmented">
            <button className={settings.eqMode === 'sliders' ? 'active' : ''} onClick={() => updateEqMode('sliders')} type="button">Sliders</button>
            <button className={settings.eqMode === 'curve' ? 'active' : ''} onClick={() => updateEqMode('curve')} type="button">Curve</button>
          </div>
          {settings.eqMode === 'curve' ? <EqCurve disabled={!isLoaded} eq={settings.eq} onChange={updateEqBand} /> : <div className="eq-list">{eqSliders}</div>}
        </Section>

        <Section collapsed={settings.collapsed.effects} icon={<Waves size={20} />} onToggle={() => toggleSection('effects')} title="Effects">
          <div className="effect-card">
            <ToggleSwitch checked={settings.effects.bassBoost.enabled} label="Bass Boost" onChange={(event) => updateEffect('bassBoost', { enabled: event.target.checked })} />
            <SliderField label="Amount" max="1" min="0" onChange={(event) => updateEffect('bassBoost', { amount: Number(event.target.value) })} step="0.01" value={settings.effects.bassBoost.amount} valueLabel={formatPercent(settings.effects.bassBoost.amount)} />
            <ToggleSwitch checked={settings.effects.bassBoost.autoProtect} label="Auto Protection" onChange={(event) => updateEffect('bassBoost', { autoProtect: event.target.checked })} />
            <SliderField label="Protection" max="1" min="0" onChange={(event) => updateEffect('bassBoost', { protection: Number(event.target.value) })} step="0.01" value={settings.effects.bassBoost.protection} valueLabel={formatPercent(settings.effects.bassBoost.protection)} />
          </div>
          <div className="effect-card">
            <strong className="effect-title">Volume Boost</strong>
            <SliderField label="Gain" max="2" min="0" onChange={(event) => updateEffect('volumeBoost', { amount: Number(event.target.value) })} step="0.01" value={settings.effects.volumeBoost.amount} valueLabel={formatPercent(settings.effects.volumeBoost.amount)} />
          </div>
          <div className="effect-card">
            <ToggleSwitch checked={settings.effects.reverb.enabled} label="Reverb" onChange={(event) => updateEffect('reverb', { enabled: event.target.checked })} />
            <SliderField label="Mix" max="0.75" min="0" onChange={(event) => updateEffect('reverb', { mix: Number(event.target.value) })} step="0.01" value={settings.effects.reverb.mix} valueLabel={formatPercent(settings.effects.reverb.mix)} />
          </div>
          <div className="effect-card">
            <ToggleSwitch checked={settings.effects.nightMode.enabled} label="Night Mode" onChange={(event) => updateEffect('nightMode', { enabled: event.target.checked })} />
            <SliderField label="Comfort" max="1" min="0" onChange={(event) => updateEffect('nightMode', { amount: Number(event.target.value) })} step="0.01" value={settings.effects.nightMode.amount} valueLabel={formatPercent(settings.effects.nightMode.amount)} />
          </div>
        </Section>
        <footer className="footer-brand">SheynEQ Beta &bull; Made for music lovers</footer>
      </main>
    </ThemeProvider>
  );
}
