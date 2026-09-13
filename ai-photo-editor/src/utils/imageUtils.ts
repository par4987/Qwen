import { EXIFData, GPSData } from '../types';

export async function extractEXIF(file: File): Promise<EXIFData | undefined> {
  try {
    // Use exif-js for EXIF extraction
    const exif = await new Promise<any>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          // In a real implementation, we'd use exif-js here
          // For now, we'll return basic metadata
          resolve({});
        } catch (error) {
          reject(error);
        }
      };
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });

    const exifData: EXIFData = {
      make: exif.Make || undefined,
      model: exif.Model || undefined,
      dateTime: exif.DateTime || undefined,
      exposureTime: exif.ExposureTime || undefined,
      fNumber: exif.FNumber || undefined,
      iso: exif.ISO || undefined,
      focalLength: exif.FocalLength || undefined,
      lens: exif.LensModel || undefined,
      gps: exif.GPSLatitude && exif.GPSLongitude ? {
        latitude: convertGPSCoordinate(exif.GPSLatitude, exif.GPSLatitudeRef),
        longitude: convertGPSCoordinate(exif.GPSLongitude, exif.GPSLongitudeRef),
        altitude: exif.GPSAltitude || undefined,
      } : undefined,
      orientation: exif.Orientation || undefined,
      software: exif.Software || undefined,
      artist: exif.Artist || undefined,
      copyright: exif.Copyright || undefined,
    };

    return exifData;
  } catch (error) {
    console.error('Error extracting EXIF:', error);
    return undefined;
  }
}

function convertGPSCoordinate(coordinate: any, ref: string): number {
  if (!coordinate) return 0;
  
  // Convert from EXIF format to decimal degrees
  let decimal = 0;
  if (Array.isArray(coordinate)) {
    decimal = coordinate[0] + coordinate[1] / 60 + (coordinate[2] || 0) / 3600;
  } else {
    decimal = coordinate;
  }
  
  if (ref === 'S' || ref === 'W') {
    decimal *= -1;
  }
  
  return decimal;
}

export async function reverseGeocode(lat: number, lng: number): Promise<string | undefined> {
  try {
    // Use OpenStreetMap Nominatim API (free, no API key required)
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`
    );
    
    if (!response.ok) {
      throw new Error('Geocoding failed');
    }
    
    const data = await response.json();
    return data.display_name || data.address?.city || data.address?.town || data.address?.village || undefined;
  } catch (error) {
    console.error('Error reverse geocoding:', error);
    return undefined;
  }
}

export function generateImageId(): string {
  return `img_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export function getMimeType(file: File): string {
  const extension = file.name.split('.').pop()?.toLowerCase();
  
  const mimeTypes: Record<string, string> = {
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif',
    'webp': 'image/webp',
    'cr3': 'image/x-canon-cr3',
    'nef': 'image/x-nikon-nef',
    'arw': 'image/x-sony-arw',
    'raf': 'image/x-fuji-raf',
    'orf': 'image/x-olympus-orf',
    'rw2': 'image/x-panasonic-rw2',
    'dng': 'image/x-adobe-dng',
  };
  
  return mimeTypes[extension || 'jpg'] || file.type || 'image/jpeg';
}

export function isRAWFile(file: File): boolean {
  const rawExtensions = ['cr3', 'nef', 'arw', 'raf', 'orf', 'rw2', 'dng', 'cr2', 'pef'];
  const extension = file.name.split('.').pop()?.toLowerCase();
  return rawExtensions.includes(extension || '');
}
