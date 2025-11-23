import { SpriteConfig, ImageDimensions } from "../types";

// Define the GIF type from the library (loaded via CDN in index.html)
declare class GIF {
  constructor(options: any);
  addFrame(element: any, options?: any): void;
  on(event: string, callback: (data: any) => void): void;
  render(): void;
}

/**
 * Fetches the gif.worker.js code from CDN and creates a Blob URL.
 */
const getWorkerBlobUrl = async () => {
  const response = await fetch('https://cdnjs.cloudflare.com/ajax/libs/gif.js/0.2.0/gif.worker.js');
  const text = await response.text();
  const blob = new Blob([text], { type: 'application/javascript' });
  return URL.createObjectURL(blob);
};

// Magenta as the key color for transparency
const KEY_COLOR_RGB = [255, 0, 255]; 
const KEY_COLOR_HEX = 0xff00ff;

/**
 * Replaces the detected background color with the Key Color (Magenta).
 * This allows gif.js to treat Magenta as transparent.
 */
const applyChromaKey = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
  const frameData = ctx.getImageData(0, 0, width, height);
  const data = frameData.data;
  
  // Sample top-left pixel as the background reference
  const rBg = data[0];
  const gBg = data[1];
  const bBg = data[2];
  
  // Tolerance for compression artifacts
  const tolerance = 20; 

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];

    // If pixel matches the background color OR is already transparent
    if (
      (Math.abs(r - rBg) < tolerance &&
      Math.abs(g - gBg) < tolerance &&
      Math.abs(b - bBg) < tolerance) || 
      a < 10
    ) {
      // Set to Key Color (Magenta) and fully opaque
      data[i] = KEY_COLOR_RGB[0];
      data[i + 1] = KEY_COLOR_RGB[1];
      data[i + 2] = KEY_COLOR_RGB[2];
      data[i + 3] = 255; 
    }
  }

  ctx.putImageData(frameData, 0, 0);
};

export const generateGif = async (
  image: HTMLImageElement,
  config: SpriteConfig,
  dimensions: ImageDimensions,
  onProgress: (pct: number) => void
): Promise<Blob> => {
  const workerUrl = await getWorkerBlobUrl();

  return new Promise((resolve, reject) => {
    const gifOptions: any = {
      workers: 2,
      quality: 1,
      dither: false,
      width: (dimensions.width / config.cols) * config.scale,
      height: (dimensions.height / config.rows) * config.scale,
      workerScript: workerUrl,
    };

    // If transparency is requested, set the transparent key color
    if (config.autoTransparent) {
      gifOptions.transparent = KEY_COLOR_HEX;
    }

    const gif = new GIF(gifOptions);

    const frameWidth = dimensions.width / config.cols;
    const frameHeight = dimensions.height / config.rows;
    const delay = 1000 / config.fps; 

    const canvas = document.createElement('canvas');
    canvas.width = frameWidth * config.scale;
    canvas.height = frameHeight * config.scale;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    if (!ctx) {
      reject("Could not create canvas context");
      return;
    }

    ctx.imageSmoothingEnabled = false;

    // Iterate up to totalFrames using the configured direction
    for (let i = 0; i < config.totalFrames; i++) {
        // Calculate Row and Col based on direction logic
        let row, col;
        if (config.direction === 'column') {
            // Vertical: i=0 is (0,0), i=1 is (1,0)
            row = i % config.rows;
            col = Math.floor(i / config.rows);
        } else {
            // Horizontal (Standard): i=0 is (0,0), i=1 is (0,1)
            col = i % config.cols;
            row = Math.floor(i / config.cols);
        }

        // Safety check to prevent reading outside image
        if (row >= config.rows || col >= config.cols) continue;

        // 1. Prepare Canvas
        if (config.autoTransparent) {
            // Fill with Key Color (Magenta) to ensure empty areas are transparent
            ctx.fillStyle = '#ff00ff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        } else {
            // Standard clear
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }

        // 2. Draw scaled image slice
        ctx.drawImage(
          image,
          col * frameWidth, 
          row * frameHeight, 
          frameWidth, 
          frameHeight, 
          0, 
          0, 
          canvas.width, 
          canvas.height 
        );

        // 3. Apply Chroma Key if needed (replaces image BG with Magenta)
        if (config.autoTransparent) {
          applyChromaKey(ctx, canvas.width, canvas.height);
        }

        gif.addFrame(ctx, { copy: true, delay: delay });
    }

    gif.on('progress', (p: number) => {
      onProgress(Math.round(p * 100));
    });

    gif.on('finished', (blob: Blob) => {
      resolve(blob);
      URL.revokeObjectURL(workerUrl); 
    });

    gif.render();
  });
};