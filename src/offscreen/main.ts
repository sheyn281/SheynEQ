import { TabAudioEngine, type AnalyzerSnapshot, type EqSettings, type TabEffectsSettings } from '../shared/tabAudioEngine';

interface OffscreenSettings {
  eq: EqSettings;
  effects: TabEffectsSettings;
}

type OffscreenCommand =
  | { type: 'SHEYNFX_OFFSCREEN_START'; streamId: string; settings: OffscreenSettings }
  | { type: 'SHEYNFX_OFFSCREEN_STOP' }
  | { type: 'SHEYNFX_OFFSCREEN_UPDATE_SETTINGS'; settings: OffscreenSettings }
  | { type: 'SHEYNFX_OFFSCREEN_GET_STATUS' };

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

const engine = new TabAudioEngine();
let currentSettings: OffscreenSettings | null = null;
let message = 'Offscreen audio engine is idle.';

async function openTabStream(streamId: string): Promise<MediaStream> {
  const constraints = {
    audio: {
      mandatory: {
        chromeMediaSource: 'tab',
        chromeMediaSourceId: streamId
      }
    },
    video: false
  } as MediaStreamConstraints;

  return navigator.mediaDevices.getUserMedia(constraints);
}

function getStatus(): OffscreenStatus {
  return {
    running: engine.isRunning(),
    level: engine.captureLevel(),
    message
  };
}

async function handleCommand(command: OffscreenCommand): Promise<OffscreenResponse> {
  try {
    switch (command.type) {
      case 'SHEYNFX_OFFSCREEN_START': {
        currentSettings = command.settings;
        message = 'Opening tab audio stream...';
        const stream = await openTabStream(command.streamId);
        await engine.start(stream, command.settings.eq, command.settings.effects);
        message = 'Tab audio captured. EQ is active.';
        return { ok: true, status: getStatus() };
      }
      case 'SHEYNFX_OFFSCREEN_STOP':
        engine.stop();
        message = 'Tab capture stopped.';
        return { ok: true, status: getStatus() };
      case 'SHEYNFX_OFFSCREEN_UPDATE_SETTINGS':
        currentSettings = command.settings;
        if (engine.isRunning()) {
          engine.applyEq(command.settings.eq);
          engine.applyEffects(command.settings.effects);
        }
        return { ok: true, status: getStatus() };
      case 'SHEYNFX_OFFSCREEN_GET_STATUS':
        return { ok: true, status: getStatus() };
    }
  } catch (error) {
    engine.stop();
    message = error instanceof Error ? error.message : 'Offscreen audio processing failed.';
    return { ok: false, error: message, status: getStatus() };
  }
}

chrome.runtime.onMessage.addListener((messagePayload: OffscreenCommand, _sender, sendResponse: (response: OffscreenResponse) => void) => {
  void handleCommand(messagePayload).then(sendResponse);
  return true;
});

void currentSettings;
