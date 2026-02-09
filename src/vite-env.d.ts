/// <reference types="vite/client" />

import type {
  KeyTestRequest,
  KeyTestResult,
  ProviderConfigState,
  ProviderId
} from './shared/provider-config';

declare global {
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

  type TextAssistRunResult = {
    ok: boolean;
    message: string;
    original?: string;
    translated?: string;
  };

  type TextAssistStatus = {
    enabled: boolean;
    hotkeyRegistered: boolean;
    activeHotkey: string;
    mode: 'triple-space' | 'hotkey';
    lastError: string;
  };

  type ExternalSelectionPayload = {
    original: string;
    translated: string;
    capturedAt: string;
  };

  interface Window {
    appApi: {
      onMainMessage: (listener: (message: string) => void) => () => void;
      store: {
        get: (key: string) => Promise<unknown>;
        set: (key: string, val: unknown) => Promise<void>;
      };
      windowControl: {
        setAlwaysOnTop: (value: boolean) => Promise<boolean>;
        getAlwaysOnTop: () => Promise<boolean>;
        close: () => Promise<boolean>;
      };
      textAssist: {
        getConfig: () => Promise<TextAssistConfig>;
        saveConfig: (config: Partial<TextAssistConfig>) => Promise<TextAssistConfig>;
        getStatus: () => Promise<TextAssistStatus>;
        runOnce: () => Promise<TextAssistRunResult>;
        openAccessibilitySettings: () => Promise<boolean>;
      };
      externalSelection: {
        onTranslated: (listener: (payload: ExternalSelectionPayload) => void) => () => void;
      };
      providerConfig: {
        get: () => Promise<ProviderConfigState>;
        save: (config: ProviderConfigState) => Promise<ProviderConfigState>;
      };
      providerKey: {
        testAndSave: (request: KeyTestRequest) => Promise<KeyTestResult>;
        save: (providerId: ProviderId, apiKey: string) => Promise<boolean>;
        clear: (providerId: ProviderId) => Promise<boolean>;
        has: (providerId: ProviderId) => Promise<boolean>;
        getDecrypted: (providerId: ProviderId) => Promise<string>;
      };
      stt: {
        transcribeOpenAi: (audioBase64: string, mimeType: string, language?: string) => Promise<string>;
        startAliyun: (apiKey: string, model?: string) => Promise<boolean>;
        sendAliyunAudio: (bytes: number[]) => Promise<boolean>;
        stopAliyun: () => Promise<boolean>;
        onAliyunResult: (listener: (payload: { text: string; isFinal: boolean }) => void) => () => void;
        onAliyunError: (listener: (message: string) => void) => () => void;
      };
    };
  }
}

export {};
