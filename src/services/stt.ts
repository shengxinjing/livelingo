import axios from 'axios';

export interface SttService {
  transcribe(audioBlob: Blob): Promise<string>;
}

export class OpenAiSttService implements SttService {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async transcribe(audioBlob: Blob): Promise<string> {
    const formData = new FormData();
    // OpenAI requires a filename with extension to detect format
    formData.append('file', audioBlob, 'audio.webm');
    formData.append('model', 'whisper-1');
    formData.append('language', 'zh'); // Default to Chinese or make configurable later

    try {
      const response = await axios.post(
        'https://api.openai.com/v1/audio/transcriptions',
        formData,
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'multipart/form-data',
          },
        }
      );
      return response.data.text;
    } catch (error) {
      console.error('OpenAI STT Error:', error);
      throw error;
    }
  }
}
