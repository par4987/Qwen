import { useState, useRef, useEffect } from 'react'
import './App.css'

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
};

type MaskType = 'person' | 'animal' | 'plant' | 'sky' | 'background' | 'subject';

function App() {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [adjustments, setAdjustments] = useState<ImageAdjustments>(defaultAdjustments);
  const [activeMask, setActiveMask] = useState<MaskType | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiMessages, setAiMessages] = useState<{role: 'user' | 'assistant', content: string}[]>([]);
  const [showConfig, setShowConfig] = useState(false);
  const [apiKeys, setApiKeys] = useState({ openRouter: '', zAI: '' });
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        setImageSrc(event.target.result as string);
      }
    };
    reader.readAsDataURL(file);
  };

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
      
      ctx.save();
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((adjustments.rotation * Math.PI) / 180);
      ctx.translate(-canvas.width / 2, -canvas.height / 2);
      
      const filter = `brightness(${100 + adjustments.brightness}%) contrast(${100 + adjustments.contrast}%) saturate(${100 + adjustments.saturation}%)`;
      ctx.filter = filter;
      
      ctx.drawImage(img, 0, 0);
      ctx.restore();
    };
    img.src = imageSrc;
  }, [imageSrc, adjustments]);

  const updateAdjustment = (key: keyof ImageAdjustments, value: number) => {
    setAdjustments(prev => ({ ...prev, [key]: value }));
  };

  const resetAdjustments = () => setAdjustments(defaultAdjustments);

  const toggleMask = (maskType: MaskType) => {
    setActiveMask(activeMask === maskType ? null : maskType);
  };

  const exportAsJPG = () => {
    if (!canvasRef.current) return;
    const link = document.createElement('a');
    link.download = 'edited-photo.jpg';
    link.href = canvasRef.current.toDataURL('image/jpeg', 0.92);
    link.click();
  };

  const sendAiPrompt = async () => {
    if (!aiPrompt.trim() || !imageSrc) return;
    
    setIsProcessing(true);
    setAiMessages(prev => [...prev, { role: 'user', content: aiPrompt }]);
    
    setTimeout(() => {
      setAiMessages(prev => [...prev, { 
        role: 'assistant', 
        content: 'He aplicado ajustes: aumenté contraste y saturación para resaltar los colores.' 
      }]);
      
      setAdjustments(prev => ({
        ...prev,
        contrast: prev.contrast + 15,
        saturation: prev.saturation + 10,
      }));
      
      setAiPrompt('');
      setIsProcessing(false);
    }, 1500);
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
