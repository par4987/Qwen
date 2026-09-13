import React from 'react';
import { useApp } from '../context/AppContext';
import { Sliders, Image as ImageIcon, Trash2 } from 'lucide-react';

export function AdjustmentPanel() {
  const { state, updateAdjustment, resetAdjustments, setCurrentImage } = useApp();
  
  const adjustmentConfig = [
    { id: 'exposure', label: 'Exposure', min: -5, max: 5, step: 0.1 },
    { id: 'contrast', label: 'Contrast', min: -100, max: 100, step: 1 },
    { id: 'highlights', label: 'Highlights', min: -100, max: 100, step: 1 },
    { id: 'shadows', label: 'Shadows', min: -100, max: 100, step: 1 },
    { id: 'whites', label: 'Whites', min: -100, max: 100, step: 1 },
    { id: 'blacks', label: 'Blacks', min: -100, max: 100, step: 1 },
    { id: 'temperature', label: 'Temperature', min: -100, max: 100, step: 1 },
    { id: 'tint', label: 'Tint', min: -100, max: 100, step: 1 },
    { id: 'vibrance', label: 'Vibrance', min: -100, max: 100, step: 1 },
    { id: 'saturation', label: 'Saturation', min: -100, max: 100, step: 1 },
    { id: 'clarity', label: 'Clarity', min: -100, max: 100, step: 1 },
    { id: 'dehaze', label: 'Dehaze', min: -100, max: 100, step: 1 },
    { id: 'sharpness', label: 'Sharpness', min: 0, max: 100, step: 1 },
    { id: 'noiseReduction', label: 'Noise Reduction', min: 0, max: 100, step: 1 },
  ];

  if (!state.currentImage) {
    return (
      <div className="adjustment-panel empty">
        <ImageIcon size={48} />
        <p>No image selected</p>
        <p>Upload a photo to start editing</p>
      </div>
    );
  }

  return (
    <div className="adjustment-panel">
      <div className="panel-header">
        <Sliders size={20} />
        <h3>Basic Adjustments</h3>
        <button onClick={resetAdjustments} className="reset-btn" title="Reset all">
          Reset
        </button>
      </div>

      <div className="image-info">
        <img src={state.currentImage.previewUrl} alt="Thumbnail" />
        <div className="info-details">
          <p className="filename">{state.currentImage.name}</p>
          <p className="dimensions">
            {state.currentImage.width} × {state.currentImage.height}
          </p>
        </div>
        <button 
          onClick={() => setCurrentImage(null)} 
          className="remove-btn"
          title="Remove image"
        >
          <Trash2 size={16} />
        </button>
      </div>

      <div className="adjustments-list">
        {adjustmentConfig.map((adj) => {
          const currentValue = state.adjustments.find(a => a.id === adj.id)?.value || 0;
          
          return (
            <div key={adj.id} className="adjustment-item">
              <div className="adjustment-label">
                <label>{adj.label}</label>
                <span className="value">{currentValue}</span>
              </div>
              <input
                type="range"
                min={adj.min}
                max={adj.max}
                step={adj.step}
                value={currentValue}
                onChange={(e) => updateAdjustment(adj.id, parseFloat(e.target.value))}
                className="adjustment-slider"
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
