import { ChatMessage, Adjustment, Mask, TagSuggestion, LocationSuggestion } from '../types';

export interface AIRequest {
  message: string;
  image?: Blob | File;
  provider: string;
}

export interface AIResponse {
  text: string;
  adjustments?: Adjustment[];
  masks?: Mask[];
  tags?: TagSuggestion[];
  locations?: LocationSuggestion[];
}

class AIServiceClass {
  private apiKeys: Record<string, string> = {};

  setApiKey(provider: string, key: string) {
    this.apiKeys[provider] = key;
  }

  async sendMessage(request: AIRequest): Promise<AIResponse> {
    const { message, image, provider } = request;

    switch (provider.toLowerCase()) {
      case 'openai':
        return this.sendToOpenAI(message, image);
      case 'claude':
        return this.sendToClaude(message, image);
      case 'deepseek':
        return this.sendToDeepSeek(message, image);
      case 'qwen':
        return this.sendToQwen(message, image);
      case 'kimi':
        return this.sendToKimi(message, image);
      default:
        throw new Error(`Unknown AI provider: ${provider}`);
    }
  }

  private async sendToOpenAI(message: string, image?: Blob | File): Promise<AIResponse> {
    const apiKey = this.apiKeys['openai'] || import.meta.env.VITE_OPENAI_API_KEY;
    
    if (!apiKey) {
      throw new Error('OpenAI API key not configured');
    }

    // Prepare the request for GPT-4 Vision
    const content: any[] = [{ type: 'text', text: message }];
    
    if (image) {
      const base64 = await this.blobToBase64(image);
      content.push({
        type: 'image_url',
        image_url: { url: base64 }
      });
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4-vision-preview',
        messages: [
          {
            role: 'system',
            content: `You are a professional photo editing assistant. Analyze the image and provide editing suggestions.
            
When the user requests edits, respond with specific adjustments in this format:
ADJUSTMENTS: {adjustment_type: value, ...}
MASKS: {mask_type: "name", ...}
TAGS: [tag1, tag2, ...]

Available adjustments: exposure, contrast, highlights, shadows, whites, blacks, temperature, tint, vibrance, saturation, clarity, dehaze, sharpness, noiseReduction
Available masks: person, animal, plant, sky, background, landscape, subject

Keep your responses helpful and concise.`
          },
          {
            role: 'user',
            content
          }
        ],
        max_tokens: 1000,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'OpenAI request failed');
    }

    const data = await response.json();
    const responseText = data.choices[0].message.content;

    return this.parseAIResponse(responseText);
  }

  private async sendToClaude(message: string, image?: Blob | File): Promise<AIResponse> {
    const apiKey = this.apiKeys['claude'] || import.meta.env.VITE_CLAUDE_API_KEY;
    
    if (!apiKey) {
      throw new Error('Claude API key not configured');
    }

    const content: any[] = [{ type: 'text', text: message }];
    
    if (image) {
      const base64 = await this.blobToBase64(image);
      const mimeType = image.type || 'image/jpeg';
      content.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: mimeType,
          data: base64.split(',')[1] // Remove data:image/...;base64, prefix
        }
      });
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-3-opus-20240229',
        max_tokens: 1000,
        system: `You are a professional photo editing assistant. Analyze the image and provide editing suggestions.

When the user requests edits, respond with specific adjustments in this format:
ADJUSTMENTS: {adjustment_type: value, ...}
MASKS: {mask_type: "name", ...}
TAGS: [tag1, tag2, ...]

Available adjustments: exposure, contrast, highlights, shadows, whites, blacks, temperature, tint, vibrance, saturation, clarity, dehaze, sharpness, noiseReduction
Available masks: person, animal, plant, sky, background, landscape, subject

Keep your responses helpful and concise.`,
        messages: [
          {
            role: 'user',
            content
          }
        ],
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Claude request failed');
    }

    const data = await response.json();
    const responseText = data.content[0].text;

    return this.parseAIResponse(responseText);
  }

  private async sendToDeepSeek(message: string, image?: Blob | File): Promise<AIResponse> {
    // DeepSeek implementation - similar to OpenAI
    const apiKey = this.apiKeys['deepseek'] || import.meta.env.VITE_DEEPSEEK_API_KEY;
    
    if (!apiKey) {
      throw new Error('DeepSeek API key not configured');
    }

    // For now, send text-only request (DeepSeek may not support vision yet)
    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          {
            role: 'system',
            content: 'You are a professional photo editing assistant.'
          },
          {
            role: 'user',
            content: message + (image ? ' [Image provided but not analyzed in this version]' : '')
          }
        ],
      }),
    });

    if (!response.ok) {
      throw new Error('DeepSeek request failed');
    }

    const data = await response.json();
    const responseText = data.choices[0].message.content;

    return this.parseAIResponse(responseText);
  }

  private async sendToQwen(message: string, image?: Blob | File): Promise<AIResponse> {
    // Qwen implementation via DashScope or other provider
    const apiKey = this.apiKeys['qwen'] || import.meta.env.VITE_QWEN_API_KEY;
    
    if (!apiKey) {
      throw new Error('Qwen API key not configured');
    }

    // Placeholder - implement based on actual Qwen API
    console.log('Qwen request:', message);
    
    return {
      text: 'Qwen integration coming soon. Please use OpenAI or Claude for now.',
      adjustments: [],
      masks: [],
      tags: [],
      locations: []
    };
  }

  private async sendToKimi(message: string, image?: Blob | File): Promise<AIResponse> {
    // Kimi implementation
    const apiKey = this.apiKeys['kimi'] || import.meta.env.VITE_KIMI_API_KEY;
    
    if (!apiKey) {
      throw new Error('Kimi API key not configured');
    }

    // Placeholder - implement based on actual Kimi API
    console.log('Kimi request:', message);
    
    return {
      text: 'Kimi integration coming soon. Please use OpenAI or Claude for now.',
      adjustments: [],
      masks: [],
      tags: [],
      locations: []
    };
  }

  private parseAIResponse(text: string): AIResponse {
    const response: AIResponse = {
      text,
      adjustments: [],
      masks: [],
      tags: [],
      locations: []
    };

    // Parse ADJUSTMENTS section
    const adjustmentsMatch = text.match(/ADJUSTMENTS:\s*({[^}]+})/i);
    if (adjustmentsMatch) {
      try {
        const adjustmentsObj = JSON.parse(adjustmentsMatch[1]);
        response.adjustments = Object.entries(adjustmentsObj).map(([type, value]) => ({
          id: type,
          type: type as any,
          value: Number(value),
          enabled: true
        }));
      } catch (e) {
        console.error('Failed to parse adjustments:', e);
      }
    }

    // Parse MASKS section
    const masksMatch = text.match(/MASKS:\s*({[^}]+})/i);
    if (masksMatch) {
      try {
        const masksObj = JSON.parse(masksMatch[1]);
        response.masks = Object.entries(masksObj).map(([type, name], index) => ({
          id: `mask_${Date.now()}_${index}`,
          type: type as any,
          name: String(name),
          data: null,
          enabled: true,
          color: this.getRandomColor()
        }));
      } catch (e) {
        console.error('Failed to parse masks:', e);
      }
    }

    // Parse TAGS section
    const tagsMatch = text.match(/TAGS:\s*\[([^\]]+)\]/i);
    if (tagsMatch) {
      try {
        const tagsArr = JSON.parse(`[${tagsMatch[1]}]`);
        response.tags = tagsArr.map((tag: string) => ({
          tag,
          confidence: 0.9,
          category: 'object' as const
        }));
      } catch (e) {
        console.error('Failed to parse tags:', e);
      }
    }

    return response;
  }

  private getRandomColor(): string {
    const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8'];
    return colors[Math.floor(Math.random() * colors.length)];
  }

  private async blobToBase64(blob: Blob | File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  async generateTags(image: Blob | File, provider: string): Promise<TagSuggestion[]> {
    const response = await this.sendMessage({
      message: 'Analyze this image and suggest relevant tags for organization. Return only a JSON array of tags.',
      image,
      provider
    });
    
    return response.tags || [];
  }

  async detectLocation(image: Blob | File, provider: string, gpsData?: { lat: number; lng: number }): Promise<LocationSuggestion | null> {
    if (gpsData) {
      // Use reverse geocoding
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${gpsData.lat}&lon=${gpsData.lng}`
      );
      
      if (response.ok) {
        const data = await response.json();
        return {
          name: data.display_name || 'Unknown location',
          latitude: gpsData.lat,
          longitude: gpsData.lng,
          confidence: 1.0,
          source: 'exif'
        };
      }
    }

    // Fall back to visual recognition
    const aiResponse = await this.sendMessage({
      message: 'Based on visual elements in this image, suggest a possible location (city, landmark, or region). Return JSON with name, latitude, longitude, and confidence.',
      image,
      provider
    });

    // Parse location from AI response
    return null;
  }
}

export const AIService = new AIServiceClass();
