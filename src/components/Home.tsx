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
  const pauseFinalizeTimerRef = useRef<number | null>(null);
  const incrementalTranslateTimerRef = useRef<number | null>(null);
  const incrementalPendingRef = useRef<{ lineId: string; text: string } | null>(null);
  const latestInProgressTextRef = useRef('');
  const lastPartialUpdateAtRef = useRef(0);
  const isSpeakingRef = useRef(false);
  const translationInFlightRef = useRef(false);
  const queuedTranslationRef = useRef<{ lineId: string; text: string } | null>(null);
  const recentFinalRef = useRef<{ text: string; at: number }>({ text: '', at: 0 });

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

  const PAUSE_FINALIZE_MS = 1000;
  const INCREMENTAL_TRANSLATE_DEBOUNCE_MS = 180;
  const MAX_WORDS_PER_FINAL_SEGMENT = 50;
  const DUPLICATE_FINAL_WINDOW_MS = 2200;

  const normalizeSentence = (text: string): string => text.replace(/\s+/g, ' ').trim();

  const isRecentDuplicateFinal = (text: string): boolean => {
    const normalized = normalizeSentence(text);
    if (!normalized) {
      return false;
    }
    const now = Date.now();
    return (
      recentFinalRef.current.text === normalized &&
      now - recentFinalRef.current.at <= DUPLICATE_FINAL_WINDOW_MS
    );
  };

  const markRecentFinal = (text: string) => {
    const normalized = normalizeSentence(text);
    if (!normalized) {
      return;
    }
    recentFinalRef.current = { text: normalized, at: Date.now() };
  };

  const splitByWordLimit = (text: string, maxWords: number): string[] => {
    const normalized = normalizeSentence(text);
    if (!normalized) {
      return [];
    }

    const words = normalized.split(' ');
    if (words.length <= maxWords) {
      return [normalized];
    }

    const chunks: string[] = [];
    for (let i = 0; i < words.length; i += maxWords) {
      chunks.push(words.slice(i, i + maxWords).join(' ').trim());
    }
    return chunks.filter((chunk) => chunk.length > 0);
  };

  const countWords = (text: string): number => {
    const normalized = normalizeSentence(text);
    if (!normalized) {
      return 0;
    }
    return normalized.split(' ').filter(Boolean).length;
  };

  const splitBySentenceAndWordLimit = (text: string, maxWords: number): string[] => {
    const normalized = normalizeSentence(text);
    if (!normalized) {
      return [];
    }

    if (countWords(normalized) <= maxWords) {
      return [normalized];
    }

    const sentenceParts = (normalized.match(/[^.!?。！？]+[.!?。！？]*/g) ?? [])
      .map((part) => normalizeSentence(part))
      .filter((part) => part.length > 0);

    if (sentenceParts.length === 0) {
      return splitByWordLimit(normalized, maxWords);
    }

    const result: string[] = [];
    let current = '';

    sentenceParts.forEach((part) => {
      const candidate = current ? `${current} ${part}` : part;
      if (countWords(candidate) <= maxWords) {
        current = candidate;
        return;
      }

      if (current) {
        result.push(current);
      }

      if (countWords(part) <= maxWords) {
        current = part;
      } else {
        result.push(...splitByWordLimit(part, maxWords));
        current = '';
      }
    });

    if (current) {
      result.push(current);
    }

    return result.filter((item) => item.length > 0);
  };

  const findReusableLastLineId = (content: string): string | null => {
    const normalized = normalizeSentence(content);
    if (!normalized) {
      return null;
    }

    const lastLine = linesRef.current[linesRef.current.length - 1];
    if (!lastLine) {
      return null;
    }

    const lastOriginal = normalizeSentence(lastLine.original);
    if (!lastOriginal) {
      return lastLine.id;
    }

    const isSameSentenceStream =
      normalized.startsWith(lastOriginal) ||
      lastOriginal.startsWith(normalized);

    return isSameSentenceStream ? lastLine.id : null;
  };

  const clearPauseFinalizeTimer = () => {
    if (pauseFinalizeTimerRef.current !== null) {
      window.clearTimeout(pauseFinalizeTimerRef.current);
      pauseFinalizeTimerRef.current = null;
    }
  };

  const clearIncrementalTranslateTimer = () => {
    if (incrementalTranslateTimerRef.current !== null) {
      window.clearTimeout(incrementalTranslateTimerRef.current);
      incrementalTranslateTimerRef.current = null;
    }
    incrementalPendingRef.current = null;
    queuedTranslationRef.current = null;
  };

  const requestLineTranslation = async (lineId: string, text: string) => {
    const content = text.trim();
    if (!content) {
      return;
    }

    const translated = await translateText(content);
    setLines((prev) =>
      prev.map((line) => {
        if (line.id !== lineId) {
          return line;
        }
        return { ...line, translated };
      })
    );
  };

  const flushQueuedTranslation = () => {
    if (translationInFlightRef.current) {
      return;
    }

    const pending = queuedTranslationRef.current;
    if (!pending) {
      return;
    }

    queuedTranslationRef.current = null;
    translationInFlightRef.current = true;
    void (async () => {
      try {
        await requestLineTranslation(pending.lineId, pending.text);
      } finally {
        translationInFlightRef.current = false;
        flushQueuedTranslation();
      }
    })();
  };

  const enqueueLineTranslation = (lineId: string, text: string) => {
    queuedTranslationRef.current = { lineId, text };
    flushQueuedTranslation();
  };

  const scheduleIncrementalTranslation = (lineId: string, text: string) => {
    incrementalPendingRef.current = { lineId, text };
    if (incrementalTranslateTimerRef.current !== null) {
      return;
    }

    incrementalTranslateTimerRef.current = window.setTimeout(() => {
      incrementalTranslateTimerRef.current = null;
      const pending = incrementalPendingRef.current;
      if (!pending) {
        return;
      }

      enqueueLineTranslation(pending.lineId, pending.text);
      incrementalPendingRef.current = null;
    }, INCREMENTAL_TRANSLATE_DEBOUNCE_MS);
  };

  const finalizeCurrentSentence = (rawText?: string) => {
    const content = (rawText ?? latestInProgressTextRef.current).trim();
    if (!content) {
      clearPauseFinalizeTimer();
      clearIncrementalTranslateTimer();
      return;
    }

    const targetLineId =
      inProgressLineIdRef.current ??
      findReusableLastLineId(content) ??
      createId();
    inProgressLineIdRef.current = targetLineId;
    setLines((prev) => {
      const index = prev.findIndex((line) => line.id === targetLineId);
      if (index >= 0) {
        const updated = [...prev];
        updated[index] = { ...updated[index], original: content };
        return updated;
      }

      return [...prev, { id: targetLineId, original: content, translated: '' }];
    });

    enqueueLineTranslation(targetLineId, content);
    markRecentFinal(content);

    inProgressLineIdRef.current = null;
    latestInProgressTextRef.current = '';
    clearPauseFinalizeTimer();
    clearIncrementalTranslateTimer();
  };

  const runPauseFinalizeCheck = () => {
    const idleMs = Date.now() - lastPartialUpdateAtRef.current;
    const canFinalize = idleMs >= PAUSE_FINALIZE_MS && !isSpeakingRef.current;
    if (canFinalize) {
      finalizeCurrentSentence();
      return;
    }

    pauseFinalizeTimerRef.current = window.setTimeout(runPauseFinalizeCheck, 180);
  };

  const schedulePauseFinalizeCheck = () => {
    clearPauseFinalizeTimer();
    pauseFinalizeTimerRef.current = window.setTimeout(runPauseFinalizeCheck, PAUSE_FINALIZE_MS);
  };

  const upsertInProgressSentence = (text: string) => {
    const content = text.trim();
    if (!content) {
      return;
    }

    const nextInProgressLineId =
      inProgressLineIdRef.current ??
      findReusableLastLineId(content) ??
      createId();
    inProgressLineIdRef.current = nextInProgressLineId;
    setLines((prev) => {
      const index = prev.findIndex((line) => line.id === nextInProgressLineId);
      if (index >= 0) {
        const updated = [...prev];
        updated[index] = { ...updated[index], original: content };
        return updated;
      }

      return [...prev, { id: nextInProgressLineId, original: content, translated: '' }];
    });
    latestInProgressTextRef.current = content;
    lastPartialUpdateAtRef.current = Date.now();

    schedulePauseFinalizeCheck();

    scheduleIncrementalTranslation(nextInProgressLineId, content);
  };

  const commitRecognizedSentence = (text: string) => {
    const content = normalizeSentence(text);
    if (!content) {
      return;
    }

    if (isRecentDuplicateFinal(content)) {
      return;
    }

    const segments = splitBySentenceAndWordLimit(content, MAX_WORDS_PER_FINAL_SEGMENT);
    if (segments.length === 0) {
      return;
    }

    if (!inProgressLineIdRef.current && linesRef.current.length > 0) {
      const lastLine = linesRef.current[linesRef.current.length - 1];
      const lastOriginal = normalizeSentence(lastLine.original);
      const recentFinal = recentFinalRef.current.text;
      const recentlyFinalized = Date.now() - recentFinalRef.current.at <= 5000;
      const shouldMergeIntoLast =
        content.startsWith(lastOriginal) ||
        lastOriginal.startsWith(content) ||
        (recentlyFinalized &&
          (content.startsWith(recentFinal) || recentFinal.startsWith(content)));

      if (shouldMergeIntoLast) {
        inProgressLineIdRef.current = lastLine.id;
      }
    }

    segments.forEach((segment) => {
      if (isRecentDuplicateFinal(segment)) {
        return;
      }
      upsertInProgressSentence(segment);
      finalizeCurrentSentence(segment);
    });
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
      clearPauseFinalizeTimer();
      clearIncrementalTranslateTimer();
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
    isSpeakingRef.current = false;
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
      const speaking = rms > speakingThreshold;

      setSpeechLevel(normalized);
      setIsSpeaking(speaking);
      isSpeakingRef.current = speaking;
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
    latestInProgressTextRef.current = '';
    lastPartialUpdateAtRef.current = 0;
    isSpeakingRef.current = false;
    translationInFlightRef.current = false;
    queuedTranslationRef.current = null;
    clearPauseFinalizeTimer();
    clearIncrementalTranslateTimer();

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
    latestInProgressTextRef.current = '';
    clearPauseFinalizeTimer();
    clearIncrementalTranslateTimer();

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
          <div style={{ marginTop: '20vh', color: 'rgba(226, 232, 240, 0.9)', textAlign: 'left' }}>
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
              color: '#f8fafc',
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
                  color: '#93c5fd',
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#cbd5e1', fontSize: '14px' }}>
            <Loader2 className="animate-spin" size={16} />
            <span>Processing chunk...</span>
          </div>
        )}

        {status && <div style={{ color: '#cbd5e1', fontSize: '13px' }}>{status}</div>}

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
          right: '18px',
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
