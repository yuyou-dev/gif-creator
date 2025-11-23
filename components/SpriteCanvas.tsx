import React, { useRef, useEffect, useState } from 'react';
import { SpriteConfig, ImageDimensions } from '../types';

interface SpriteCanvasProps {
  imageUrl: string | null;
  config: SpriteConfig;
  onDimensionsLoaded: (dims: ImageDimensions) => void;
  maxHeight?: number;
}

export const SpriteCanvas: React.FC<SpriteCanvasProps> = ({ imageUrl, config, onDimensionsLoaded, maxHeight }) => {
  const imgRef = useRef<HTMLImageElement>(null);
  const [renderedSize, setRenderedSize] = useState({ width: 0, height: 0 });

  // Monitor the actual displayed size of the image to align the grid perfectly
  useEffect(() => {
    if (!imgRef.current) return;

    const updateSize = () => {
      if (imgRef.current) {
        setRenderedSize({
          width: imgRef.current.offsetWidth,
          height: imgRef.current.offsetHeight
        });
      }
    };

    // Initial check
    updateSize();

    const observer = new ResizeObserver(() => {
      updateSize();
    });

    observer.observe(imgRef.current);

    return () => {
      observer.disconnect();
    };
  }, [imageUrl]);

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const { naturalWidth, naturalHeight } = e.currentTarget;
    onDimensionsLoaded({ width: naturalWidth, height: naturalHeight });
    // Force update rendered size on load
    setRenderedSize({
      width: e.currentTarget.offsetWidth,
      height: e.currentTarget.offsetHeight
    });
  };

  const renderGridOverlay = () => {
    if (!imageUrl || config.cols <= 0 || config.rows <= 0 || renderedSize.width === 0) return null;

    return (
      <div 
        className="absolute pointer-events-none border border-blue-500/30 z-10 top-0 left-0"
        style={{
          width: renderedSize.width,
          height: renderedSize.height,
          display: 'grid',
          gridTemplateColumns: `repeat(${config.cols}, 1fr)`,
          gridTemplateRows: `repeat(${config.rows}, 1fr)`,
        }}
      >
        {Array.from({ length: config.rows * config.cols }).map((_, i) => {
           // Calculate Row and Col in standard visual reading order (Row Major)
           const visualRow = Math.floor(i / config.cols);
           const visualCol = i % config.cols;

           let sequenceIndex;
           if (config.direction === 'column') {
             // Vertical Order: Sequence grows down columns first
             // Sequence = col_index * rows + row_index
             sequenceIndex = visualCol * config.rows + visualRow;
           } else {
             // Horizontal Order (Default): Sequence grows across rows
             // Sequence = row_index * cols + col_index (same as i)
             sequenceIndex = visualRow * config.cols + visualCol;
           }

           const isActive = sequenceIndex < config.totalFrames;
           return (
            <div 
              key={i} 
              className={`border-r border-b border-blue-400/20 ${!isActive ? 'bg-black/60 backdrop-grayscale' : 'hover:bg-blue-500/10 transition-colors'}`}
              style={{
                 borderColor: 'rgba(96, 165, 250, 0.3)'
              }}
            >
            </div>
          );
        })}
      </div>
    );
  };

  if (!imageUrl) {
    return (
      <div className="w-full h-full flex items-center justify-center text-slate-500 border-2 border-dashed border-slate-700 rounded-lg bg-slate-900/50 p-10">
        Upload an image to start
      </div>
    );
  }

  return (
    <div 
        className="relative shadow-2xl shadow-black/50 border border-slate-800 bg-[#0f1115]"
        style={{
            // Container fits the content natural size for infinite canvas
            display: 'inline-block',
            width: 'auto',
            height: 'auto',
        }}
    >
        <img
            ref={imgRef}
            src={imageUrl}
            alt="Sprite Sheet"
            className="block" 
            style={{ 
                imageRendering: 'pixelated',
                display: 'block',
                width: 'auto',
                height: 'auto',
                maxHeight: maxHeight ? `${maxHeight}px` : 'none'
            }} 
            onLoad={handleImageLoad}
        />
        {renderGridOverlay()}
    </div>
  );
};