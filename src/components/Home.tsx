import React, { useEffect, useRef, useState } from 'react';
import { Loader2, Mic, Square } from 'lucide-react';
import { QwenTranslateService } from '../services/qwen-translate';

type TranscriptLine = {
  id: string;
  original: string;
  translated: string;
};

type TranscriptHistoryRecord = {
  id: string;
  title: string;
  createdAt: string;
  lines: TranscriptLine[];
};

function createId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatHistoryTitle(date: Date): string {
  const pad = (value: number) => value.toString().padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function downsampleTo16k(input: Float32Array, inputSampleRate: number): Int16Array {
  if (inputSampleRate === 16000) {
    const output = new Int16Array(input.length);
    for (let i = 0; i < input.length; i += 1) {
      const sample = Math.max(-1, Math.min(1, input[i]));
      output[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
    }
    return output;
  }

  const ratio = inputSampleRate / 16000;
  const newLength = Math.round(input.length / ratio);
  const output = new Int16Array(newLength);

  let offsetResult = 0;
  let offsetBuffer = 0;
  while (offsetResult < output.length) {
    const nextOffsetBuffer = Math.round((offsetResult + 1) * ratio);
    let accum = 0;
    let count = 0;

    for (let i = offsetBuffer; i < nextOffsetBuffer && i < input.length; i += 1) {
      accum += input[i];
      count += 1;
    }

    const sample = count > 0 ? accum / count : 0;
    const clamped = Math.max(-1, Math.min(1, sample));
    output[offsetResult] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;

    offsetResult += 1;
    offsetBuffer = nextOffsetBuffer;
  }

  return output;
}

const Home: React.FC = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [lines, setLines] = useState<TranscriptLine[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [status, setStatus] = useState('');
  const [selectedText, setSelectedText] = useState('');
  const [selectedTranslation, setSelectedTranslation] = useState('');
  const [selectionTooltipPosition, setSelectionTooltipPosition] = useState<{ left: number; top: number } | null>(null);

  const transcriptScrollRef = useRef<HTMLDivElement | null>(null);
  const linesRef = useRef<TranscriptLine[]>([]);
  const selectionRequestIdRef = useRef(0);
  const selectionTranslationCacheRef = useRef<Map<string, string>>(new Map());
  const selectionMouseAnchorRef = useRef<{ x: number; y: number } | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const aliyunAudioContextRef = useRef<AudioContext | null>(null);
  const aliyunSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const aliyunProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const aliyunSilenceGainRef = useRef<GainNode | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const inProgressLineIdRef = useRef<string | null>(null);

  const [sttProvider, setSttProvider] = useState('aliyun');
  const [openaiSttApiKey, setOpenaiSttApiKey] = useState('');
  const [aliyunApiKey, setAliyunApiKey] = useState('');

  const [translationEnabled, setTranslationEnabled] = useState(true);
  const [translationTargetLanguage, setTranslationTargetLanguage] = useState('English');
  const [qwenApiKey, setQwenApiKey] = useState('');
  const [qwenBaseUrl, setQwenBaseUrl] = useState('https://dashscope.aliyuncs.com/compatible-mode/v1');
  const [qwenModel, setQwenModel] = useState('qwen-plus');

  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speechLevel, setSpeechLevel] = useState(0);

  const upsertInProgressSentence = (text: string) => {
    const content = text.trim();
    if (!content) {
      return;
    }

    let nextInProgressLineId = inProgressLineIdRef.current;
    setLines((prev) => {
      if (nextInProgressLineId) {
        const index = prev.findIndex((line) => line.id === nextInProgressLineId);
        if (index >= 0) {
          const updated = [...prev];
          updated[index] = { ...updated[index], original: content, translated: '' };
          return updated;
        }
      }

      nextInProgressLineId = createId();
      return [...prev, { id: nextInProgressLineId, original: content, translated: '' }];
    });
    inProgressLineIdRef.current = nextInProgressLineId;
  };

  const commitRecognizedSentence = (text: string) => {
    const content = text.trim();
    if (!content) {
      return;
    }

    let targetLineId = inProgressLineIdRef.current;
    setLines((prev) => {
      if (targetLineId) {
        const index = prev.findIndex((line) => line.id === targetLineId);
        if (index >= 0) {
          const updated = [...prev];
          updated[index] = { ...updated[index], original: content };
          return updated;
        }
      }

      targetLineId = createId();
      return [...prev, { id: targetLineId, original: content, translated: '' }];
    });
    inProgressLineIdRef.current = null;

    void (async () => {
      const translated = await translateText(content);
      setLines((prev) =>
        prev.map((line) => {
          if (line.id !== targetLineId) {
            return line;
          }
          // Avoid stale translation overriding newer merged content.
          if (line.original !== content) {
            return line;
          }
          return { ...line, translated };
        })
      );
    })();
  };

  useEffect(() => {
    const loadSettings = async () => {
      const provider = (await window.appApi.store.get('sttProvider')) as string | undefined;
      const openaiKey = await window.appApi.providerKey.getDecrypted('openai');
      const qwenKey = await window.appApi.providerKey.getDecrypted('qwen');
      const aliKey = (await window.appApi.store.get('aliyunApiKey')) as string | undefined;

      const enabled = (await window.appApi.store.get('translationEnabled')) as boolean | undefined;
      const targetLang = (await window.appApi.store.get('translationTargetLanguage')) as string | undefined;

      const config = await window.appApi.providerConfig.get();
      const qwenConfig = config.providers.qwen;

      setSttProvider(provider ?? 'aliyun');
      setOpenaiSttApiKey(openaiKey);
      setAliyunApiKey(aliKey ?? '');

      setTranslationEnabled(enabled ?? true);
      setTranslationTargetLanguage(targetLang ?? 'English');
      setQwenApiKey(qwenKey);
      setQwenBaseUrl(qwenConfig.baseUrl);
      setQwenModel(qwenConfig.model);
    };

    loadSettings();

    const offAliyunResult = window.appApi.stt.onAliyunResult((payload) => {
      if (!payload.text.trim()) {
        return;
      }

      if (payload.isFinal) {
        commitRecognizedSentence(payload.text);
      } else {
        upsertInProgressSentence(payload.text);
      }
    });

    const offAliyunError = window.appApi.stt.onAliyunError((message) => {
      setStatus(`Aliyun STT error: ${message}`);
    });

    return () => {
      offAliyunResult();
      offAliyunError();
      stopVoiceMonitor();
      stopAliyunCapture();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [translationEnabled, translationTargetLanguage, qwenApiKey, qwenBaseUrl, qwenModel]);

  useEffect(() => {
    if (!transcriptScrollRef.current) {
      return;
    }
    transcriptScrollRef.current.scrollTop = transcriptScrollRef.current.scrollHeight;
  }, [lines]);

  useEffect(() => {
    linesRef.current = lines;
  }, [lines]);

  const stopAliyunCapture = () => {
    aliyunProcessorRef.current?.disconnect();
    aliyunSourceRef.current?.disconnect();
    aliyunSilenceGainRef.current?.disconnect();
    void aliyunAudioContextRef.current?.close();

    aliyunProcessorRef.current = null;
    aliyunSourceRef.current = null;
    aliyunSilenceGainRef.current = null;
    aliyunAudioContextRef.current = null;
  };

  const stopVoiceMonitor = () => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    sourceNodeRef.current?.disconnect();
    analyserRef.current?.disconnect();
    void audioContextRef.current?.close();

    sourceNodeRef.current = null;
    analyserRef.current = null;
    audioContextRef.current = null;
    setIsSpeaking(false);
    setSpeechLevel(0);
  };

  const startVoiceMonitor = (stream: MediaStream) => {
    stopVoiceMonitor();

    const context = new AudioContext();
    const analyser = context.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.85;

    const source = context.createMediaStreamSource(stream);
    source.connect(analyser);

    audioContextRef.current = context;
    analyserRef.current = analyser;
    sourceNodeRef.current = source;

    const data = new Uint8Array(analyser.frequencyBinCount);
    const speakingThreshold = 0.06;

    const tick = () => {
      analyser.getByteTimeDomainData(data);
      let sumSquares = 0;
      for (let i = 0; i < data.length; i += 1) {
        const centered = (data[i] - 128) / 128;
        sumSquares += centered * centered;
      }
      const rms = Math.sqrt(sumSquares / data.length);
      const normalized = Math.max(0, Math.min(1, (rms - 0.015) * 10));

      setSpeechLevel(normalized);
      setIsSpeaking(rms > speakingThreshold);
      animationFrameRef.current = requestAnimationFrame(tick);
    };

    animationFrameRef.current = requestAnimationFrame(tick);
  };

  const startAliyunCapture = (stream: MediaStream) => {
    stopAliyunCapture();

    const context = new AudioContext();
    const source = context.createMediaStreamSource(stream);
    const processor = context.createScriptProcessor(4096, 1, 1);
    const silenceGain = context.createGain();
    silenceGain.gain.value = 0;

    source.connect(processor);
    processor.connect(silenceGain);
    silenceGain.connect(context.destination);

    processor.onaudioprocess = (event) => {
      const input = event.inputBuffer.getChannelData(0);
      const pcm16 = downsampleTo16k(input, context.sampleRate);
      if (pcm16.length === 0) {
        return;
      }

      const bytes = new Uint8Array(pcm16.buffer);
      void window.appApi.stt.sendAliyunAudio(Array.from(bytes));
    };

    aliyunAudioContextRef.current = context;
    aliyunSourceRef.current = source;
    aliyunProcessorRef.current = processor;
    aliyunSilenceGainRef.current = silenceGain;
  };

  const translateText = async (text: string): Promise<string> => {
    if (!translationEnabled || !qwenApiKey) {
      return '';
    }

    const translator = new QwenTranslateService({
      apiKey: qwenApiKey,
      baseUrl: qwenBaseUrl,
      model: qwenModel
    });

    try {
      return await translator.translateText(text, translationTargetLanguage);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return `Qwen translation error: ${message}`;
    }
  };

  const translateSelectedText = async (text: string): Promise<string> => {
    if (!qwenApiKey) {
      return 'Please set Translation API Key in Settings first.';
    }

    const cached = selectionTranslationCacheRef.current.get(text);
    if (cached) {
      return cached;
    }

    const translator = new QwenTranslateService({
      apiKey: qwenApiKey,
      baseUrl: qwenBaseUrl,
      model: qwenModel
    });

    try {
      const translated = await translator.translateText(text, translationTargetLanguage);
      selectionTranslationCacheRef.current.set(text, translated);
      return translated;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return `Qwen translation error: ${message}`;
    }
  };

  const translateCurrentSelection = async () => {
    const selectionObject = window.getSelection();
    const selection = selectionObject?.toString().trim() ?? '';
    if (!selection || !selectionObject || selectionObject.rangeCount === 0) {
      setSelectedText('');
      setSelectedTranslation('');
      setSelectionTooltipPosition(null);
      return;
    }

    const tooltipWidth = 320;
    const margin = 12;
    const mouseAnchor = selectionMouseAnchorRef.current;
    let left = margin;
    let top = margin;

    if (mouseAnchor) {
      left = mouseAnchor.x + 12;
      top = mouseAnchor.y + 4;
    } else {
      const range = selectionObject.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      left = rect.left + rect.width / 2 - tooltipWidth / 2;
      top = rect.bottom + 10;
    }

    left = Math.max(margin, Math.min(window.innerWidth - tooltipWidth - margin, left));
    top = Math.max(margin, Math.min(window.innerHeight - 56, top));
    setSelectionTooltipPosition({ left, top });

    const requestId = selectionRequestIdRef.current + 1;
    selectionRequestIdRef.current = requestId;
    setSelectedText(selection);
    setSelectedTranslation('');

    const translated = await translateSelectedText(selection);
    if (selectionRequestIdRef.current !== requestId) {
      return;
    }

    setSelectedTranslation(translated);
  };

  const handleSelectionCheck = () => {
    setTimeout(() => {
      void translateCurrentSelection();
    }, 0);
  };

  const handleSelectionMouseUp = (event: React.MouseEvent<HTMLDivElement>) => {
    selectionMouseAnchorRef.current = { x: event.clientX, y: event.clientY };
    handleSelectionCheck();
  };

  const handleSelectionKeyUp = () => {
    selectionMouseAnchorRef.current = null;
    handleSelectionCheck();
  };

  const startRecording = async () => {
    const previousLines = linesRef.current.filter((line) => line.original.trim().length > 0);
    if (previousLines.length > 0) {
      const now = new Date();
      const title = formatHistoryTitle(now);
      const record: TranscriptHistoryRecord = {
        id: createId(),
        title,
        createdAt: now.toISOString(),
        lines: previousLines
      };

      const existing = (await window.appApi.store.get('transcriptHistory')) as TranscriptHistoryRecord[] | undefined;
      const next = [record, ...(existing ?? [])];
      await window.appApi.store.set('transcriptHistory', next);
    }

    setLines([]);
    setStatus('');
    inProgressLineIdRef.current = null;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      startVoiceMonitor(stream);

      if (sttProvider === 'aliyun') {
        if (!aliyunApiKey.trim()) {
          alert('Please set your Aliyun API Key in Settings > Speech first.');
          return;
        }

        setStatus('Starting Aliyun Paraformer realtime...');
        await window.appApi.stt.startAliyun(aliyunApiKey.trim(), 'paraformer-realtime-v2');
        startAliyunCapture(stream);
        inProgressLineIdRef.current = null;
        setIsRecording(true);
        setStatus('Speak now.');
        return;
      }

      if (!openaiSttApiKey) {
        alert('Please set your OpenAI API Key in Settings > Speech first.');
        return;
      }

      setStatus('Listening...');
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = async (event) => {
        if (event.data.size > 0) {
          setIsProcessing(true);
          try {
            const audioBuffer = await event.data.arrayBuffer();
            let binary = '';
            const bytes = new Uint8Array(audioBuffer);
            for (let i = 0; i < bytes.byteLength; i += 1) {
              binary += String.fromCharCode(bytes[i]);
            }
            const audioBase64 = btoa(binary);

            const text = await window.appApi.stt.transcribeOpenAi(audioBase64, event.data.type || 'audio/webm', 'zh');
            if (text && text.trim().length > 0) {
              commitRecognizedSentence(text);
            }
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            setStatus(`STT failed: ${message}`);
          } finally {
            setIsProcessing(false);
          }
        }
      };

      recorder.start(3000);
      setIsRecording(true);
    } catch (err) {
      console.error('Error accessing microphone:', err);
      alert('Could not access microphone. Please check permissions.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
    }

    void window.appApi.stt.stopAliyun();
    stopAliyunCapture();
    stopVoiceMonitor();
    inProgressLineIdRef.current = null;

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
    }

    setIsRecording(false);
    setStatus('Stopped.');
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        position: 'relative',
        paddingBottom: '0'
      }}
    >
      <div
        ref={transcriptScrollRef}
        onMouseUp={handleSelectionMouseUp}
        onKeyUp={handleSelectionKeyUp}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '20px',
          paddingBottom: '96px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          alignItems: 'stretch'
        }}
      >
        {lines.length === 0 && !isRecording && (
          <div style={{ marginTop: '20vh', color: '#888', textAlign: 'left' }}>
            <p style={{ marginBottom: '10px' }}>Ready to transcribe and translate.</p>
            <p style={{ fontSize: '0.9em' }}>Click the microphone to start.</p>
          </div>
        )}

        {lines.map((line) => (
          <div
            key={line.id}
            style={{
              background: 'transparent',
              padding: '4px 0',
              width: '100%',
              maxWidth: '100%',
              fontSize: '18px',
              lineHeight: '1.5',
              color: '#222',
              textAlign: 'left',
              whiteSpace: 'pre-wrap',
              overflowWrap: 'anywhere',
              wordBreak: 'break-word'
            }}
          >
            <div style={{ fontWeight: 600, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
              {line.original}
            </div>
            {translationEnabled && line.translated.trim().length > 0 && (
              <div
                style={{
                  marginTop: 6,
                  color: '#0a5cad',
                  whiteSpace: 'pre-wrap',
                  overflowWrap: 'anywhere',
                  wordBreak: 'break-word'
                }}
              >
                {line.translated}
              </div>
            )}
          </div>
        ))}

        {isProcessing && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#666', fontSize: '14px' }}>
            <Loader2 className="animate-spin" size={16} />
            <span>Processing chunk...</span>
          </div>
        )}

        {status && <div style={{ color: '#666', fontSize: '13px' }}>{status}</div>}

        <div style={{ height: '24px', flexShrink: 0 }} />
      </div>

      {selectedText && selectionTooltipPosition && selectedTranslation.trim().length > 0 && (
        <div
          style={{
            position: 'fixed',
            left: `${selectionTooltipPosition.left}px`,
            top: `${selectionTooltipPosition.top}px`,
            maxWidth: '320px',
            padding: '10px 12px',
            borderRadius: '8px',
            background: 'rgba(15, 23, 42, 0.95)',
            color: '#f8fafc',
            fontSize: '13px',
            lineHeight: 1.45,
            boxShadow: '0 8px 24px rgba(15, 23, 42, 0.28)',
            zIndex: 120,
            whiteSpace: 'pre-wrap',
            overflowWrap: 'anywhere',
            wordBreak: 'break-word',
            pointerEvents: 'none'
          }}
        >
          {selectedTranslation}
        </div>
      )}

      <div
        style={{
          position: 'absolute',
          bottom: '102px',
          left: '18px',
          display: 'flex',
          gap: '12px',
          zIndex: 50
        }}
      >
        <div
          style={{
            position: 'relative',
            width: '52px',
            height: '52px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          {isRecording && (
            <>
              <span
                style={{
                  position: 'absolute',
                  width: `${44 + speechLevel * 20}px`,
                  height: `${44 + speechLevel * 20}px`,
                  borderRadius: '50%',
                  background: 'rgba(239, 68, 68, 0.18)',
                  transform: 'scale(1)',
                  opacity: isSpeaking ? 1 : 0.45,
                  animation: isSpeaking ? 'wavePulse 0.9s ease-out infinite' : 'none',
                  transition: 'all 120ms linear'
                }}
              />
              <span
                style={{
                  position: 'absolute',
                  width: `${38 + speechLevel * 14}px`,
                  height: `${38 + speechLevel * 14}px`,
                  borderRadius: '50%',
                  border: '2px solid rgba(239, 68, 68, 0.45)',
                  opacity: isSpeaking ? 0.95 : 0.35,
                  animation: isSpeaking ? 'wavePulse 1.15s ease-out infinite' : 'none',
                  transition: 'all 120ms linear'
                }}
              />
            </>
          )}
          <button
            onClick={isRecording ? stopRecording : startRecording}
            style={{
              width: '36px',
              height: '36px',
              padding: 0,
              borderRadius: '50%',
              background: isRecording ? '#333' : '#ef4444',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              boxShadow: isRecording ? '0 4px 12px rgba(0,0,0,0.2)' : '0 4px 12px rgba(239, 68, 68, 0.4)',
              zIndex: 2
            }}
          >
            {isRecording ? <Square size={16} fill="currentColor" /> : <Mic size={20} />}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .animate-spin {
          animation: spin 1s linear infinite;
        }
        @keyframes wavePulse {
          0% {
            transform: scale(0.92);
            opacity: 0.75;
          }
          100% {
            transform: scale(1.08);
            opacity: 0.2;
          }
        }
      `}</style>
    </div>
  );
};

export default Home;
