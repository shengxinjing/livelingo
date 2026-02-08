export type OpenAiTranslateOptions = {
  apiKey: string;
  baseUrl?: string;
  model?: string;
};

export class OpenAiTranslateService {
  private apiKey: string;
  private baseUrl: string;
  private model: string;

  constructor(options: OpenAiTranslateOptions) {
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl ?? 'https://api.openai.com/v1').replace(/\/+$/, '');
    this.model = options.model ?? 'gpt-4o-mini';
  }

  async translateText(text: string, targetLanguage: string): Promise<string> {
    if (!text.trim()) {
      return '';
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: this.model,
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
      throw new Error(`OpenAI translation failed (${response.status}): ${errText.slice(0, 180)}`);
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
      throw new Error('OpenAI translation returned empty content.');
    }

    return output;
  }
}
