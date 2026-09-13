import React, { useRef, useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { ZoomIn, ZoomOut, RotateCcw, Maximize } from 'lucide-react';

export function ImageViewer() {
  const { state, updateAdjustment } = useApp();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);

  useEffect(() => {
    if (state.currentImage && canvasRef.current) {
      renderImage();
    }
  }, [state.currentImage, state.adjustments, zoom, rotation]);

  const renderImage = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    const image = state.currentImage;

    if (!canvas || !ctx || !image) return;

    const img = new Image();
    img.src = image.previewUrl;
    
    img.onload = () => {
      // Apply rotation to canvas dimensions
      const rotatedWidth = rotation % 180 !== 0 ? img.height : img.width;
      const rotatedHeight = rotation % 180 !== 0 ? img.width : img.height;
      
      canvas.width = rotatedWidth * zoom;
      canvas.height = rotatedHeight * zoom;

      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Save context state
      ctx.save();

      // Move to center and apply transformations
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.scale(zoom, zoom);

      // Apply adjustments as filters
      const filters = buildFilterString(state.adjustments);
      ctx.filter = filters;

      // Draw image centered
      ctx.drawImage(img, -img.width / 2, -img.height / 2);

      // Restore context state
      ctx.restore();
    };
  };

  const buildFilterString = (adjustments: any[]) => {
    const adjMap = new Map(adjustments.map(a => [a.id, a.value]));
    
    const exposure = adjMap.get('exposure') || 0;
    const contrast = adjMap.get('contrast') || 0;
    const saturation = adjMap.get('saturation') || 0;
    const temperature = adjMap.get('temperature') || 0;
    const tint = adjMap.get('tint') || 0;
    const brightness = adjMap.get('highlights') || 0;
    
    // Build CSS filter string
    let filters = [];
    
    // Brightness (affected by exposure)
    const brightnessValue = 1 + (exposure * 0.1);
    filters.push(`brightness(${brightnessValue})`);
    
    // Contrast
    const contrastValue = 1 + (contrast / 100);
    filters.push(`contrast(${contrastValue})`);
    
    // Saturation
    const saturationValue = 1 + (saturation / 100);
    filters.push(`saturate(${saturationValue})`);
    
    // Sepia for warmth (temperature)
    if (temperature > 0) {
      filters.push(`sepia(${Math.min(temperature / 200, 0.3)})`);
    }
    
    // Hue rotate for tint
    if (tint !== 0) {
      filters.push(`hue-rotate(${tint * 0.5}deg)`);
    }

    return filters.join(' ');
  };

  const handleZoomIn = () => setZoom(Math.min(zoom * 1.2, 5));
  const handleZoomOut = () => setZoom(Math.max(zoom / 1.2, 0.2));
  const handleReset = () => {
    setZoom(1);
    setRotation(0);
  };
  const handleRotate = () => setRotation((rotation + 90) % 360);

  if (!state.currentImage) {
    return (
      <div className="image-viewer empty">
        <p>Load an image to start editing</p>
      </div>
    );
  }

  return (
    <div className="image-viewer" ref={containerRef}>
      <div className="viewer-toolbar">
        <button onClick={handleZoomOut} title="Zoom Out">
          <ZoomOut size={18} />
        </button>
        <span className="zoom-level">{Math.round(zoom * 100)}%</span>
        <button onClick={handleZoomIn} title="Zoom In">
          <ZoomIn size={18} />
        </button>
        <div className="separator"></div>
        <button onClick={handleRotate} title="Rotate 90°">
          <RotateCcw size={18} />
        </button>
        <button onClick={handleReset} title="Reset View">
          <Maximize size={18} />
        </button>
      </div>

      <div className="canvas-container">
        <canvas ref={canvasRef} />
      </div>

      <div className="image-metadata">
        {state.currentImage.exif && (
          <>
            {state.currentImage.exif.make && (
              <span>{state.currentImage.exif.make}</span>
            )}
            {state.currentImage.exif.model && (
              <span>{state.currentImage.exif.model}</span>
            )}
            {state.currentImage.exif.gps?.latitude && (
              <span className="gps">
                📍 {state.currentImage.exif.gps.latitude.toFixed(4)}, 
                {state.currentImage.exif.gps.longitude.toFixed(4)}
              </span>
            )}
          </>
        )}
      </div>
    </div>
  );
}
