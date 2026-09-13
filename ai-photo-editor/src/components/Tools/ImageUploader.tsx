import React, { useState, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import { useApp } from '../context/AppContext';
import { ImageFile } from '../types';
import { generateImageId, extractEXIF, isRAWFile } from '../utils/imageUtils';
import { Upload, FileImage, AlertCircle } from 'lucide-react';

export function ImageUploader() {
  const { addImage, setCurrentImage } = useApp();
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFile = async (file: File): Promise<ImageFile | null> => {
    try {
      // Create preview URL
      const previewUrl = URL.createObjectURL(file);
      
      // Get image dimensions
      const dimensions = await getImageDimensions(file);
      
      // Extract EXIF data
      const exif = await extractEXIF(file);
      
      const imageFile: ImageFile = {
        id: generateImageId(),
        file,
        name: file.name,
        type: file.type || 'image/jpeg',
        size: file.size,
        previewUrl,
        width: dimensions.width,
        height: dimensions.height,
        exif,
        loadedAt: new Date(),
      };

      return imageFile;
    } catch (err) {
      console.error('Error processing file:', err);
      setError(`Failed to process ${file.name}`);
      return null;
    }
  };

  const getImageDimensions = (file: File): Promise<{ width: number; height: number }> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        resolve({ width: img.width, height: img.height });
      };
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  };

  const onDrop = async (acceptedFiles: File[], rejectedFiles: any[]) => {
    setIsProcessing(true);
    setError(null);

    // Handle rejected files
    if (rejectedFiles.length > 0) {
      const rejectedNames = rejectedFiles.map(f => f.file.name).join(', ');
      setError(`Rejected files: ${rejectedNames}. RAW files may need special processing.`);
    }

    // Process accepted files
    for (const file of acceptedFiles) {
      try {
        const imageFile = await processFile(file);
        if (imageFile) {
          addImage(imageFile);
          // Set as current image if it's the first one
          if (!window.location.pathname.includes('current')) {
            // Could set as current, but let user choose
          }
        }
      } catch (err) {
        console.error('Error processing file:', err);
      }
    }

    setIsProcessing(false);
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.jpg', '.jpeg', '.png', '.gif', '.webp'],
      'image/x-canon-cr3': ['.cr3'],
      'image/x-nikon-nef': ['.nef'],
      'image/x-sony-arw': ['.arw'],
      'image/x-fuji-raf': ['.raf'],
      'image/x-olympus-orf': ['.orf'],
      'image/x-panasonic-rw2': ['.rw2'],
      'image/x-adobe-dng': ['.dng'],
    },
    multiple: true,
  });

  return (
    <div className="image-uploader">
      <div
        {...getRootProps()}
        className={`dropzone ${isDragActive ? 'active' : ''} ${isProcessing ? 'processing' : ''}`}
      >
        <input {...getInputProps()} />
        
        {isProcessing ? (
          <div className="uploading">
            <div className="spinner"></div>
            <p>Processing images...</p>
          </div>
        ) : isDragActive ? (
          <div className="drag-active">
            <Upload size={48} />
            <p>Drop your photos here</p>
          </div>
        ) : (
          <div className="upload-prompt">
            <FileImage size={48} />
            <h3>Drag & drop photos here</h3>
            <p>or click to select files</p>
            <p className="supported-formats">
              Supports: JPEG, PNG, WEBP, and RAW formats (CR3, NEF, ARW, RAF, ORF, RW2, DNG)
            </p>
          </div>
        )}
      </div>

      {error && (
        <div className="error-message">
          <AlertCircle size={20} />
          <span>{error}</span>
          <button onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}

      <div className="raw-notice">
        <p>
          <strong>Note:</strong> RAW files will be converted to editable format. 
          For best results with RAW files, a backend service can provide full decoding support.
        </p>
      </div>
    </div>
  );
}
