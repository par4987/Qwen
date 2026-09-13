import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { Key, Cloud, Settings2, CheckCircle, XCircle } from 'lucide-react';

export function SettingsPanel() {
  const { state, updateAIProvider } = useApp();
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({});
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});

  const handleSaveKey = (providerId: string) => {
    const key = apiKeys[providerId];
    if (key) {
      updateAIProvider(providerId, { apiKey: key, enabled: true });
    }
  };

  const toggleProvider = (providerId: string, enabled: boolean) => {
    updateAIProvider(providerId, { enabled });
  };

  const toggleKeyVisibility = (providerId: string) => {
    setShowKeys(prev => ({ ...prev, [providerId]: !prev[providerId] }));
  };

  return (
    <div className="settings-panel">
      <div className="panel-header">
        <Settings2 size={20} />
        <h3>Settings</h3>
      </div>

      <section className="settings-section">
        <h4>
          <Cloud size={18} />
          AI Provider Configuration
        </h4>
        <p className="section-description">
          Configure API keys for cloud-based AI services. Your keys are stored locally and never sent to our servers.
        </p>

        <div className="provider-list">
          {state.aiProviders.map((provider) => {
            const hasKey = !!provider.apiKey || !!apiKeys[provider.id];
            const isExpanded = showKeys[provider.id];

            return (
              <div key={provider.id} className={`provider-item ${provider.enabled ? 'enabled' : ''}`}>
                <div className="provider-header">
                  <div className="provider-info">
                    <span className="provider-name">{provider.name}</span>
                    {hasKey && provider.enabled ? (
                      <CheckCircle size={16} className="status-icon success" />
                    ) : hasKey ? (
                      <CheckCircle size={16} className="status-icon" />
                    ) : (
                      <XCircle size={16} className="status-icon error" />
                    )}
                  </div>
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={provider.enabled}
                      onChange={(e) => toggleProvider(provider.id, e.target.checked)}
                      disabled={!hasKey}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </div>

                <div className="provider-config">
                  <div className="api-key-input">
                    <label>API Key</label>
                    <div className="input-with-toggle">
                      <input
                        type={isExpanded ? 'text' : 'password'}
                        value={apiKeys[provider.id] || ''}
                        onChange={(e) => setApiKeys(prev => ({ ...prev, [provider.id]: e.target.value }))}
                        placeholder="Enter your API key"
                      />
                      <button
                        type="button"
                        onClick={() => toggleKeyVisibility(provider.id)}
                        className="toggle-visibility"
                      >
                        {isExpanded ? '👁️' : '🔒'}
                      </button>
                    </div>
                  </div>
                  
                  <button
                    onClick={() => handleSaveKey(provider.id)}
                    className="save-key-btn"
                    disabled={!apiKeys[provider.id]}
                  >
                    Save Key
                  </button>

                  {provider.model && (
                    <div className="model-info">
                      <small>Model: {provider.model}</small>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="settings-section">
        <h4>
          <Key size={18} />
          Getting API Keys
        </h4>
        <div className="api-links">
          <div className="api-link-item">
            <strong>OpenAI:</strong>
            <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer">
              Get your API key
            </a>
            <span>~$0.01-0.03 per image</span>
          </div>
          <div className="api-link-item">
            <strong>Claude (Anthropic):</strong>
            <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer">
              Get your API key
            </a>
            <span>~$0.015-0.075 per image</span>
          </div>
          <div className="api-link-item">
            <strong>Replicate (SAM/SDXL):</strong>
            <a href="https://replicate.com/account/api-tokens" target="_blank" rel="noopener noreferrer">
              Get your API token
            </a>
            <span>~$0.002-0.02 per operation</span>
          </div>
        </div>
      </section>

      <section className="settings-section">
        <h4>About</h4>
        <div className="about-info">
          <p><strong>AI Photo Editor</strong> v0.1.0</p>
          <p>A local-first photo editing application with AI-powered enhancements.</p>
          <p>Your photos stay on your computer. Only images that require AI processing are temporarily sent to cloud services.</p>
        </div>
      </section>
    </div>
  );
}
