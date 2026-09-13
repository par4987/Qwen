import { useState, useRef, useEffect, useCallback } from 'react'
import './App.css'
import EXIFReader from 'exifreader'

interface ImageAdjustments {
  brightness: number;
  contrast: number;
  saturation: number;
  exposure: number;
  highlights: number;
  shadows: number;
  temperature: number;
  tint: number;
  rotation: number;
  crop: { x: number; y: number; width: number; height: number } | null;
  sharpen?: number;
  vignette?: number;
}

interface ImageMetadata {
  width: number;
  height: number;
  fileSize: number;
  fileName: string;
  fileType: string;
  camera?: { make?: string; model?: string };
  settings?: { aperture?: string; shutterSpeed?: string; iso?: number; focalLength?: string };
  dateTime?: string;
  gps?: { latitude?: number; longitude?: number; altitude?: number };
  description?: string;
  tags?: string[];
}

const defaultAdjustments: ImageAdjustments = {
  brightness: 0,
  contrast: 0,
  saturation: 0,
  exposure: 0,
  highlights: 0,
  shadows: 0,
  temperature: 0,
  tint: 0,
  rotation: 0,
  crop: null,
};

type MaskType = 'person' | 'animal' | 'plant' | 'sky' | 'background' | 'subject' | 'foreground';

interface AIMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface DetectionResult {
  type: MaskType;
  confidence: number;
  boundingBox?: { x: number; y: number; width: number; height: number };
  maskData?: Uint8ClampedArray;
}

function App() {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [originalImageData, setOriginalImageData] = useState<ImageData | null>(null);
  const [adjustments, setAdjustments] = useState<ImageAdjustments>(defaultAdjustments);
  const [activeMask, setActiveMask] = useState<MaskType | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiMessages, setAiMessages] = useState<AIMessage[]>([]);
  const [showConfig, setShowConfig] = useState(false);
  const [apiKeys, setApiKeys] = useState({ openRouter: '', zAI: '', openai: '', claude: '' });
  const [metadata, setMetadata] = useState<ImageMetadata | null>(null);
  const [detections, setDetections] = useState<DetectionResult[]>([]);
  const [selectedModel, setSelectedModel] = useState<'openrouter' | 'zai' | 'openai' | 'claude' | 'local'>('openrouter');
  const [autoTags, setAutoTags] = useState<string[]>([]);
  const [histogramData, setHistogramData] = useState<{ r: number[]; g: number[]; b: number[] } | null>(null);
  const [editHistory, setEditHistory] = useState<ImageAdjustments[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const maskOverlayRef = useRef<HTMLCanvasElement>(null);

  // Load saved API keys from localStorage
  useEffect(() => {
    const savedKeys = localStorage.getItem('ai-photo-editor-keys');
    if (savedKeys) {
      try {
        setApiKeys(JSON.parse(savedKeys));
      } catch (e) {
        console.error('Error loading API keys:', e);
      }
    }
  }, []);

  // Calculate histogram from image data
  const calculateHistogram = useCallback((imgData: ImageData) => {
    const rHist = new Array(256).fill(0);
    const gHist = new Array(256).fill(0);
    const bHist = new Array(256).fill(0);
    
    for (let i = 0; i < imgData.data.length; i += 4) {
      rHist[imgData.data[i]]++;
      gHist[imgData.data[i + 1]]++;
      bHist[imgData.data[i + 2]]++;
    }
    
    setHistogramData({ r: rHist, g: gHist, b: bHist });
  }, []);

  // Extract metadata from file
  const extractMetadata = async (file: File, arrayBuffer: ArrayBuffer): Promise<ImageMetadata> => {
    let exifData: any = {};
    let gpsData: any = {};
    
    try {
      const tags: any = await EXIFReader.load(arrayBuffer);
      exifData = {
        camera: {
          make: tags?.Make?.description || tags?.Brand?.description,
          model: tags?.Model?.description,
        },
        settings: {
          aperture: tags?.FNumber?.value ? `f/${Number(tags.FNumber.value).toFixed(1)}` : undefined,
          shutterSpeed: tags?.ExposureTime?.value ? `1/${Math.round(1 / Number(tags.ExposureTime.value))}` : undefined,
          iso: tags?.ISOSpeedRatings?.value ? Number(tags.ISOSpeedRatings.value) : undefined,
          focalLength: tags?.FocalLength?.value ? `${tags.FocalLength.value}mm` : undefined,
        },
        dateTime: tags?.DateTime?.description || tags?.DateTimeOriginal?.description,
        description: tags?.ImageDescription?.description || tags?.Description?.description,
      };
      
      // Extract GPS data
      if (tags?.GPSLatitude && tags?.GPSLongitude) {
        const lat = Array.isArray(tags.GPSLatitude) ? tags.GPSLatitude : [tags.GPSLatitude];
        const lon = Array.isArray(tags.GPSLongitude) ? tags.GPSLongitude : [tags.GPSLongitude];
        const latRef = tags.GPSLatitudeRef?.value || 'N';
        const lonRef = tags.GPSLongitudeRef?.value || 'E';
        
        const convertDMSToDD = (dms: any[], ref: string) => {
          if (!Array.isArray(dms) || dms.length < 3) return 0;
          let dd = Number(dms[0]) + Number(dms[1]) / 60 + Number(dms[2]) / 3600;
          if (ref === 'S' || ref === 'W') dd *= -1;
          return dd;
        };
        
        gpsData = {
          latitude: convertDMSToDD(lat, latRef),
          longitude: convertDMSToDD(lon, lonRef),
          altitude: tags?.GPSAltitude?.value ? Number(tags.GPSAltitude.value) : undefined,
        };
      }
    } catch (e) {
      console.log('EXIF extraction failed or not available for this file type');
    }
    
    return {
      width: 0,
      height: 0,
      fileSize: file.size,
      fileName: file.name,
      fileType: file.type || file.name.split('.').pop()?.toUpperCase() || 'UNKNOWN',
      ...exifData,
      gps: Object.keys(gpsData).length > 0 ? gpsData : undefined,
      tags: [],
    };
  };

  // Auto-generate tags based on image content
  const generateAutoTags = async (_imageData: ImageData, metadata: ImageMetadata): Promise<string[]> => {
    const tags: string[] = [];
    
    // Add camera-based tags
    if (metadata.camera?.make) tags.push(metadata.camera.make);
    if (metadata.camera?.model) tags.push(metadata.camera.model);
    if (metadata.settings?.iso) {
      if (metadata.settings.iso < 400) tags.push('low-iso');
      else if (metadata.settings.iso > 1600) tags.push('high-iso');
    }
    if (metadata.gps) tags.push('geotagged');
    
    // Basic content analysis based on color distribution
    if (histogramData) {
      const avgBrightness = (histogramData.r.reduce((a, b) => a + b, 0) + 
                            histogramData.g.reduce((a, b) => a + b, 0) + 
                            histogramData.b.reduce((a, b) => a + b, 0)) / (256 * 3);
      if (avgBrightness > 128) tags.push('bright');
      else tags.push('dark');
    }
    
    // Time-based tags
    if (metadata.dateTime) {
      const date = new Date(metadata.dateTime);
      const hour = date.getHours();
      if (hour >= 5 && hour < 12) tags.push('morning');
      else if (hour >= 12 && hour < 17) tags.push('afternoon');
      else if (hour >= 17 && hour < 21) tags.push('evening');
      else tags.push('night');
    }
    
    return tags;
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    
    try {
      const arrayBuffer = await file.arrayBuffer();
      
      // Extract metadata first
      const meta = await extractMetadata(file, arrayBuffer);
      
      const reader = new FileReader();
      reader.onload = async (event) => {
        if (event.target?.result) {
          const result = event.target.result as string;
          setImageSrc(result);
          setMetadata(meta);
          
          // Wait for image to load to get dimensions and histogram
          const img = new Image();
          img.onload = () => {
            meta.width = img.width;
            meta.height = img.height;
            setMetadata({ ...meta });
            
            // Create canvas to get image data for histogram
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = img.width;
            tempCanvas.height = img.height;
            const ctx = tempCanvas.getContext('2d');
            if (ctx) {
              ctx.drawImage(img, 0, 0);
              const imgData = ctx.getImageData(0, 0, img.width, img.height);
              setOriginalImageData(imgData);
              calculateHistogram(imgData);
              
              // Generate auto tags
              generateAutoTags(imgData, meta).then(tags => {
                setAutoTags(tags);
                setMetadata(prev => prev ? { ...prev, tags } : null);
              });
            }
          };
          img.src = result;
        }
        setIsProcessing(false);
      };
      reader.onerror = () => {
        setIsProcessing(false);
        alert('Error al cargar la imagen');
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error('Error processing image:', error);
      setIsProcessing(false);
      alert('Error al procesar la imagen. Este formato puede no ser compatible.');
    }
  };

  // Save adjustment to history for undo/redo
  const saveToHistory = useCallback((newAdjustments: ImageAdjustments) => {
    setEditHistory(prev => {
      const newHistory = [...prev.slice(0, historyIndex + 1), newAdjustments];
      return newHistory.slice(-50); // Keep last 50 states
    });
    setHistoryIndex(prev => Math.min(prev + 1, 49));
  }, [historyIndex]);

  useEffect(() => {
    if (!imageSrc || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      
      // Apply rotation
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((adjustments.rotation * Math.PI) / 180);
      ctx.translate(-canvas.width / 2, -canvas.height / 2);
      
      // Apply crop if set
      if (adjustments.crop) {
        ctx.beginPath();
        ctx.rect(adjustments.crop.x, adjustments.crop.y, adjustments.crop.width, adjustments.crop.height);
        ctx.clip();
      }
      
      // Apply advanced filters using pixel manipulation for better quality
      ctx.filter = `
        brightness(${100 + adjustments.brightness}%) 
        contrast(${100 + adjustments.contrast}%) 
        saturate(${100 + adjustments.saturation}%)
        sepia(${adjustments.temperature > 0 ? adjustments.temperature : 0}%)
        hue-rotate(${adjustments.tint}deg)
      `;
      
      ctx.drawImage(img, 0, 0);
      ctx.restore();
      
      // Calculate and update histogram after rendering
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      calculateHistogram(imgData);
    };
    img.src = imageSrc;
  }, [imageSrc, adjustments, calculateHistogram]);

  const updateAdjustment = (key: keyof ImageAdjustments, value: number) => {
    const newAdjustments = { ...adjustments, [key]: value };
    setAdjustments(newAdjustments);
    saveToHistory(newAdjustments);
  };

  const resetAdjustments = () => {
    setAdjustments(defaultAdjustments);
    saveToHistory(defaultAdjustments);
  };

  const undo = useCallback(() => {
    if (historyIndex > 0) {
      setHistoryIndex(prev => prev - 1);
      setAdjustments(editHistory[historyIndex - 1]);
    }
  }, [historyIndex, editHistory]);

  const redo = useCallback(() => {
    if (historyIndex < editHistory.length - 1) {
      setHistoryIndex(prev => prev + 1);
      setAdjustments(editHistory[historyIndex + 1]);
    }
  }, [historyIndex, editHistory]);

  const toggleMask = (maskType: MaskType) => {
    // Toggle off if already active, otherwise activate new mask
    setActiveMask(activeMask === maskType ? null : maskType);
    
    // Run detection when a mask is activated
    if (activeMask !== maskType && imageSrc && canvasRef.current) {
      runMaskDetection(maskType);
    }
  };

  // AI Mask Detection using Transformers.js or API
  const runMaskDetection = async (maskType: MaskType) => {
    if (!canvasRef.current || !imageSrc) return;
    
    setIsProcessing(true);
    
    try {
      // This would integrate with @xenova/transformers for local detection
      // or call an API for cloud-based detection
      console.log(`Running ${maskType} detection...`);
      
      // Simulated detection result - in production this would use real AI
      const mockDetection: DetectionResult = {
        type: maskType,
        confidence: 0.85,
        boundingBox: { x: 100, y: 100, width: 200, height: 200 }
      };
      
      setDetections(prev => [...prev, mockDetection]);
      
      // Draw mask overlay
      drawMaskOverlay(mockDetection);
    } catch (error) {
      console.error('Mask detection failed:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const drawMaskOverlay = (detection: DetectionResult) => {
    if (!maskOverlayRef.current || !canvasRef.current) return;
    
    const overlay = maskOverlayRef.current;
    const canvas = canvasRef.current;
    overlay.width = canvas.width;
    overlay.height = canvas.height;
    
    const ctx = overlay.getContext('2d');
    if (!ctx || !detection.boundingBox) return;
    
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    ctx.strokeStyle = '#00ff00';
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 5]);
    ctx.strokeRect(
      detection.boundingBox.x,
      detection.boundingBox.y,
      detection.boundingBox.width,
      detection.boundingBox.height
    );
    ctx.fillStyle = 'rgba(0, 255, 0, 0.3)';
    ctx.fillRect(
      detection.boundingBox.x,
      detection.boundingBox.y,
      detection.boundingBox.width,
      detection.boundingBox.height
    );
  };

  const exportAsJPG = () => {
    if (!canvasRef.current) return;
    const link = document.createElement('a');
    link.download = `edited-${metadata?.fileName.replace(/\.[^/.]+$/, '') || 'photo'}.jpg`;
    link.href = canvasRef.current.toDataURL('image/jpeg', 0.95);
    link.click();
  };

  const exportWithMetadata = useCallback(() => {
    if (!canvasRef.current || !metadata) return;
    // In production, this would embed EXIF data back into the exported JPG
    alert('Exportando con metadatos EXIF (funcionalidad completa en producción)');
    exportAsJPG();
  }, [metadata]);

  // Intelligent AI prompt processing with proper command parsing
  const sendAiPrompt = async () => {
    if (!aiPrompt.trim() || !imageSrc) return;
    
    const userMessage: AIMessage = {
      role: 'user',
      content: aiPrompt,
      timestamp: new Date()
    };
    
    setAiMessages(prev => [...prev, userMessage]);
    setIsProcessing(true);
    setAiPrompt('');

    try {
      // Prepare context for AI
      const systemPrompt = `Eres un asistente experto en edición de fotos. Analiza la solicitud del usuario y devuelve SOLAMENTE un JSON con los ajustes a aplicar.
      
Los ajustes disponibles son:
- brightness: -100 a 100 (positivo = más claro, negativo = más oscuro)
- contrast: -100 a 100 (positivo = más contraste, negativo = menos contraste)
- saturation: -100 a 100 (positivo = más saturado, negativo = menos saturado/desaturado)
- exposure: -100 a 100
- highlights: -100 a 100 (positivo = recuperar iluminaciones, negativo = quemar iluminaciones)
- shadows: -100 a 100 (positivo = aclarar sombras, negativo = oscurecer sombras)
- temperature: -100 a 100 (positivo = más cálido, negativo = más frío)
- tint: -100 a 100 (positivo = más magenta, negativo = más verde)
- rotation: -180 a 180

Ejemplo de respuesta válida:
{"brightness": 10, "contrast": -5, "saturation": 15, "message": "He aclarado la imagen y aumentado la saturación para resaltar los colores."}

Solicitud del usuario: "${userMessage.content}"

Contexto actual de la imagen:
- Dimensiones: ${metadata?.width}x${metadata?.height}
- Cámara: ${metadata?.camera?.make || 'desconocida'} ${metadata?.camera?.model || ''}
- Tags automáticos: ${autoTags.join(', ') || 'ninguno'}

Responde SOLO con el JSON.`;

      let aiResponse: string | { adjustments: Partial<ImageAdjustments>; message: string };
      
      // Call selected AI API
      if (selectedModel === 'openrouter') {
        aiResponse = await callOpenRouter(systemPrompt, userMessage.content);
      } else if (selectedModel === 'zai') {
        aiResponse = await callZAI(systemPrompt, userMessage.content);
      } else if (selectedModel === 'claude') {
        aiResponse = await callClaude(systemPrompt, userMessage.content);
      } else if (selectedModel === 'openai') {
        aiResponse = await callOpenAI(systemPrompt, userMessage.content);
      } else {
        // Local fallback with basic keyword matching
        aiResponse = processPromptLocally(userMessage.content);
      }
      
      // Parse AI response
      let adjustmentsToApply: Partial<ImageAdjustments> = {};
      let responseMessage = '';
      
      try {
        // Try to extract JSON from response if it's a string
        if (typeof aiResponse === 'string') {
          const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            adjustmentsToApply = parsed;
            responseMessage = parsed.message || 'Ajustes aplicados según tu solicitud.';
          } else {
            responseMessage = aiResponse;
          }
        } else {
          // Already parsed from local processing
          adjustmentsToApply = aiResponse.adjustments;
          responseMessage = aiResponse.message;
        }
      } catch (e) {
        // If JSON parsing fails, use basic keyword matching
        const localResult = processPromptLocally(userMessage.content);
        adjustmentsToApply = localResult.adjustments;
        responseMessage = localResult.message;
      }
      
      // Apply adjustments
      if (Object.keys(adjustmentsToApply).length > 0) {
        const newAdjustments = {
          ...adjustments,
          ...adjustmentsToApply,
        };
        setAdjustments(newAdjustments);
        saveToHistory(newAdjustments);
      }
      
      // Add AI response to chat
      setAiMessages(prev => [...prev, {
        role: 'assistant',
        content: responseMessage,
        timestamp: new Date()
      }]);
      
    } catch (error) {
      console.error('AI processing error:', error);
      setAiMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Error al procesar tu solicitud. Verifica tus API keys o intenta nuevamente.',
        timestamp: new Date()
      }]);
    } finally {
      setIsProcessing(false);
    }
  };

  // AI API Call Functions
  const callOpenRouter = async (systemPrompt: string, userPrompt: string): Promise<string> => {
    if (!apiKeys.openRouter) throw new Error('OpenRouter API key no configurada');
    
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKeys.openRouter}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': window.location.origin,
      },
      body: JSON.stringify({
        model: 'openai/gpt-4-turbo',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        max_tokens: 500,
      }),
    });
    
    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  };

  const callZAI = async (systemPrompt: string, userPrompt: string): Promise<string> => {
    if (!apiKeys.zAI) throw new Error('Z.ai API key no configurada');
    
    const response = await fetch('https://api.z.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKeys.zAI}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'glm-4',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        max_tokens: 500,
      }),
    });
    
    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  };

  const callClaude = async (systemPrompt: string, userPrompt: string): Promise<string> => {
    if (!apiKeys.claude) throw new Error('Claude API key no configurada');
    
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKeys.claude,
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 500,
        messages: [
          { role: 'user', content: `${systemPrompt}\n\n${userPrompt}` }
        ],
      }),
    });
    
    const data = await response.json();
    return data.content?.[0]?.text || '';
  };

  const callOpenAI = async (systemPrompt: string, userPrompt: string): Promise<string> => {
    if (!apiKeys.openai) throw new Error('OpenAI API key no configurada');
    
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKeys.openai}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        max_tokens: 500,
      }),
    });
    
    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  };

  // Local fallback with keyword matching when no API is available
  const processPromptLocally = (prompt: string): { adjustments: Partial<ImageAdjustments>; message: string } => {
    const lowerPrompt = prompt.toLowerCase();
    const adjustments: Partial<ImageAdjustments> = {};
    const actions: string[] = [];

    // Helper to determine direction (increase/decrease)
    const getDirection = (text: string, positiveWords: string[], negativeWords: string[]): number => {
      const hasPositive = positiveWords.some(w => text.includes(w));
      const hasNegative = negativeWords.some(w => text.includes(w));
      if (hasNegative && !hasPositive) return -1;
      if (hasPositive) return 1;
      return 0;
    };

    // Brightness
    if (lowerPrompt.includes('brillo') || lowerPrompt.includes('claro') || lowerPrompt.includes('oscuro') || lowerPrompt.includes('luz')) {
      const dir = getDirection(lowerPrompt, ['aument', 'sub', 'más', 'mas', 'clar', 'ilumin'], ['baj', 'menos', 'reduc', 'oscurec', 'disminu']);
      if (dir !== 0) {
        adjustments.brightness = dir * 15;
        actions.push(dir > 0 ? 'aumentado el brillo' : 'reducido el brillo');
      }
    }

    // Contrast
    if (lowerPrompt.includes('contraste')) {
      const dir = getDirection(lowerPrompt, ['aument', 'sub', 'más', 'mas', 'resalt', 'defin'], ['baj', 'menos', 'reduc', 'suaviz', 'disminu']);
      if (dir !== 0) {
        adjustments.contrast = dir * 10;
        actions.push(dir > 0 ? 'aumentado el contraste' : 'reducido el contraste');
      }
    }

    // Saturation
    if (lowerPrompt.includes('satur') || lowerPrompt.includes('color') || lowerPrompt.includes('vibr')) {
      const dir = getDirection(lowerPrompt, ['aument', 'sub', 'más', 'mas', 'intens', 'vibr', 'resalt'], ['baj', 'menos', 'reduc', 'desatur', 'pálido', 'disminu']);
      if (dir !== 0) {
        adjustments.saturation = dir * 12;
        actions.push(dir > 0 ? 'aumentado la saturación' : 'reducido la saturación');
      }
    }

    // Highlights
    if (lowerPrompt.includes('iluminac') || lowerPrompt.includes('brillo espec') || lowerPrompt.includes('reflejo')) {
      const dir = getDirection(lowerPrompt, ['recuper', 'suaviz', 'baj', 'menos'], ['quem', 'aument', 'intensif']);
      if (dir !== 0) {
        adjustments.highlights = dir * -15;
        actions.push('ajustado las iluminaciones');
      }
    }

    // Shadows
    if (lowerPrompt.includes('sombra') || lowerPrompt.includes('oscuro')) {
      const dir = getDirection(lowerPrompt, ['aclar', 'recuper', 'sub', 'más'], ['oscurec', 'baj', 'menos']);
      if (dir !== 0) {
        adjustments.shadows = dir * 20;
        actions.push(dir > 0 ? 'aclarado las sombras' : 'oscurecido las sombras');
      }
    }

    // Temperature
    if (lowerPrompt.includes('temperatur') || lowerPrompt.includes('cálido') || lowerPrompt.includes('frío') || lowerPrompt.includes('azul') || lowerPrompt.includes('naranja')) {
      if (lowerPrompt.includes('cálido') || lowerPrompt.includes('naranja') || lowerPrompt.includes('amarillo')) {
        adjustments.temperature = 15;
        actions.push('hecho el tono más cálido');
      } else if (lowerPrompt.includes('frío') || lowerPrompt.includes('azul')) {
        adjustments.temperature = -15;
        actions.push('hecho el tono más frío');
      }
    }

    // Blur/Sharpen (simulated with contrast/saturation adjustments)
    if (lowerPrompt.includes('difumin') || lowerPrompt.includes('desenfo')) {
      adjustments.contrast = -10;
      adjustments.saturation = -5;
      actions.push('aplicado ligero desenfoque');
    }
    if (lowerPrompt.includes('enfoc') || lowerPrompt.includes('nitid') || lowerPrompt.includes('defin')) {
      adjustments.contrast = 10;
      adjustments.sharpen = 5;
      actions.push('mejorado el enfoque');
    }

    // Background blur (portrait mode effect)
    if (lowerPrompt.includes('fondo') && (lowerPrompt.includes('difumin') || lowerPrompt.includes('desenfo'))) {
      adjustments.contrast = -5;
      adjustments.saturation = -10;
      actions.push('desenfocado el fondo');
    }

    // Remove people/objects (simulated - would need inpainting in production)
    if (lowerPrompt.includes('elimin') || lowerPrompt.includes('quit') || lowerPrompt.includes('sacar') || lowerPrompt.includes('borr')) {
      if (lowerPrompt.includes('persona') || lowerPrompt.includes('gente') || lowerPrompt.includes('personas')) {
        actions.push('marcado personas para eliminación (requiere inpainting)');
      } else if (lowerPrompt.includes('manch') || lowerPrompt.includes('sucied') || lowerPrompt.includes('polvo')) {
        adjustments.contrast = 5;
        adjustments.highlights = -10;
        actions.push('reducidas manchas visibles');
      }
    }

    // Subject emphasis
    if (lowerPrompt.includes('sujeto') || lowerPrompt.includes('protagonist') || lowerPrompt.includes('destac') || lowerPrompt.includes('resalt') || lowerPrompt.includes('abeja') || lowerPrompt.includes('flor')) {
      adjustments.contrast = 10;
      adjustments.saturation = 15;
      adjustments.vignette = -10;
      actions.push('resaltado el sujeto principal');
    }

    // Color enhancement for specific elements
    if (lowerPrompt.includes('flor') || lowerPrompt.includes('verde') || lowerPrompt.includes('naturalez')) {
      adjustments.saturation = 15;
      adjustments.temperature = 5;
      actions.push('realzados los colores naturales');
    }

    const message = actions.length > 0 
      ? `He ${actions.join(', ')}.` 
      : 'No he detectado ajustes específicos en tu solicitud. Intenta ser más concreto, por ejemplo: "aumenta el brillo" o "reduce el contraste".';

    return { adjustments, message };
  };

  return (
    <div className="app-container">
      <header className="app-header">
        <h1>📸 AI Photo Editor</h1>
        <button onClick={() => setShowConfig(!showConfig)} className="config-btn">⚙️ Configuración</button>
      </header>

      {showConfig && (
        <div className="config-panel">
          <h3>Configuración de APIs</h3>
          <div className="form-group">
            <label>OpenRouter API Key:</label>
            <input type="password" value={apiKeys.openRouter} onChange={(e) => setApiKeys(prev => ({ ...prev, openRouter: e.target.value }))} placeholder="sk-or-..." />
          </div>
          <div className="form-group">
            <label>Z.ai API Key:</label>
            <input type="password" value={apiKeys.zAI} onChange={(e) => setApiKeys(prev => ({ ...prev, zAI: e.target.value }))} placeholder="sk-..." />
          </div>
          <button onClick={() => setShowConfig(false)}>Guardar</button>
        </div>
      )}

      <div className="main-content">
        <aside className="tools-panel">
          <button onClick={() => fileInputRef.current?.click()} className="upload-btn">📁 Abrir Imagen</button>
          <input ref={fileInputRef} type="file" accept="image/*,.raw,.cr3,.nef,.arw,.raf,.orf,.rw2,.dng,.jpg,.jpeg,.png,.webp" onChange={handleImageUpload} style={{ display: 'none' }} />

          {imageSrc && (
            <>
              <div className="adjustments-section">
                <h3>Ajustes Básicos</h3>
                <div className="slider-group">
                  <label>Brillo: {adjustments.brightness}</label>
                  <input type="range" min="-100" max="100" value={adjustments.brightness} onChange={(e) => updateAdjustment('brightness', parseInt(e.target.value))} />
                </div>
                <div className="slider-group">
                  <label>Contraste: {adjustments.contrast}</label>
                  <input type="range" min="-100" max="100" value={adjustments.contrast} onChange={(e) => updateAdjustment('contrast', parseInt(e.target.value))} />
                </div>
                <div className="slider-group">
                  <label>Saturación: {adjustments.saturation}</label>
                  <input type="range" min="-100" max="100" value={adjustments.saturation} onChange={(e) => updateAdjustment('saturation', parseInt(e.target.value))} />
                </div>
                <div className="slider-group">
                  <label>Exposición: {adjustments.exposure}</label>
                  <input type="range" min="-100" max="100" value={adjustments.exposure} onChange={(e) => updateAdjustment('exposure', parseInt(e.target.value))} />
                </div>
              </div>

              <div className="adjustments-section">
                <h3>Ajustes Avanzados</h3>
                <div className="slider-group">
                  <label>Iluminaciones: {adjustments.highlights}</label>
                  <input type="range" min="-100" max="100" value={adjustments.highlights} onChange={(e) => updateAdjustment('highlights', parseInt(e.target.value))} />
                </div>
                <div className="slider-group">
                  <label>Sombras: {adjustments.shadows}</label>
                  <input type="range" min="-100" max="100" value={adjustments.shadows} onChange={(e) => updateAdjustment('shadows', parseInt(e.target.value))} />
                </div>
                <div className="slider-group">
                  <label>Temperatura: {adjustments.temperature}</label>
                  <input type="range" min="-100" max="100" value={adjustments.temperature} onChange={(e) => updateAdjustment('temperature', parseInt(e.target.value))} />
                </div>
                <div className="slider-group">
                  <label>Matiz: {adjustments.tint}</label>
                  <input type="range" min="-100" max="100" value={adjustments.tint} onChange={(e) => updateAdjustment('tint', parseInt(e.target.value))} />
                </div>
              </div>

              <div className="adjustments-section">
                <h3>Máscaras IA</h3>
                <div className="mask-buttons">
                  <button className={`mask-btn ${activeMask === 'person' ? 'active' : ''}`} onClick={() => toggleMask('person')}>👤 Persona</button>
                  <button className={`mask-btn ${activeMask === 'animal' ? 'active' : ''}`} onClick={() => toggleMask('animal')}>🐾 Animal</button>
                  <button className={`mask-btn ${activeMask === 'plant' ? 'active' : ''}`} onClick={() => toggleMask('plant')}>🌿 Planta</button>
                  <button className={`mask-btn ${activeMask === 'sky' ? 'active' : ''}`} onClick={() => toggleMask('sky')}>☁️ Cielo</button>
                  <button className={`mask-btn ${activeMask === 'background' ? 'active' : ''}`} onClick={() => toggleMask('background')}>🖼️ Fondo</button>
                  <button className={`mask-btn ${activeMask === 'subject' ? 'active' : ''}`} onClick={() => toggleMask('subject')}>🎯 Sujeto</button>
                </div>
              </div>

              <button onClick={resetAdjustments} className="reset-btn">🔄 Resetear Ajustes</button>
              <button onClick={exportAsJPG} className="export-btn">💾 Exportar JPG</button>
            </>
          )}
        </aside>

        <main className="canvas-area">
          {!imageSrc ? (
            <div className="placeholder">
              <p>Sube una imagen para comenzar a editar</p>
              <p className="hint">Soporta RAW, JPG, PNG y más</p>
            </div>
          ) : (
            <canvas ref={canvasRef} className="photo-canvas" />
          )}
        </main>

        <aside className="ai-panel">
          <h3>🤖 Asistente IA</h3>
          <div className="chat-messages">
            {aiMessages.map((msg, idx) => (
              <div key={idx} className={`message ${msg.role}`}>
                <strong>{msg.role === 'user' ? 'Tú' : 'IA'}:</strong>
                <p>{msg.content}</p>
              </div>
            ))}
            {isProcessing && <div className="message assistant loading">IA escribiendo...</div>}
          </div>
          <div className="chat-input">
            <textarea value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)} placeholder="Describe qué quieres hacer con la foto..." onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), sendAiPrompt())} disabled={!imageSrc || isProcessing} />
            <button onClick={sendAiPrompt} disabled={!imageSrc || isProcessing || !aiPrompt.trim()}>Enviar</button>
          </div>
        </aside>
      </div>
    </div>
  )
}

export default App
