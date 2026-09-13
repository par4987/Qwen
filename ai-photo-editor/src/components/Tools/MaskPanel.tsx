import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { Wand2, Users, PawPrint, TreePine, Mountain, Image as ImageIcon, Layers } from 'lucide-react';
import { Mask as MaskType } from '../types';

export function MaskPanel() {
  const { state, addMask, removeMask, toggleMask, selectMask } = useApp();
  const [isGenerating, setIsGenerating] = useState<string | null>(null);

  const maskTypes = [
    { id: 'person', label: 'Person', icon: Users, color: '#FF6B6B' },
    { id: 'animal', label: 'Animal', icon: PawPrint, color: '#4ECDC4' },
    { id: 'plant', label: 'Plant', icon: TreePine, color: '#96CEB4' },
    { id: 'sky', label: 'Sky', color: '#45B7D1' },
    { id: 'background', label: 'Background', icon: Image, color: '#DDA0DD' },
    { id: 'landscape', label: 'Landscape', icon: Mountain, color: '#FFEAA7' },
    { id: 'subject', label: 'Subject', icon: Wand2, color: '#98D8C8' },
  ];

  const generateMask = async (type: string) => {
    if (!state.currentImage) return;
    
    setIsGenerating(type);
    
    try {
      // In a real implementation, this would call an AI service like SAM (Segment Anything)
      // For now, we'll create a placeholder mask
      
      // Simulate API call delay
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      const mask: MaskType = {
        id: `mask_${Date.now()}`,
        type: type as any,
        name: `${type} mask`,
        data: null, // Would contain segmentation data from SAM
        enabled: true,
        color: maskTypes.find(m => m.id === type)?.color || '#999999',
      };
      
      addMask(mask);
      selectMask(mask);
      
    } catch (error) {
      console.error('Failed to generate mask:', error);
    } finally {
      setIsGenerating(null);
    }
  };

  return (
    <div className="mask-panel">
      <div className="panel-header">
        <Layers size={20} />
        <h3>AI Masks</h3>
      </div>

      <p className="panel-description">
        Generate masks to apply adjustments to specific areas of your photo
      </p>

      <div className="mask-types">
        {maskTypes.map((maskType) => {
          const Icon = maskType.icon;
          const isGeneratingThis = isGenerating === maskType.id;
          
          return (
            <button
              key={maskType.id}
              onClick={() => generateMask(maskType.id)}
              disabled={isGeneratingThis || !state.currentImage}
              className={`mask-type-btn ${isGeneratingThis ? 'generating' : ''}`}
              style={{ '--mask-color': maskType.color } as React.CSSProperties}
            >
              {isGeneratingThis ? (
                <div className="spinner-small"></div>
              ) : Icon ? (
                <Icon size={20} />
              ) : (
                <div className="color-dot" style={{ backgroundColor: maskType.color }}></div>
              )}
              <span>{maskType.label}</span>
            </button>
          );
        })}
      </div>

      {state.masks.length > 0 && (
        <div className="active-masks">
          <h4>Active Masks</h4>
          {state.masks.map((mask) => (
            <div key={mask.id} className="mask-item">
              <div 
                className="mask-color-indicator"
                style={{ backgroundColor: mask.color }}
              ></div>
              <span className="mask-name">{mask.name}</span>
              <input
                type="checkbox"
                checked={mask.enabled}
                onChange={(e) => toggleMask(mask.id, e.target.checked)}
                title="Toggle mask"
              />
              <button
                onClick={() => removeMask(mask.id)}
                className="remove-mask-btn"
                title="Remove mask"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="mask-info">
        <p>
          <small>
            <strong>Note:</strong> Full mask generation requires integration with 
            Segment Anything Model (SAM) or similar AI service.
          </small>
        </p>
      </div>
    </div>
  );
}

// Fix import
import { Image } from 'lucide-react';
