export type ProviderId = 'local' | 'openai' | 'qwen' | 'qianfan' | 'zhipu';

export type ProviderSettings = {
  id: ProviderId;
  label: string;
  baseUrl: string;
  model: string;
  apiKeySaved: boolean;
};

export type ProviderConfigState = {
  activeProviderId: ProviderId;
  providers: Record<ProviderId, ProviderSettings>;
};

export type KeyTestRequest = {
  providerId: ProviderId;
  apiKey: string;
  baseUrl: string;
  model: string;
};

export type KeyTestResult = {
  ok: boolean;
  message: string;
};

export type ConnectivityProbe = {
  url: string;
  method: 'GET' | 'POST';
  body?: string;
};

export const DEFAULT_PROVIDER_CONFIG: ProviderConfigState = {
  activeProviderId: 'local',
  providers: {
    local: {
      id: 'local',
      label: 'Local Runtime',
      baseUrl: 'ws://127.0.0.1:8765',
      model: 'local-default',
      apiKeySaved: false
    },
    openai: {
      id: 'openai',
      label: 'OpenAI',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini',
      apiKeySaved: false
    },
    qwen: {
      id: 'qwen',
      label: 'Qwen (DashScope)',
      baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      model: 'qwen-plus',
      apiKeySaved: false
    },
    qianfan: {
      id: 'qianfan',
      label: 'Baidu Qianfan',
      baseUrl: 'https://qianfan.baidubce.com/v2',
      model: 'ernie-4.0-8k',
      apiKeySaved: false
    },
    zhipu: {
      id: 'zhipu',
      label: 'Zhipu',
      baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
      model: 'glm-4-flash',
      apiKeySaved: false
    }
  }
};

export const CLOUD_PROVIDER_IDS: ProviderId[] = ['openai', 'qwen', 'qianfan', 'zhipu'];

export function normalizeBaseUrl(input: string): string {
  return input.trim().replace(/\/+$/, '');
}

export function validateKeyTestInput(request: KeyTestRequest): KeyTestResult {
  if (request.providerId === 'local') {
    return { ok: true, message: 'Local mode does not require API key.' };
  }

  if (!request.apiKey.trim()) {
    return { ok: false, message: 'API Key is required.' };
  }

  if (!request.baseUrl.trim()) {
    return { ok: false, message: 'Base URL is required.' };
  }

  if (request.providerId !== 'openai' && !request.model.trim()) {
    return { ok: false, message: 'Model is required for this provider.' };
  }

  return { ok: true, message: 'OK' };
}

export function buildConnectivityProbe(request: KeyTestRequest): ConnectivityProbe {
  const normalizedBaseUrl = normalizeBaseUrl(request.baseUrl);

  if (request.providerId === 'openai') {
    return {
      url: `${normalizedBaseUrl}/models`,
      method: 'GET'
    };
  }

  return {
    url: `${normalizedBaseUrl}/chat/completions`,
    method: 'POST',
    body: JSON.stringify({
      model: request.model,
      messages: [{ role: 'user', content: 'ping' }],
      temperature: 0
    })
  };
}
