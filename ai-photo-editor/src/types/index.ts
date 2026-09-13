// Types for the AI Photo Editor application

export interface ImageFile {
  id: string;
  file: File;
  name: string;
  type: string;
  size: number;
  previewUrl: string;
  width: number;
  height: number;
  exif?: EXIFData;
  loadedAt: Date;
}

export interface EXIFData {
  make?: string;
  model?: string;
  dateTime?: string;
  exposureTime?: string;
  fNumber?: string;
  iso?: number;
  focalLength?: string;
  lens?: string;
  gps?: GPSData;
  orientation?: number;
  software?: string;
  artist?: string;
  copyright?: string;
}

export interface GPSData {
  latitude?: number;
  longitude?: number;
  altitude?: number;
  locationName?: string;
}

export interface Adjustment {
  id: string;
  type: AdjustmentType;
  value: number | number[] | boolean;
  enabled: boolean;
}

export type AdjustmentType = 
  | 'exposure'
  | 'contrast'
  | 'highlights'
  | 'shadows'
  | 'whites'
  | 'blacks'
  | 'temperature'
  | 'tint'
  | 'vibrance'
  | 'saturation'
  | 'clarity'
  | 'dehaze'
  | 'sharpness'
  | 'noiseReduction'
  | 'crop'
  | 'rotate'
  | 'straighten';

export interface Mask {
  id: string;
  type: MaskType;
  name: string;
  data: ImageData | null;
  enabled: boolean;
  color: string;
}

export type MaskType = 
  | 'person'
  | 'animal'
  | 'plant'
  | 'sky'
  | 'background'
  | 'landscape'
  | 'subject'
  | 'custom';

export interface EditHistory {
  imageId: string;
  adjustments: Adjustment[];
  masks: Mask[];
  timestamp: Date;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  relatedAdjustments?: Adjustment[];
  relatedMasks?: Mask[];
}

export interface AIProvider {
  id: string;
  name: string;
  apiKey?: string;
  enabled: boolean;
  endpoint?: string;
  model?: string;
}

export interface AppState {
  currentImage: ImageFile | null;
  images: ImageFile[];
  adjustments: Adjustment[];
  masks: Mask[];
  chatMessages: ChatMessage[];
  aiProviders: AIProvider[];
  selectedMask: Mask | null;
  isProcessing: boolean;
  histogram?: HistogramData;
}

export interface HistogramData {
  red: number[];
  green: number[];
  blue: number[];
  luminance: number[];
}

export interface ToneCurvePoint {
  x: number;
  y: number;
}

export interface ToneCurve {
  rgb: ToneCurvePoint[];
  red: ToneCurvePoint[];
  green: ToneCurvePoint[];
  blue: ToneCurvePoint[];
}

export interface HSLAdjustment {
  hue: number;
  saturation: number;
  luminance: number;
}

export interface HSLData {
  red: HSLAdjustment;
  orange: HSLAdjustment;
  yellow: HSLAdjustment;
  green: HSLAdjustment;
  aqua: HSLAdjustment;
  blue: HSLAdjustment;
  purple: HSLAdjustment;
  magenta: HSLAdjustment;
}

export interface TagSuggestion {
  tag: string;
  confidence: number;
  category: 'object' | 'scene' | 'concept' | 'location';
}

export interface LocationSuggestion {
  name: string;
  latitude: number;
  longitude: number;
  confidence: number;
  source: 'exif' | 'visual';
}
