export interface SpriteConfig {
  rows: number;
  cols: number;
  totalFrames: number; // Useful if the last row isn't full
  fps: number;
  scale: number;
  transparent: string | null; // Hex color for transparency replacement if needed, usually null
  autoTransparent: boolean; // New flag for automatic background removal
  direction: 'row' | 'column'; // 'row' = Horizontal (Standard), 'column' = Vertical
}

export interface ImageDimensions {
  width: number;
  height: number;
}

export interface ProcessingState {
  status: 'idle' | 'analyzing' | 'rendering' | 'generating' | 'completed';
  progress: number; // 0 to 100
  error?: string;
}

export type ImageResolution = '1K' | '2K' | '4K';

export type GenerationMode = 'template' | 'action';

export interface GenerationConfig {
  mode: GenerationMode;
  templateImage: string | null;
  characterImage: string | null;
  prompt: string; // Style prompt / Additional instructions
  actionPrompt: string; // Specific action description for 'action' mode
  size: ImageResolution;
}

export interface SavedGif {
  id: string;
  url: string;
  name: string;
  timestamp: number;
  dimensions: { width: number; height: number };
}

export interface Position {
  x: number;
  y: number;
}

export interface CanvasNodeData {
  id: string;
  type: 'source' | 'preview';
  title: string;
  position: Position;
  width?: number;
  height?: number;
}
