import { ipcRenderer, contextBridge } from 'electron';
import type {
  KeyTestRequest,
  KeyTestResult,
  ProviderConfigState,
  ProviderId
} from '../src/shared/provider-config';

const bridgeApi = {
  onMainMessage(listener: (message: string) => void) {
    const wrapped = (_event: Electron.IpcRendererEvent, message: string) => listener(message);
    ipcRenderer.on('main-process-message', wrapped);
    return () => ipcRenderer.off('main-process-message', wrapped);
  },
  store: {
    get: (key: string) => ipcRenderer.invoke('electron-store-get', key),
    set: (key: string, val: unknown) => ipcRenderer.invoke('electron-store-set', key, val)
  },
  windowControl: {
    setAlwaysOnTop: (value: boolean): Promise<boolean> => ipcRenderer.invoke('window:set-always-on-top', value),
    getAlwaysOnTop: (): Promise<boolean> => ipcRenderer.invoke('window:get-always-on-top'),
    close: (): Promise<boolean> => ipcRenderer.invoke('window:close')
  },
  textAssist: {
    getConfig: () => ipcRenderer.invoke('text-assist:get-config'),
    saveConfig: (config: unknown) => ipcRenderer.invoke('text-assist:save-config', config),
    getStatus: () => ipcRenderer.invoke('text-assist:get-status'),
    runOnce: () => ipcRenderer.invoke('text-assist:run-once'),
    openAccessibilitySettings: () => ipcRenderer.invoke('text-assist:open-accessibility-settings')
  },
  externalSelection: {
    onTranslated: (listener: (payload: { original: string; translated: string; capturedAt: string }) => void) => {
      const wrapped = (
        _event: Electron.IpcRendererEvent,
        payload: { original: string; translated: string; capturedAt: string }
      ) => listener(payload);
      ipcRenderer.on('external-selection:translated', wrapped);
      return () => ipcRenderer.off('external-selection:translated', wrapped);
    }
  },
  providerConfig: {
    get: (): Promise<ProviderConfigState> => ipcRenderer.invoke('provider-config:get'),
    save: (config: ProviderConfigState): Promise<ProviderConfigState> =>
      ipcRenderer.invoke('provider-config:save', config)
  },
  providerKey: {
    testAndSave: (request: KeyTestRequest): Promise<KeyTestResult> =>
      ipcRenderer.invoke('provider-key:test-and-save', request),
    save: (providerId: ProviderId, apiKey: string): Promise<boolean> =>
      ipcRenderer.invoke('provider-key:save', providerId, apiKey),
    clear: (providerId: ProviderId): Promise<boolean> => ipcRenderer.invoke('provider-key:clear', providerId),
    has: (providerId: ProviderId): Promise<boolean> => ipcRenderer.invoke('provider-key:has', providerId),
    getDecrypted: (providerId: ProviderId): Promise<string> =>
      ipcRenderer.invoke('provider-key:get-decrypted', providerId)
  },
  stt: {
    transcribeOpenAi: (
      audioBase64: string,
      mimeType: string,
      language?: string
    ): Promise<string> =>
      ipcRenderer.invoke('stt:transcribe-openai', {
        audioBase64,
        mimeType,
        language
      }),
    startAliyun: (apiKey: string, model?: string): Promise<boolean> =>
      ipcRenderer.invoke('aliyun-stt:start', apiKey, model),
    sendAliyunAudio: (bytes: number[]): Promise<boolean> =>
      ipcRenderer.invoke('aliyun-stt:send-audio', bytes),
    stopAliyun: (): Promise<boolean> => ipcRenderer.invoke('aliyun-stt:stop'),
    onAliyunResult: (listener: (payload: { text: string; isFinal: boolean }) => void) => {
      const wrapped = (_event: Electron.IpcRendererEvent, payload: { text: string; isFinal: boolean }) =>
        listener(payload);
      ipcRenderer.on('aliyun-stt:result', wrapped);
      return () => ipcRenderer.off('aliyun-stt:result', wrapped);
    },
    onAliyunError: (listener: (message: string) => void) => {
      const wrapped = (_event: Electron.IpcRendererEvent, message: string) => listener(message);
      ipcRenderer.on('aliyun-stt:error', wrapped);
      return () => ipcRenderer.off('aliyun-stt:error', wrapped);
    }
  }
};

contextBridge.exposeInMainWorld('appApi', bridgeApi);
