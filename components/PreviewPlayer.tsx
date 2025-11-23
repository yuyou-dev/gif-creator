import React, { useRef, useEffect, useState } from 'react';
import { SpriteConfig, ImageDimensions } from '../types';
import { Play, Pause } from 'lucide-react';

interface PreviewPlayerProps {
  imageUrl: string | null;
  config: SpriteConfig;
  dimensions: ImageDimensions;
}

export const PreviewPlayer: React.FC<PreviewPlayerProps> = ({ imageUrl, config, dimensions }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [currentFrame, setCurrentFrame] = useState(0);

  useEffect(() => {
    if (!imageUrl || !canvasRef.current || dimensions.width === 0) return;

    const img = new Image();
    img.src = imageUrl;
    
    const animate = (time: number) => {
      if (!canvasRef.current) return;
      
      const frameInterval = 1000 / config.fps;
      // Use config.totalFrames strictly
      const totalFrames = config.totalFrames;
      
      const frameIndex = Math.floor(time / frameInterval) % totalFrames;
      setCurrentFrame(frameIndex);

      const ctx = canvasRef.current.getContext('2d');
      if (!ctx) return;

      const frameWidth = dimensions.width / config.cols;
      const frameHeight = dimensions.height / config.rows;

      let col, row;
      if (config.direction === 'column') {
        // Vertical Order: frameIndex 0 = (0,0), 1 = (1,0), 2 = (2,0)...
        // row changes fast, col changes slow
        row = frameIndex % config.rows;
        col = Math.floor(frameIndex / config.rows);
      } else {
        // Horizontal Order (Default): frameIndex 0 = (0,0), 1 = (0,1)...
        // col changes fast, row changes slow
        col = frameIndex % config.cols;
        row = Math.floor(frameIndex / config.cols);
      }

      // We fix the canvas size to the internal resolution of one frame
      canvasRef.current.width = frameWidth;
      canvasRef.current.height = frameHeight;
      
      ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      ctx.imageSmoothingEnabled = false;

      // Draw original frame 1:1 on canvas
      ctx.drawImage(
        img,
        col * frameWidth, row * frameHeight,
        frameWidth, frameHeight,
        0, 0,
        frameWidth, frameHeight
      );

      if (isPlaying) {
        requestRef.current = requestAnimationFrame(animate);
      }
    };

    if (isPlaying) {
      requestRef.current = requestAnimationFrame(animate);
    }

    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [imageUrl, config, dimensions, isPlaying]);

  if (!imageUrl) return null;

  return (
    <div className="flex flex-col w-full h-full bg-slate-900 border border-slate-800 rounded-lg overflow-hidden relative group">
      {/* Container for the canvas ensuring it fits nicely */}
      <div className="flex-1 w-full relative bg-[url('https://www.transparenttextures.com/patterns/pixels.png')] bg-slate-800/50 flex items-center justify-center p-2">
        <canvas 
            ref={canvasRef} 
            className="max-w-full max-h-full object-contain image-pixelated"
            style={{ imageRendering: 'pixelated' }}
        />
        
        {/* Floating Play/Pause Button */}
        <button 
          onClick={() => setIsPlaying(!isPlaying)}
          className="absolute bottom-2 right-2 p-1.5 rounded bg-black/50 hover:bg-indigo-500/80 text-white backdrop-blur-sm transition-colors border border-white/10"
        >
          {isPlaying ? <Pause size={12} /> : <Play size={12} />}
        </button>

        {/* Frame Counter */}
        <div className="absolute top-2 left-2 px-1.5 py-0.5 bg-black/50 backdrop-blur-sm rounded text-[10px] font-mono text-slate-300 border border-white/10">
            {currentFrame + 1}/{config.totalFrames}
        </div>
      </div>
    </div>
  );
};