export interface SttConfig {
  akId: string;
  akSecret: string;
  appKey: string;
}

export class AliyunSttService {
  // Deprecated stub. The app uses electron/main.ts + aliyun-client.ts for realtime STT.
  constructor(_config: SttConfig, _onTranscript: (text: string, isFinal: boolean) => void) {}
}
export interface TranscribedData {
  text: string;
  isFinal: boolean;
}
