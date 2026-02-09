import { app, BrowserWindow, clipboard, globalShortcut, ipcMain, safeStorage } from 'electron';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import Store from 'electron-store';
import { execFile } from 'node:child_process';
import { AliyunRealtimeClient } from './aliyun-client';
import {
  buildConnectivityProbe,
  CLOUD_PROVIDER_IDS,
  DEFAULT_PROVIDER_CONFIG,
  KeyTestRequest,
  KeyTestResult,
  ProviderConfigState,
  ProviderId,
  validateKeyTestInput
} from '../src/shared/provider-config';

type PersistedState = {
  providerConfig?: ProviderConfigState;
  apiKeys?: Partial<Record<ProviderId, string>>;
  translationTargetLanguage?: string;
  textAssist?: TextAssistConfig;
};

type TextAssistConfig = {
  enabled: boolean;
  debugLogging: boolean;
  trigger: {
    mode: 'triple-space' | 'hotkey';
    hotkey: string;
    tripleSpaceWindowMs: number;
  };
  selection: {
    enableClipboardFallback: boolean;
  };
  bubble: {
    enabled: boolean;
  };
};

type TextAssistStatus = {
  enabled: boolean;
  hotkeyRegistered: boolean;
  activeHotkey: string;
  mode: 'triple-space' | 'hotkey';
  lastError: string;
};

type OpenAiTranscribeRequest = {
  audioBase64: string;
  mimeType?: string;
  language?: string;
};

const store = new Store<PersistedState>();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

process.env.APP_ROOT = path.join(__dirname, '..');

export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL'];
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron');
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist');

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, 'public')
  : RENDERER_DIST;

let win: BrowserWindow | null;
const aliyunClients = new Map<number, AliyunRealtimeClient>();
const appIconPath = path.join(process.env.VITE_PUBLIC, 'live-lingo', 'web', 'icon-512.png');
const DEFAULT_TEXT_ASSIST_CONFIG: TextAssistConfig = {
  enabled: true,
  debugLogging: false,
  trigger: {
    mode: 'hotkey',
    hotkey: 'CommandOrControl+Shift+L',
    tripleSpaceWindowMs: 700
  },
  selection: {
    enableClipboardFallback: true
  },
  bubble: {
    enabled: true
  }
};

let textAssistRegisteredHotkey = '';
let textAssistLastError = '';
let textAssistRunning = false;
let textAssistQueued = false;
let lastTextAssistSnapshot: { original: string; translated: string; at: number } | null = null;

function createWindow() {
  const initialAlwaysOnTop = Boolean(store.get('windowAlwaysOnTop', false));
  win = new BrowserWindow({
    title: 'LiveLingo',
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    width: 1200,
    height: 820,
    minWidth: 400,
    minHeight: 300,
    movable: true,
    resizable: true,
    icon: appIconPath,
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs')
    }
  });
  win.setAlwaysOnTop(initialAlwaysOnTop);

  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', new Date().toLocaleString());
  });

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'index.html'));
  }

  win.center();
}

function encryptApiKey(value: string): string {
  if (!value) {
    return '';
  }

  if (safeStorage.isEncryptionAvailable()) {
    return safeStorage.encryptString(value).toString('base64');
  }

  return `plain:${value}`;
}

function decryptApiKey(value: string): string {
  if (!value) {
    return '';
  }

  if (value.startsWith('plain:')) {
    return value.slice('plain:'.length);
  }

  if (safeStorage.isEncryptionAvailable()) {
    return safeStorage.decryptString(Buffer.from(value, 'base64'));
  }

  return '';
}

function getStoredApiKeys() {
  return store.get('apiKeys', {});
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function runAppleScript(script: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('osascript', ['-e', script], (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr?.trim() || error.message));
        return;
      }
      resolve(stdout.trim());
    });
  });
}

function hasSavedApiKey(providerId: ProviderId): boolean {
  const keys = getStoredApiKeys();
  return Boolean(keys[providerId]);
}

function saveApiKey(providerId: ProviderId, apiKey: string) {
  const keys = getStoredApiKeys();
  keys[providerId] = encryptApiKey(apiKey);
  store.set('apiKeys', keys);
}

function clearApiKey(providerId: ProviderId) {
  const keys = getStoredApiKeys();
  delete keys[providerId];
  store.set('apiKeys', keys);
}

function normalizeTextAssistConfig(input?: Partial<TextAssistConfig>): TextAssistConfig {
  if (!input) {
    return { ...DEFAULT_TEXT_ASSIST_CONFIG };
  }

  return {
    enabled: input.enabled ?? DEFAULT_TEXT_ASSIST_CONFIG.enabled,
    debugLogging: input.debugLogging ?? DEFAULT_TEXT_ASSIST_CONFIG.debugLogging,
    trigger: {
      mode: input.trigger?.mode ?? DEFAULT_TEXT_ASSIST_CONFIG.trigger.mode,
      hotkey: (input.trigger?.hotkey || DEFAULT_TEXT_ASSIST_CONFIG.trigger.hotkey).trim(),
      tripleSpaceWindowMs:
        input.trigger?.tripleSpaceWindowMs ?? DEFAULT_TEXT_ASSIST_CONFIG.trigger.tripleSpaceWindowMs
    },
    selection: {
      enableClipboardFallback:
        input.selection?.enableClipboardFallback ?? DEFAULT_TEXT_ASSIST_CONFIG.selection.enableClipboardFallback
    },
    bubble: {
      enabled: input.bubble?.enabled ?? DEFAULT_TEXT_ASSIST_CONFIG.bubble.enabled
    }
  };
}

function textAssistDebugLog(message: string, extra?: Record<string, unknown>) {
  if (!readTextAssistConfig().debugLogging) {
    return;
  }
  if (extra) {
    console.log(`[TextAssist] ${message}`, extra);
    return;
  }
  console.log(`[TextAssist] ${message}`);
}

function readTextAssistConfig(): TextAssistConfig {
  const config = store.get('textAssist');
  return normalizeTextAssistConfig(config);
}

function saveTextAssistConfig(config: Partial<TextAssistConfig>): TextAssistConfig {
  const normalized = normalizeTextAssistConfig(config);
  store.set('textAssist', normalized);
  return normalized;
}

function getTextAssistStatus(): TextAssistStatus {
  const config = readTextAssistConfig();
  return {
    enabled: config.enabled,
    hotkeyRegistered: Boolean(textAssistRegisteredHotkey),
    activeHotkey: textAssistRegisteredHotkey,
    mode: config.trigger.mode,
    lastError: textAssistLastError
  };
}

async function translateWithQwen(text: string): Promise<string> {
  const encrypted = getStoredApiKeys().qwen ?? '';
  const apiKey = decryptApiKey(encrypted).trim();
  if (!apiKey) {
    throw new Error('Qwen translation key is missing. Save it in Settings > Translation.');
  }

  const config = readProviderConfig();
  const qwenConfig = config.providers.qwen;
  const targetLanguage = 'English';
  const baseUrl = qwenConfig.baseUrl.replace(/\/+$/, '');

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: qwenConfig.model,
      temperature: 0,
      messages: [
        {
          role: 'system',
          content: `Translate user text to ${targetLanguage}. Return translation only.`
        },
        {
          role: 'user',
          content: text
        }
      ]
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Qwen translation failed (${response.status}): ${errText.slice(0, 160)}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{
      message?: {
        content?: string;
      };
    }>;
  };

  const output = data.choices?.[0]?.message?.content?.trim();
  if (!output) {
    throw new Error('Qwen translation returned empty text.');
  }

  return output;
}

async function captureLineToCursorAndCopy(): Promise<string> {
  const tryCopy = async (mode: 'selection' | 'select-all'): Promise<string> => {
    const sentinel = `__LIVELINGO_CAPTURE_${Date.now()}__`;
    textAssistDebugLog('capture:start', { mode });
    clipboard.writeText(sentinel);

    if (mode === 'select-all') {
      await runAppleScript(`
        tell application "System Events"
          keystroke "a" using {command down}
          delay 0.03
          keystroke "c" using {command down}
          delay 0.05
          keystroke "c" using {command down}
        end tell
      `);
    } else {
      await runAppleScript(`
        tell application "System Events"
          keystroke "c" using {command down}
          delay 0.05
          keystroke "c" using {command down}
        end tell
      `);
    }

    // Some apps update clipboard asynchronously after Cmd+C.
    for (let i = 0; i < 10; i += 1) {
      await wait(80);
      const captured = clipboard.readText();
      if (captured !== sentinel) {
        textAssistDebugLog('capture:success', { mode, length: captured.length });
        return captured;
      }
    }
    textAssistDebugLog('capture:empty', { mode });
    return '';
  };

  // 1) Try selected text first. If user selected anything, this should capture it.
  const selectedText = await tryCopy('selection');
  if (selectedText) {
    textAssistDebugLog('capture:path', { path: 'selection' });
    return selectedText;
  }

  // 2) No selection captured -> fallback to translating all text from the focused input.
  const allText = await tryCopy('select-all');
  if (allText) {
    textAssistDebugLog('capture:path', { path: 'select-all' });
    return allText;
  }

  throw new Error('No text captured from the focused input.');
}

async function replaceSelectionByPaste(): Promise<void> {
  await runAppleScript(`
    tell application "System Events"
      keystroke "v" using {command down}
    end tell
  `);
}

async function moveCaretToSelectionEnd(): Promise<void> {
  await runAppleScript(`
    tell application "System Events"
      key code 124
    end tell
  `);
}

function canAppendDelta(original: string, translated: string): boolean {
  if (!lastTextAssistSnapshot) {
    return false;
  }

  const withinWindow = Date.now() - lastTextAssistSnapshot.at <= 30000;
  if (!withinWindow) {
    return false;
  }

  return (
    original.startsWith(lastTextAssistSnapshot.original) &&
    translated.startsWith(lastTextAssistSnapshot.translated) &&
    original !== lastTextAssistSnapshot.original &&
    translated !== lastTextAssistSnapshot.translated
  );
}

async function executeTextAssistOnce(): Promise<{ ok: boolean; message: string; original?: string; translated?: string }> {
  const originalClipboard = clipboard.readText();
  try {
    textAssistDebugLog('run:start');
    const source = await captureLineToCursorAndCopy();
    if (!source) {
      throw new Error('No text captured. Move caret into an input and retry.');
    }

    const translated = await translateWithQwen(source);
    if (!translated) {
      throw new Error('Translation returned empty text.');
    }
    textAssistDebugLog('translate:success', { sourceLength: source.length, translatedLength: translated.length });

    const appendMode = canAppendDelta(source, translated);
    if (appendMode && lastTextAssistSnapshot) {
      const delta = translated.slice(lastTextAssistSnapshot.translated.length);
      if (delta.trim().length > 0) {
        textAssistDebugLog('replace:append-delta', { deltaLength: delta.length });
        await moveCaretToSelectionEnd();
        clipboard.writeText(delta);
        await replaceSelectionByPaste();
      }
    } else {
      textAssistDebugLog('replace:full');
      clipboard.writeText(translated);
      await replaceSelectionByPaste();
    }

    await wait(80);
    clipboard.writeText(originalClipboard);

    lastTextAssistSnapshot = { original: source, translated, at: Date.now() };
    textAssistLastError = '';
    textAssistDebugLog('run:success');
    return { ok: true, message: 'Text replaced with translation.', original: source, translated };
  } catch (error) {
    clipboard.writeText(originalClipboard);
    const message = error instanceof Error ? error.message : 'Unknown error';
    textAssistLastError = message;
    textAssistDebugLog('run:error', { message });
    return { ok: false, message };
  }
}

async function runTextAssistOnce(): Promise<{ ok: boolean; message: string; original?: string; translated?: string }> {
  if (process.platform !== 'darwin') {
    return { ok: false, message: 'Text assist currently supports macOS only.' };
  }

  if (textAssistRunning) {
    textAssistQueued = true;
    return { ok: true, message: 'Text assist is busy. One request queued.' };
  }

  textAssistRunning = true;
  try {
    return await executeTextAssistOnce();
  } finally {
    textAssistRunning = false;
    if (textAssistQueued) {
      textAssistQueued = false;
      void runTextAssistOnce();
    }
  }
}

function unregisterTextAssistHotkey() {
  if (!textAssistRegisteredHotkey) {
    return;
  }
  globalShortcut.unregister(textAssistRegisteredHotkey);
  textAssistRegisteredHotkey = '';
}

function registerTextAssistHotkey() {
  const config = readTextAssistConfig();
  unregisterTextAssistHotkey();
  textAssistLastError = '';

  if (!config.enabled) {
    return;
  }

  if (config.trigger.mode !== 'hotkey') {
    textAssistLastError = 'Triple-space trigger is not wired yet. Switch to Hotkey mode.';
    return;
  }

  const accelerator = config.trigger.hotkey.trim() || DEFAULT_TEXT_ASSIST_CONFIG.trigger.hotkey;
  const success = globalShortcut.register(accelerator, () => {
    void runTextAssistOnce();
  });

  if (!success) {
    textAssistLastError = `Failed to register hotkey: ${accelerator}`;
    return;
  }

  textAssistRegisteredHotkey = accelerator;
}

function mergeProviderConfig(input?: ProviderConfigState): ProviderConfigState {
  const base = DEFAULT_PROVIDER_CONFIG;

  if (!input) {
    return {
      activeProviderId: base.activeProviderId,
      providers: {
        ...base.providers
      }
    };
  }

  const mergedProviders = { ...base.providers };

  (Object.keys(base.providers) as ProviderId[]).forEach((id) => {
    const current = input.providers?.[id];
    if (current) {
      mergedProviders[id] = {
        ...mergedProviders[id],
        baseUrl: current.baseUrl,
        model: current.model,
        apiKeySaved: false
      };
    }

    if (id === 'local') {
      mergedProviders[id].apiKeySaved = false;
    } else {
      mergedProviders[id].apiKeySaved = hasSavedApiKey(id);
    }
  });

  return {
    activeProviderId: input.activeProviderId in mergedProviders
      ? input.activeProviderId
      : base.activeProviderId,
    providers: mergedProviders
  };
}

function readProviderConfig(): ProviderConfigState {
  const persisted = store.get('providerConfig');
  return mergeProviderConfig(persisted);
}

function saveProviderConfig(config: ProviderConfigState): ProviderConfigState {
  const merged = mergeProviderConfig(config);

  const toPersist: ProviderConfigState = {
    activeProviderId: merged.activeProviderId,
    providers: {
      local: { ...merged.providers.local },
      openai: { ...merged.providers.openai },
      qwen: { ...merged.providers.qwen },
      qianfan: { ...merged.providers.qianfan },
      zhipu: { ...merged.providers.zhipu }
    }
  };

  (Object.keys(toPersist.providers) as ProviderId[]).forEach((id) => {
    toPersist.providers[id].apiKeySaved = false;
  });

  store.set('providerConfig', toPersist);
  return mergeProviderConfig(toPersist);
}

async function probeProviderConnection(request: KeyTestRequest): Promise<KeyTestResult> {
  const validation = validateKeyTestInput(request);
  if (!validation.ok) {
    return validation;
  }

  if (request.providerId === 'local') {
    return { ok: true, message: 'Local provider does not require key.' };
  }

  const probe = buildConnectivityProbe(request);

  try {
    const response = await fetch(probe.url, {
      method: probe.method,
      headers: {
        Authorization: `Bearer ${request.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: probe.body
    });

    if (!response.ok) {
      const text = await response.text();
      return {
        ok: false,
        message: `Connection test failed (${response.status}): ${text.slice(0, 160)}`
      };
    }

    return { ok: true, message: 'Connection test passed.' };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { ok: false, message: `Connection test failed: ${message}` };
  }
}

ipcMain.handle('electron-store-get', async (_event, key: string) => {
  return store.get(key as keyof PersistedState);
});

ipcMain.handle('electron-store-set', async (_event, key: string, val: unknown) => {
  store.set(key as keyof PersistedState, val as PersistedState[keyof PersistedState]);
});

ipcMain.handle('provider-config:get', async () => {
  return readProviderConfig();
});

ipcMain.handle('provider-config:save', async (_event, config: ProviderConfigState) => {
  return saveProviderConfig(config);
});

ipcMain.handle('provider-key:test-and-save', async (_event, request: KeyTestRequest) => {
  const result = await probeProviderConnection(request);

  if (result.ok && CLOUD_PROVIDER_IDS.includes(request.providerId)) {
    saveApiKey(request.providerId, request.apiKey);
  }

  return result;
});

ipcMain.handle('provider-key:clear', async (_event, providerId: ProviderId) => {
  if (providerId === 'local') {
    return false;
  }

  clearApiKey(providerId);
  return true;
});

ipcMain.handle('provider-key:save', async (_event, providerId: ProviderId, apiKey: string) => {
  if (providerId === 'local') {
    return false;
  }

  saveApiKey(providerId, apiKey);
  return true;
});

ipcMain.handle('provider-key:has', async (_event, providerId: ProviderId) => {
  if (providerId === 'local') {
    return false;
  }

  return hasSavedApiKey(providerId);
});

ipcMain.handle('provider-key:get-decrypted', async (_event, providerId: ProviderId) => {
  if (providerId === 'local') {
    return '';
  }

  const encrypted = getStoredApiKeys()[providerId] ?? '';
  return decryptApiKey(encrypted);
});

ipcMain.handle('window:set-always-on-top', async (event, value: boolean) => {
  const targetWindow = BrowserWindow.fromWebContents(event.sender);
  if (!targetWindow) {
    return false;
  }

  targetWindow.setAlwaysOnTop(Boolean(value));
  store.set('windowAlwaysOnTop', Boolean(value));
  return targetWindow.isAlwaysOnTop();
});

ipcMain.handle('window:get-always-on-top', async (event) => {
  const targetWindow = BrowserWindow.fromWebContents(event.sender);
  if (!targetWindow) {
    return Boolean(store.get('windowAlwaysOnTop', false));
  }

  return targetWindow.isAlwaysOnTop();
});

ipcMain.handle('window:close', async (event) => {
  const targetWindow = BrowserWindow.fromWebContents(event.sender);
  if (!targetWindow) {
    return false;
  }

  targetWindow.close();
  return true;
});

ipcMain.handle('text-assist:get-config', async () => {
  return readTextAssistConfig();
});

ipcMain.handle('text-assist:save-config', async (_event, config: Partial<TextAssistConfig>) => {
  const saved = saveTextAssistConfig(config);
  registerTextAssistHotkey();
  return saved;
});

ipcMain.handle('text-assist:get-status', async () => {
  return getTextAssistStatus();
});

ipcMain.handle('text-assist:run-once', async () => {
  return runTextAssistOnce();
});

ipcMain.handle('text-assist:open-accessibility-settings', async () => {
  if (process.platform !== 'darwin') {
    return false;
  }
  try {
    await runAppleScript(`
      tell application "System Settings"
        activate
      end tell
    `);
    return true;
  } catch {
    return false;
  }
});

ipcMain.handle('aliyun-stt:start', async (event, apiKey: string, model?: string) => {
  const senderId = event.sender.id;
  const current = aliyunClients.get(senderId);
  current?.stop();

  const client = new AliyunRealtimeClient(
    { apiKey, model },
    ({ text, isFinal }) => {
      event.sender.send('aliyun-stt:result', { text, isFinal });
    },
    (error) => {
      event.sender.send('aliyun-stt:error', error.message);
    }
  );

  aliyunClients.set(senderId, client);
  await client.start();
  return true;
});

ipcMain.handle('aliyun-stt:send-audio', async (event, bytes: number[]) => {
  const client = aliyunClients.get(event.sender.id);
  if (!client || bytes.length === 0) {
    return false;
  }

  client.sendAudio(Buffer.from(bytes));
  return true;
});

ipcMain.handle('aliyun-stt:stop', async (event) => {
  const client = aliyunClients.get(event.sender.id);
  if (!client) {
    return false;
  }

  client.stop();
  aliyunClients.delete(event.sender.id);
  return true;
});

ipcMain.handle('stt:transcribe-openai', async (_event, request: OpenAiTranscribeRequest) => {
  const encrypted = getStoredApiKeys().openai ?? '';
  const apiKey = decryptApiKey(encrypted);

  if (!apiKey) {
    throw new Error('OpenAI key is missing. Save it in Settings.');
  }

  const audioBuffer = Buffer.from(request.audioBase64, 'base64');
  const audioBlob = new Blob([audioBuffer], { type: request.mimeType ?? 'audio/webm' });
  const formData = new FormData();
  formData.append('file', audioBlob, 'audio.webm');
  formData.append('model', 'whisper-1');
  if (request.language?.trim()) {
    formData.append('language', request.language.trim());
  }

  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`
    },
    body: formData
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI STT failed (${response.status}): ${errorText.slice(0, 180)}`);
  }

  const payload = (await response.json()) as { text?: string };
  if (!payload.text?.trim()) {
    throw new Error('OpenAI STT returned empty text.');
  }

  return payload.text;
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
    win = null;
  }
});

app.on('will-quit', () => {
  unregisterTextAssistHotkey();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on('web-contents-created', (_evt, contents) => {
  contents.on('destroyed', () => {
    const client = aliyunClients.get(contents.id);
    if (client) {
      client.stop();
      aliyunClients.delete(contents.id);
    }
  });
});

app.whenReady().then(() => {
  app.setName('LiveLingo');
  if (process.platform === 'darwin' && app.dock) {
    app.dock.setIcon(appIconPath);
  }
  registerTextAssistHotkey();
  createWindow();
});
