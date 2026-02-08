import { v4 as uuidv4 } from 'uuid';
import WebSocket from 'ws';

export interface AliyunConfig {
  apiKey: string;
  model?: string;
}

type AliyunResult = {
  text: string;
  isFinal: boolean;
};

type MessageHandler = (result: AliyunResult) => void;
type ErrorHandler = (error: Error) => void;

const ALIYUN_WS_URL = 'wss://dashscope.aliyuncs.com/api-ws/v1/inference';

export class AliyunRealtimeClient {
  private ws: WebSocket | null = null;
  private readonly config: AliyunConfig;
  private readonly onResult: MessageHandler;
  private readonly onError: ErrorHandler;
  private taskId = '';
  private taskStarted = false;

  constructor(config: AliyunConfig, onResult: MessageHandler, onError: ErrorHandler) {
    this.config = config;
    this.onResult = onResult;
    this.onError = onError;
  }

  public async start(): Promise<void> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return;
    }

    this.taskId = uuidv4().replace(/-/g, '');
    this.taskStarted = false;

    await new Promise<void>((resolve, reject) => {
      this.ws = new WebSocket(ALIYUN_WS_URL, {
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`
        }
      });

      const timeout = setTimeout(() => {
        reject(new Error('Aliyun WS start timeout: task-started not received.'));
      }, 8000);

      this.ws.on('open', () => {
        this.sendRunTask();
      });

      this.ws.on('message', (raw) => {
        const payload = this.safeParse(raw);
        if (!payload) {
          return;
        }

        const header = this.asRecord(payload.header);
        const event = typeof header.event === 'string' ? header.event : '';

        if (event === 'task-started') {
          this.taskStarted = true;
          clearTimeout(timeout);
          resolve();
          return;
        }

        if (event === 'task-failed') {
          const message = typeof header.error_message === 'string'
            ? header.error_message
            : 'Aliyun task failed.';
          clearTimeout(timeout);
          reject(new Error(message));
          return;
        }

        if (event === 'result-generated') {
          const text = this.extractText(payload);
          if (text) {
            const finalFlag = this.extractFinalFlag(payload);
            this.onResult({ text, isFinal: finalFlag });
          }
          return;
        }

        if (event === 'task-finished') {
          return;
        }
      });

      this.ws.on('error', (error) => {
        clearTimeout(timeout);
        reject(error instanceof Error ? error : new Error(String(error)));
      });

      this.ws.on('close', () => {
        this.taskStarted = false;
      });
    }).catch((error) => {
      this.onError(error instanceof Error ? error : new Error(String(error)));
      throw error;
    });
  }

  public sendAudio(pcmData: Buffer): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.taskStarted) {
      return;
    }
    this.ws.send(pcmData);
  }

  public stop(): void {
    if (!this.ws) {
      return;
    }

    if (this.ws.readyState === WebSocket.OPEN && this.taskStarted) {
      const finishFrame = {
        header: {
          action: 'finish-task',
          task_id: this.taskId,
          streaming: 'duplex'
        },
        payload: {}
      };
      this.ws.send(JSON.stringify(finishFrame));
    }

    this.ws.close();
    this.ws = null;
    this.taskStarted = false;
  }

  private sendRunTask(): void {
    if (!this.ws) {
      return;
    }

    const runTaskFrame = {
      header: {
        action: 'run-task',
        task_id: this.taskId,
        streaming: 'duplex'
      },
      payload: {
        task_group: 'audio',
        task: 'asr',
        function: 'recognition',
        model: this.config.model ?? 'paraformer-realtime-v2',
        parameters: {
          format: 'pcm',
          sample_rate: 16000,
          disfluency_removal_enabled: false,
          punctuation_prediction_enabled: true,
          inverse_text_normalization_enabled: true
        },
        input: {}
      }
    };

    this.ws.send(JSON.stringify(runTaskFrame));
  }

  private safeParse(raw: WebSocket.RawData): Record<string, unknown> | null {
    try {
      if (typeof raw === 'string') {
        return JSON.parse(raw) as Record<string, unknown>;
      }
      if (raw instanceof Buffer) {
        return JSON.parse(raw.toString('utf8')) as Record<string, unknown>;
      }
      if (Array.isArray(raw)) {
        return JSON.parse(Buffer.concat(raw).toString('utf8')) as Record<string, unknown>;
      }
      return JSON.parse(Buffer.from(raw as ArrayBuffer).toString('utf8')) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  private asRecord(input: unknown): Record<string, unknown> {
    if (!input || typeof input !== 'object') {
      return {};
    }
    return input as Record<string, unknown>;
  }

  private extractText(payload: Record<string, unknown>): string {
    const body = this.asRecord(payload.payload);
    const output = this.asRecord(body.output);

    const outputSentence = this.asRecord(output.sentence);
    const outputText = typeof outputSentence.text === 'string' ? outputSentence.text : '';
    if (outputText) {
      return outputText;
    }

    const sentence = this.asRecord(body.sentence);
    const sentenceText = typeof sentence.text === 'string' ? sentence.text : '';
    if (sentenceText) {
      return sentenceText;
    }

    return typeof body.result === 'string' ? body.result : '';
  }

  private extractFinalFlag(payload: Record<string, unknown>): boolean {
    const body = this.asRecord(payload.payload);
    const output = this.asRecord(body.output);
    const sentence = this.asRecord(output.sentence);
    if (typeof sentence.end_time === 'number') {
      return true;
    }

    const sentence2 = this.asRecord(body.sentence);
    if (typeof sentence2.end_time === 'number') {
      return true;
    }

    return false;
  }
}
