import { app, BrowserWindow, ipcMain, safeStorage } from 'electron';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import Store from 'electron-store';
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

function createWindow() {
  const initialAlwaysOnTop = Boolean(store.get('windowAlwaysOnTop', false));
  win = new BrowserWindow({
    title: 'LiveLingo',
    frame: true,
    titleBarStyle: 'default',
    transparent: false,
    backgroundColor: '#FFFFFF',
    width: 1200,
    height: 820,
    minWidth: 400,
    minHeight: 300,
    movable: true,
    resizable: true,
    icon: path.join(process.env.VITE_PUBLIC, 'logo.png'),
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
  createWindow();
});
