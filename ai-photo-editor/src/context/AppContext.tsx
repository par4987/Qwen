import React, { createContext, useContext, useReducer, ReactNode } from 'react';
import { AppState, Adjustment, Mask, ChatMessage, AIProvider, ImageFile } from '../types';

const defaultAdjustments: Adjustment[] = [
  { id: 'exposure', type: 'exposure', value: 0, enabled: true },
  { id: 'contrast', type: 'contrast', value: 0, enabled: true },
  { id: 'highlights', type: 'highlights', value: 0, enabled: true },
  { id: 'shadows', type: 'shadows', value: 0, enabled: true },
  { id: 'whites', type: 'whites', value: 0, enabled: true },
  { id: 'blacks', type: 'blacks', value: 0, enabled: true },
  { id: 'temperature', type: 'temperature', value: 0, enabled: true },
  { id: 'tint', type: 'tint', value: 0, enabled: true },
  { id: 'vibrance', type: 'vibrance', value: 0, enabled: true },
  { id: 'saturation', type: 'saturation', value: 0, enabled: true },
  { id: 'clarity', type: 'clarity', value: 0, enabled: true },
  { id: 'dehaze', type: 'dehaze', value: 0, enabled: true },
  { id: 'sharpness', type: 'sharpness', value: 0, enabled: true },
  { id: 'noiseReduction', type: 'noiseReduction', value: 0, enabled: true },
];

const defaultAIProviders: AIProvider[] = [
  { id: 'openai', name: 'OpenAI GPT-4', enabled: false, model: 'gpt-4-vision-preview' },
  { id: 'claude', name: 'Claude', enabled: false, model: 'claude-3-opus-20240229' },
  { id: 'deepseek', name: 'DeepSeek', enabled: false },
  { id: 'qwen', name: 'Qwen', enabled: false },
  { id: 'kimi', name: 'Kimi', enabled: false },
];

const initialState: AppState = {
  currentImage: null,
  images: [],
  adjustments: defaultAdjustments,
  masks: [],
  chatMessages: [],
  aiProviders: defaultAIProviders,
  selectedMask: null,
  isProcessing: false,
};

type Action =
  | { type: 'SET_CURRENT_IMAGE'; payload: ImageFile | null }
  | { type: 'ADD_IMAGE'; payload: ImageFile }
  | { type: 'REMOVE_IMAGE'; payload: string }
  | { type: 'UPDATE_ADJUSTMENT'; payload: { id: string; value: number | boolean } }
  | { type: 'RESET_ADJUSTMENTS' }
  | { type: 'ADD_MASK'; payload: Mask }
  | { type: 'REMOVE_MASK'; payload: string }
  | { type: 'UPDATE_MASK'; payload: { id: string; enabled: boolean } }
  | { type: 'SELECT_MASK'; payload: Mask | null }
  | { type: 'ADD_CHAT_MESSAGE'; payload: ChatMessage }
  | { type: 'CLEAR_CHAT' }
  | { type: 'SET_PROCESSING'; payload: boolean }
  | { type: 'UPDATE_AI_PROVIDER'; payload: { id: string; apiKey?: string; enabled?: boolean } }
  | { type: 'SET_HISTOGRAM'; payload: any };

function appReducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'SET_CURRENT_IMAGE':
      return { ...state, currentImage: action.payload };
    
    case 'ADD_IMAGE':
      return { ...state, images: [...state.images, action.payload] };
    
    case 'REMOVE_IMAGE':
      return { 
        ...state, 
        images: state.images.filter(img => img.id !== action.payload),
        currentImage: state.currentImage?.id === action.payload ? null : state.currentImage
      };
    
    case 'UPDATE_ADJUSTMENT':
      return {
        ...state,
        adjustments: state.adjustments.map(adj =>
          adj.id === action.payload.id
            ? { ...adj, value: action.payload.value }
            : adj
        )
      };
    
    case 'RESET_ADJUSTMENTS':
      return { ...state, adjustments: defaultAdjustments };
    
    case 'ADD_MASK':
      return { ...state, masks: [...state.masks, action.payload] };
    
    case 'REMOVE_MASK':
      return { 
        ...state, 
        masks: state.masks.filter(m => m.id !== action.payload),
        selectedMask: state.selectedMask?.id === action.payload ? null : state.selectedMask
      };
    
    case 'UPDATE_MASK':
      return {
        ...state,
        masks: state.masks.map(mask =>
          mask.id === action.payload.id
            ? { ...mask, enabled: action.payload.enabled }
            : mask
        )
      };
    
    case 'SELECT_MASK':
      return { ...state, selectedMask: action.payload };
    
    case 'ADD_CHAT_MESSAGE':
      return { ...state, chatMessages: [...state.chatMessages, action.payload] };
    
    case 'CLEAR_CHAT':
      return { ...state, chatMessages: [] };
    
    case 'SET_PROCESSING':
      return { ...state, isProcessing: action.payload };
    
    case 'UPDATE_AI_PROVIDER':
      return {
        ...state,
        aiProviders: state.aiProviders.map(provider =>
          provider.id === action.payload.id
            ? { ...provider, ...action.payload }
            : provider
        )
      };
    
    case 'SET_HISTOGRAM':
      return { ...state, histogram: action.payload };
    
    default:
      return state;
  }
}

interface AppContextType {
  state: AppState;
  dispatch: React.Dispatch<Action>;
  setCurrentImage: (image: ImageFile | null) => void;
  addImage: (image: ImageFile) => void;
  removeImage: (id: string) => void;
  updateAdjustment: (id: string, value: number | boolean) => void;
  resetAdjustments: () => void;
  addMask: (mask: Mask) => void;
  removeMask: (id: string) => void;
  selectMask: (mask: Mask | null) => void;
  toggleMask: (id: string, enabled: boolean) => void;
  addChatMessage: (message: ChatMessage) => void;
  clearChat: () => void;
  setProcessing: (processing: boolean) => void;
  updateAIProvider: (id: string, config: { apiKey?: string; enabled?: boolean }) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialState);

  const setCurrentImage = (image: ImageFile | null) => {
    dispatch({ type: 'SET_CURRENT_IMAGE', payload: image });
  };

  const addImage = (image: ImageFile) => {
    dispatch({ type: 'ADD_IMAGE', payload: image });
  };

  const removeImage = (id: string) => {
    dispatch({ type: 'REMOVE_IMAGE', payload: id });
  };

  const updateAdjustment = (id: string, value: number | boolean) => {
    dispatch({ type: 'UPDATE_ADJUSTMENT', payload: { id, value } });
  };

  const resetAdjustments = () => {
    dispatch({ type: 'RESET_ADJUSTMENTS' });
  };

  const addMask = (mask: Mask) => {
    dispatch({ type: 'ADD_MASK', payload: mask });
  };

  const removeMask = (id: string) => {
    dispatch({ type: 'REMOVE_MASK', payload: id });
  };

  const selectMask = (mask: Mask | null) => {
    dispatch({ type: 'SELECT_MASK', payload: mask });
  };

  const toggleMask = (id: string, enabled: boolean) => {
    dispatch({ type: 'UPDATE_MASK', payload: { id, enabled } });
  };

  const addChatMessage = (message: ChatMessage) => {
    dispatch({ type: 'ADD_CHAT_MESSAGE', payload: message });
  };

  const clearChat = () => {
    dispatch({ type: 'CLEAR_CHAT' });
  };

  const setProcessing = (processing: boolean) => {
    dispatch({ type: 'SET_PROCESSING', payload: processing });
  };

  const updateAIProvider = (id: string, config: { apiKey?: string; enabled?: boolean }) => {
    dispatch({ type: 'UPDATE_AI_PROVIDER', payload: { id, ...config } });
  };

  return (
    <AppContext.Provider value={{
      state,
      dispatch,
      setCurrentImage,
      addImage,
      removeImage,
      updateAdjustment,
      resetAdjustments,
      addMask,
      removeMask,
      selectMask,
      toggleMask,
      addChatMessage,
      clearChat,
      setProcessing,
      updateAIProvider,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}
