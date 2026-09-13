import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { AIService } from '../services/AIService';
import { Send, Bot, User, Loader2, Sparkles } from 'lucide-react';
import { ChatMessage as ChatMessageType } from '../types';

export function AIChat() {
  const { state, addChatMessage, updateAdjustment, addMask, setProcessing } = useApp();
  const [inputValue, setInputValue] = useState('');
  const [selectedProvider, setSelectedProvider] = useState('openai');
  const messagesEndRef = React.useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  React.useEffect(() => {
    scrollToBottom();
  }, [state.chatMessages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!inputValue.trim() || !state.currentImage) return;

    const userMessage: ChatMessageType = {
      id: `msg_${Date.now()}`,
      role: 'user',
      content: inputValue.trim(),
      timestamp: new Date(),
    };

    addChatMessage(userMessage);
    setInputValue('');
    setProcessing(true);

    try {
      // Get the enabled AI provider
      const provider = state.aiProviders.find(p => p.enabled) || state.aiProviders.find(p => p.id === selectedProvider);
      
      if (!provider) {
        throw new Error('No AI provider selected. Please enable one in settings.');
      }

      // Send to AI service
      const response = await AIService.sendMessage({
        message: inputValue.trim(),
        image: state.currentImage.file,
        provider: provider.id,
      });

      // Apply adjustments if any
      if (response.adjustments && response.adjustments.length > 0) {
        response.adjustments.forEach(adj => {
          updateAdjustment(adj.id, adj.value as number);
        });
      }

      // Add masks if any
      if (response.masks && response.masks.length > 0) {
        response.masks.forEach(mask => {
          addMask(mask);
        });
      }

      // Add AI response to chat
      const aiMessage: ChatMessageType = {
        id: `msg_${Date.now()}_ai`,
        role: 'assistant',
        content: response.text,
        timestamp: new Date(),
        relatedAdjustments: response.adjustments,
        relatedMasks: response.masks,
      };

      addChatMessage(aiMessage);

    } catch (error) {
      console.error('AI request failed:', error);
      
      const errorMessage: ChatMessageType = {
        id: `msg_${Date.now()}_error`,
        role: 'system',
        content: `Error: ${(error as Error).message}. Please check your API key configuration.`,
        timestamp: new Date(),
      };
      
      addChatMessage(errorMessage);
    } finally {
      setProcessing(false);
    }
  };

  const quickActions = [
    "Enhance this photo",
    "Remove background distractions",
    "Make colors more vibrant",
    "Fix lighting issues",
    "Suggest tags for organization",
  ];

  return (
    <div className="ai-chat">
      <div className="chat-header">
        <Bot size={24} />
        <h3>AI Editing Assistant</h3>
        <select 
          value={selectedProvider} 
          onChange={(e) => setSelectedProvider(e.target.value)}
          className="provider-select"
        >
          {state.aiProviders.map(provider => (
            <option key={provider.id} value={provider.id}>
              {provider.name}
            </option>
          ))}
        </select>
      </div>

      <div className="chat-messages">
        {state.chatMessages.length === 0 && (
          <div className="welcome-message">
            <Sparkles size={48} />
            <h4>Welcome to AI-Powered Editing!</h4>
            <p>Ask me to edit your photos using natural language.</p>
            <p>Try these examples:</p>
            <div className="quick-actions">
              {quickActions.map((action, index) => (
                <button
                  key={index}
                  onClick={() => setInputValue(action)}
                  className="quick-action-btn"
                >
                  {action}
                </button>
              ))}
            </div>
          </div>
        )}

        {state.chatMessages.map((message) => (
          <div
            key={message.id}
            className={`message ${message.role}`}
          >
            <div className="message-avatar">
              {message.role === 'user' ? (
                <User size={20} />
              ) : message.role === 'assistant' ? (
                <Bot size={20} />
              ) : (
                <AlertCircle size={20} />
              )}
            </div>
            <div className="message-content">
              <p>{message.content}</p>
              {message.relatedAdjustments && message.relatedAdjustments.length > 0 && (
                <div className="applied-adjustments">
                  <small>Applied adjustments:</small>
                  <ul>
                    {message.relatedAdjustments.map(adj => (
                      <li key={adj.id}>{adj.type}: {String(adj.value)}</li>
                    ))}
                  </ul>
                </div>
              )}
              <span className="timestamp">
                {message.timestamp.toLocaleTimeString()}
              </span>
            </div>
          </div>
        ))}

        {state.isProcessing && (
          <div className="message assistant processing">
            <div className="message-avatar">
              <Bot size={20} />
            </div>
            <div className="message-content">
              <Loader2 className="spinner" size={20} />
              <p>Analyzing your request...</p>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSubmit} className="chat-input-form">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="Describe the edits you want..."
          disabled={!state.currentImage || state.isProcessing}
        />
        <button 
          type="submit" 
          disabled={!inputValue.trim() || !state.currentImage || state.isProcessing}
        >
          <Send size={20} />
        </button>
      </form>

      <div className="chat-footer">
        <p>
          <small>
            Powered by AI. Results may vary. Always review changes before exporting.
          </small>
        </p>
      </div>
    </div>
  );
}

// Import AlertCircle for error messages
import { AlertCircle } from 'lucide-react';
