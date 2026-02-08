import React, { useEffect, useState } from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import { ArrowLeft, Languages, Mic } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import './Settings.css';

const Settings: React.FC = () => {
  const navigate = useNavigate();

  const [sttProvider, setSttProvider] = useState('aliyun');
  const [aliyunApiKey, setAliyunApiKey] = useState('');
  const [openaiSttApiKeyInput, setOpenaiSttApiKeyInput] = useState('');

  const [translationTargetLanguage, setTranslationTargetLanguage] = useState('English');
  const [translationEnabled, setTranslationEnabled] = useState(true);
  const [qwenTranslationApiKeyInput, setQwenTranslationApiKeyInput] = useState('');

  const [statusMessage, setStatusMessage] = useState('');
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    const loadSettings = async () => {
      const storedSttProvider = (await window.appApi.store.get('sttProvider')) as string | undefined;
      const storedAliyunKey = (await window.appApi.store.get('aliyunApiKey')) as string | undefined;
      const storedTranslationTargetLanguage =
        (await window.appApi.store.get('translationTargetLanguage')) as string | undefined;
      const storedTranslationEnabled = (await window.appApi.store.get('translationEnabled')) as boolean | undefined;

      const openaiKey = await window.appApi.providerKey.getDecrypted('openai');
      const qwenKey = await window.appApi.providerKey.getDecrypted('qwen');

      setSttProvider(storedSttProvider ?? 'aliyun');
      setAliyunApiKey(storedAliyunKey ?? '');
      setOpenaiSttApiKeyInput(openaiKey);

      setTranslationTargetLanguage(storedTranslationTargetLanguage ?? 'English');
      setTranslationEnabled(storedTranslationEnabled ?? true);
      setQwenTranslationApiKeyInput(qwenKey);
    };

    loadSettings();
  }, []);

  const saveSpeechSettings = async () => {
    setIsBusy(true);
    await window.appApi.store.set('sttProvider', sttProvider);
    await window.appApi.store.set('aliyunApiKey', aliyunApiKey);

    if (openaiSttApiKeyInput.trim()) {
      await window.appApi.providerKey.save('openai', openaiSttApiKeyInput.trim());
    }

    setStatusMessage('Speech settings saved.');
    setIsBusy(false);
  };

  const saveTranslationSettings = async () => {
    setIsBusy(true);

    await window.appApi.store.set('translationProvider', 'qwen');
    await window.appApi.store.set('translationTargetLanguage', translationTargetLanguage);
    await window.appApi.store.set('translationEnabled', translationEnabled);

    if (qwenTranslationApiKeyInput.trim()) {
      await window.appApi.providerKey.save('qwen', qwenTranslationApiKeyInput.trim());
    }

    setStatusMessage('Translation settings saved.');
    setIsBusy(false);
  };

  return (
    <div className="settings-container">
      <Tabs.Root className="TabsRoot" defaultValue="speech" orientation="vertical">
        <Tabs.List className="TabsList" aria-label="Settings tabs">
          <div style={{ padding: '20px', paddingBottom: '10px' }}>
            <button onClick={() => navigate('/')} className="back-button" style={{ marginBottom: '15px' }}>
              <ArrowLeft size={16} />
              <span>Back</span>
            </button>
            <h2 style={{ margin: '0 0 10px 0', fontSize: '18px', paddingLeft: '10px' }}>Settings</h2>
          </div>

          <Tabs.Trigger className="TabsTrigger" value="speech">
            <Mic size={16} style={{ marginRight: 8 }} />
            Speech
          </Tabs.Trigger>
          <Tabs.Trigger className="TabsTrigger" value="translation">
            <Languages size={16} style={{ marginRight: 8 }} />
            Translation
          </Tabs.Trigger>
        </Tabs.List>

        <div className="TabsContentWrapper">
          <div className="TabsContentScroll">
            <Tabs.Content className="TabsContent" value="speech">
              <h3>Speech Recognition</h3>
              <p className="description">Configure STT provider and key.</p>

              <div className="input-group">
                <label>STT Provider</label>
                <select value={sttProvider} onChange={(event) => setSttProvider(event.target.value)}>
                  <option value="aliyun">Aliyun (FunASR/Paraformer)</option>
                  <option value="openai">OpenAI (Whisper)</option>
                </select>
              </div>

              {sttProvider === 'aliyun' && (
                <div className="input-group">
                  <label>Aliyun DashScope API Key</label>
                  <input
                    type="text"
                    value={aliyunApiKey}
                    onChange={(event) => setAliyunApiKey(event.target.value)}
                    placeholder="sk-..."
                  />
                </div>
              )}

              <div className="input-group">
                <label>OpenAI API Key</label>
                <input
                  type="text"
                  value={openaiSttApiKeyInput}
                  onChange={(event) => setOpenaiSttApiKeyInput(event.target.value)}
                  placeholder="sk-..."
                />
              </div>

              <div className="actions">
                <button onClick={saveSpeechSettings} className="save-button" disabled={isBusy}>
                  Save Speech Settings
                </button>
              </div>
            </Tabs.Content>

            <Tabs.Content className="TabsContent" value="translation">
              <h3>Translation Service</h3>
              <p className="description">Use Tongyi Qwen (DashScope) for translation.</p>

              <div className="input-group">
                <label>API Key</label>
                <input
                  type="text"
                  value={qwenTranslationApiKeyInput}
                  onChange={(event) => setQwenTranslationApiKeyInput(event.target.value)}
                  placeholder="sk-..."
                />
              </div>

              <div className="input-group">
                <label>Target Language</label>
                <select
                  value={translationTargetLanguage}
                  onChange={(event) => setTranslationTargetLanguage(event.target.value)}
                >
                  <option value="English">English</option>
                  <option value="Chinese">Chinese</option>
                  <option value="Japanese">Japanese</option>
                  <option value="Korean">Korean</option>
                </select>
              </div>

              <div className="input-group">
                <label>Translation</label>
                <select
                  value={translationEnabled ? 'enabled' : 'disabled'}
                  onChange={(event) => setTranslationEnabled(event.target.value === 'enabled')}
                >
                  <option value="enabled">Enabled</option>
                  <option value="disabled">Disabled</option>
                </select>
              </div>

              <div className="actions">
                <button onClick={saveTranslationSettings} className="save-button" disabled={isBusy}>
                  Save Translation Settings
                </button>
              </div>
            </Tabs.Content>

            {statusMessage && <div className="save-status">{statusMessage}</div>}
          </div>
        </div>
      </Tabs.Root>
    </div>
  );
};

export default Settings;
