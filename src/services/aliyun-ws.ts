export interface AliyunSttOptions {
  apiKey: string;
  onOpen?: () => void;
  onMessage?: (text: string, isFinal: boolean) => void;
  onError?: (error: unknown) => void;
  onClose?: () => void;
}

export class AliyunSttClient {
  // Deprecated stub. Realtime implementation runs in electron/main.ts.
  constructor(_options: AliyunSttOptions) {}

  start() {}
}
