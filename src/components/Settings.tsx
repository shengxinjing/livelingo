import React, { useEffect, useState } from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import { ArrowLeft, ExternalLink, Keyboard, Languages, Mic } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import './Settings.css';

const Settings: React.FC = () => {
  const navigate = useNavigate();

  const [aliyunApiKey, setAliyunApiKey] = useState('');

  const [translationTargetLanguage, setTranslationTargetLanguage] = useState('English');
  const [translationEnabled, setTranslationEnabled] = useState(true);

  const [statusMessage, setStatusMessage] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [textAssistEnabled, setTextAssistEnabled] = useState(true);
  const [textAssistDebugLogging, setTextAssistDebugLogging] = useState(false);
  const [textAssistMode, setTextAssistMode] = useState<'triple-space' | 'hotkey'>('hotkey');
  const [textAssistHotkey, setTextAssistHotkey] = useState('CommandOrControl+Shift+L');
  const [textAssistTripleSpaceWindowMs, setTextAssistTripleSpaceWindowMs] = useState(700);
  const [textAssistStatus, setTextAssistStatus] = useState<TextAssistStatus | null>(null);

  useEffect(() => {
    const loadSettings = async () => {
      const storedAliyunKey = (await window.appApi.store.get('aliyunApiKey')) as string | undefined;
      const storedTranslationTargetLanguage =
        (await window.appApi.store.get('translationTargetLanguage')) as string | undefined;
      const storedTranslationEnabled = (await window.appApi.store.get('translationEnabled')) as boolean | undefined;

      const textAssistConfig = await window.appApi.textAssist.getConfig();
      const status = await window.appApi.textAssist.getStatus();

      setAliyunApiKey(storedAliyunKey ?? '');

      setTranslationTargetLanguage(storedTranslationTargetLanguage ?? 'English');
      setTranslationEnabled(storedTranslationEnabled ?? true);

      setTextAssistEnabled(textAssistConfig.enabled);
      setTextAssistDebugLogging(textAssistConfig.debugLogging);
      setTextAssistMode(textAssistConfig.trigger.mode);
      setTextAssistHotkey(textAssistConfig.trigger.hotkey);
      setTextAssistTripleSpaceWindowMs(textAssistConfig.trigger.tripleSpaceWindowMs);
      setTextAssistStatus(status);
    };

    loadSettings();
  }, []);

  const saveSpeechSettings = async () => {
    setIsBusy(true);
    await window.appApi.store.set('aliyunApiKey', aliyunApiKey.trim());

    setStatusMessage('Aliyun API key saved.');
    setIsBusy(false);
  };

  const saveTranslationSettings = async () => {
    setIsBusy(true);

    await window.appApi.store.set('translationProvider', 'qwen');
    await window.appApi.store.set('translationTargetLanguage', translationTargetLanguage);
    await window.appApi.store.set('translationEnabled', translationEnabled);

    setStatusMessage('Translation settings saved.');
    setIsBusy(false);
  };

  const saveTextAssistSettings = async () => {
    setIsBusy(true);
    const saved = await window.appApi.textAssist.saveConfig({
      enabled: textAssistEnabled,
      debugLogging: textAssistDebugLogging,
      trigger: {
        mode: textAssistMode,
        hotkey: textAssistHotkey.trim() || 'CommandOrControl+Shift+L',
        tripleSpaceWindowMs: Number.isFinite(textAssistTripleSpaceWindowMs)
          ? Math.max(200, Math.min(2000, textAssistTripleSpaceWindowMs))
          : 700
      }
    });

    const status = await window.appApi.textAssist.getStatus();
    setTextAssistEnabled(saved.enabled);
    setTextAssistDebugLogging(saved.debugLogging);
    setTextAssistMode(saved.trigger.mode);
    setTextAssistHotkey(saved.trigger.hotkey);
    setTextAssistTripleSpaceWindowMs(saved.trigger.tripleSpaceWindowMs);
    setTextAssistStatus(status);
    setStatusMessage('Text Assist settings saved.');
    setIsBusy(false);
  };

  const runTextAssistTest = async () => {
    setIsBusy(true);
    const result = await window.appApi.textAssist.runOnce();
    const status = await window.appApi.textAssist.getStatus();
    setTextAssistStatus(status);
    setStatusMessage(result.ok ? 'Text Assist test completed.' : `Text Assist test failed: ${result.message}`);
    setIsBusy(false);
  };

  const openAccessibilitySettings = async () => {
    setIsBusy(true);
    const opened = await window.appApi.textAssist.openAccessibilitySettings();
    setStatusMessage(opened ? 'Opened macOS Accessibility settings.' : 'Failed to open Accessibility settings.');
    setIsBusy(false);
  };

  return (
    <div className="settings-container">
      <Tabs.Root className="TabsRoot" defaultValue="speech" orientation="vertical">
        <Tabs.List className="TabsList" aria-label="Settings tabs">
          <div style={{ padding: '20px', paddingBottom: '10px' }}>
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
          <Tabs.Trigger className="TabsTrigger" value="text-assist">
            <Keyboard size={16} style={{ marginRight: 8 }} />
            Text Assist
          </Tabs.Trigger>
        </Tabs.List>

        <div className="TabsContentWrapper">
          <div className="TabsContentScroll">
            <Tabs.Content className="TabsContent" value="speech">
              <h3>Speech Recognition</h3>
              <p className="description">
                One Aliyun DashScope key is shared by speech recognition, translation, and Text Assist.
              </p>

              <div className="input-group">
                <label htmlFor="aliyun-api-key">Aliyun DashScope API Key</label>
                <input
                  id="aliyun-api-key"
                  type="text"
                  value={aliyunApiKey}
                  onChange={(event) => setAliyunApiKey(event.target.value)}
                  placeholder="sk-..."
                />
                <button
                  type="button"
                  className="api-key-link"
                  onClick={() => void window.appApi.windowControl.openAliyunApiKeyPage()}
                >
                  Get an Aliyun API key
                  <ExternalLink size={14} />
                </button>
              </div>

              <div className="actions">
                <button onClick={saveSpeechSettings} className="save-button" disabled={isBusy}>
                  Save Aliyun Key
                </button>
              </div>
            </Tabs.Content>

            <Tabs.Content className="TabsContent" value="translation">
              <h3>Translation Service</h3>
              <p className="description">Tongyi Qwen uses the Aliyun key saved under Speech.</p>

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

            <Tabs.Content className="TabsContent" value="text-assist">
              <h3>Text Assist</h3>
              <p className="description">Global shortcut to translate selected text in focused inputs.</p>

              <div className="input-group">
                <label>Enable Text Assist</label>
                <select
                  value={textAssistEnabled ? 'enabled' : 'disabled'}
                  onChange={(event) => setTextAssistEnabled(event.target.value === 'enabled')}
                >
                  <option value="enabled">Enabled</option>
                  <option value="disabled">Disabled</option>
                </select>
              </div>

              <div className="input-group">
                <label>Trigger Mode</label>
                <select
                  value={textAssistMode}
                  onChange={(event) => setTextAssistMode(event.target.value as 'triple-space' | 'hotkey')}
                >
                  <option value="hotkey">Hotkey</option>
                  <option value="triple-space">Triple Space (planned)</option>
                </select>
              </div>

              <div className="input-group">
                <label>Debug Logging</label>
                <select
                  value={textAssistDebugLogging ? 'enabled' : 'disabled'}
                  onChange={(event) => setTextAssistDebugLogging(event.target.value === 'enabled')}
                >
                  <option value="enabled">Enabled</option>
                  <option value="disabled">Disabled</option>
                </select>
              </div>

              <div className="input-group">
                <label>Hotkey</label>
                <input
                  type="text"
                  value={textAssistHotkey}
                  onChange={(event) => setTextAssistHotkey(event.target.value)}
                  placeholder="CommandOrControl+Shift+L"
                />
              </div>

              <div className="input-group">
                <label>Triple Space Window (ms)</label>
                <input
                  type="number"
                  min={200}
                  max={2000}
                  step={50}
                  value={textAssistTripleSpaceWindowMs}
                  onChange={(event) => setTextAssistTripleSpaceWindowMs(Number(event.target.value))}
                />
              </div>

              <div className="input-group">
                <label>Status</label>
                <div className="provider-status">
                  Mode: {textAssistStatus?.mode ?? textAssistMode} | Registered:
                  {' '}
                  {textAssistStatus?.hotkeyRegistered ? 'Yes' : 'No'}
                  {' '}
                  {textAssistStatus?.activeHotkey ? `(${textAssistStatus.activeHotkey})` : ''}
                  {textAssistStatus?.lastError ? ` | Error: ${textAssistStatus.lastError}` : ''}
                </div>
              </div>

              <div className="provider-actions">
                <button onClick={saveTextAssistSettings} className="save-button" disabled={isBusy}>
                  Save Text Assist Settings
                </button>
                <button onClick={runTextAssistTest} className="clear-button" disabled={isBusy}>
                  Test Replace Once
                </button>
                <button onClick={openAccessibilitySettings} className="clear-button" disabled={isBusy}>
                  Open Accessibility
                </button>
              </div>
            </Tabs.Content>

            {statusMessage && <div className="save-status">{statusMessage}</div>}
          </div>
        </div>
      </Tabs.Root>
      <button onClick={() => navigate('/')} className="settings-back-fab" title="Back">
        <ArrowLeft size={18} />
      </button>
    </div>
  );
};

export default Settings;
