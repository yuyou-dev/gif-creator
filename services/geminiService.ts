import { GoogleGenAI, Type } from "@google/genai";
import { SpriteConfig, ImageResolution } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function retryOperation<T>(operation: () => Promise<T>, retries = 3, delay = 1000): Promise<T> {
  try {
    return await operation();
  } catch (error: any) {
    const isOverloaded = 
      error.status === 503 || 
      error.code === 503 || 
      (error.message && error.message.includes('overloaded'));

    if (retries > 0 && isOverloaded) {
      console.warn(`Model overloaded. Retrying in ${delay}ms... (${retries} retries left)`);
      await sleep(delay);
      return retryOperation(operation, retries - 1, delay * 2);
    }
    throw error;
  }
}

/**
 * Calculates the closest supported aspect ratio for the Gemini API
 * based on the input image dimensions.
 * Supported: "1:1", "3:4", "4:3", "9:16", "16:9"
 */
const determineAspectRatio = (base64Image: string): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const ratio = img.width / img.height;
      
      const supported = [
        { label: "1:1", value: 1.0 },
        { label: "3:4", value: 0.75 },
        { label: "4:3", value: 1.3333 },
        { label: "9:16", value: 0.5625 },
        { label: "16:9", value: 1.7778 },
      ];

      // Find the closest match
      let closest = supported[0];
      let minDiff = Math.abs(ratio - closest.value);

      for (let i = 1; i < supported.length; i++) {
        const diff = Math.abs(ratio - supported[i].value);
        if (diff < minDiff) {
          minDiff = diff;
          closest = supported[i];
        }
      }
      
      console.log(`Detected Template Ratio: ${ratio.toFixed(2)} (${img.width}x${img.height}) -> Using Gemini Aspect Ratio: ${closest.label}`);
      resolve(closest.label);
    };
    
    img.onerror = () => {
       console.warn("Could not load image to determine aspect ratio, defaulting to 1:1");
       resolve("1:1");
    };
    
    img.src = base64Image;
  });
};

export const analyzeSpriteSheet = async (base64Image: string): Promise<Partial<SpriteConfig>> => {
  try {
    // Clean base64 string if it has the prefix
    const cleanBase64 = base64Image.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, "");

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: 'image/png',
              data: cleanBase64
            }
          },
          {
            text: `Analyze this sprite sheet image. It contains a sequence of animation frames arranged in a grid.
            Count the number of rows and columns. 
            Also estimate the total number of valid frames (sometimes the last row is not full).
            Return the result in JSON format.`
          }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            rows: { type: Type.INTEGER, description: "Number of rows in the grid" },
            cols: { type: Type.INTEGER, description: "Number of columns in the grid" },
            totalFrames: { type: Type.INTEGER, description: "Total actual frames (sprites) in the image" },
          },
          required: ["rows", "cols", "totalFrames"],
        }
      }
    });

    if (response.text) {
      const data = JSON.parse(response.text);
      return {
        rows: data.rows,
        cols: data.cols,
        totalFrames: data.totalFrames
      };
    }
    throw new Error("No response text from Gemini");

  } catch (error) {
    console.error("Gemini Analysis Error:", error);
    throw error;
  }
};

export const generateSpriteVariant = async (
  templateBase64: string,
  characterBase64: string,
  prompt: string,
  size: ImageResolution
): Promise<string> => {
  // Determine best aspect ratio from the template image
  const targetAspectRatio = await determineAspectRatio(templateBase64);

  return retryOperation(async () => {
    try {
      const cleanTemplate = templateBase64.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, "");
      const cleanCharacter = characterBase64.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, "");

      // Construct the prompt
      const textPrompt = `
        Create a high-quality pixel art sprite sheet based on the visual style of the character provided in the second image.
        CRITICAL INSTRUCTIONS:
        1. The layout, grid structure, and poses MUST EXACTLY match the first image (the template sprite sheet).
        2. DO NOT STRETCH the sprites. Maintain the original internal aspect ratio of the characters.
        3. If the output aspect ratio (${targetAspectRatio}) differs from the template, add padding (empty space) rather than stretching the content.
        4. Apply the character's appearance (colors, clothing, features) to the poses in the template.
        ${prompt ? `Additional instructions: ${prompt}` : ''}
      `;

      // We must recreate the AI client here to ensure it picks up any newly selected API key
      const genClient = new GoogleGenAI({ apiKey: process.env.API_KEY });

      const response = await genClient.models.generateContent({
        model: 'gemini-3-pro-image-preview',
        contents: {
          parts: [
            { text: textPrompt },
            {
              inlineData: {
                mimeType: 'image/png',
                data: cleanTemplate
              }
            },
             {
              inlineData: {
                mimeType: 'image/png',
                data: cleanCharacter
              }
            }
          ]
        },
        config: {
          imageConfig: {
            imageSize: size,
            aspectRatio: targetAspectRatio 
          }
        }
      });

      // Iterate to find the image part
      if (response.candidates?.[0]?.content?.parts) {
        for (const part of response.candidates[0].content.parts) {
          if (part.inlineData) {
            return `data:image/png;base64,${part.inlineData.data}`;
          }
        }
      }

      throw new Error("No image generated in response");

    } catch (error) {
      console.error("Gemini Generation Error:", error);
      throw error;
    }
  });
};

export const generateActionSprite = async (
  characterBase64: string,
  actionPrompt: string,
  stylePrompt: string,
  size: ImageResolution
): Promise<string> => {
  return retryOperation(async () => {
    try {
      const cleanCharacter = characterBase64.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, "");

      const textPrompt = `
        Create a high-quality pixel art sprite sheet for game animation.
        
        REFERENCE CHARACTER:
        See the attached image. You MUST maintain the exact identity, colors, and design of this character.

        ACTION:
        ${actionPrompt}

        REQUIREMENTS:
        1. Generate a sequence of animation frames showing the character performing the action.
        2. Arrange the frames in a clean, regular GRID (e.g., 3x3, 4x4, 5x5, or a horizontal strip) so they can be easily sliced.
        3. Ensure consistent sizing and positioning for each frame.
        4. Visual Style: ${stylePrompt || "Match the reference character's style"}.
        5. Background: Solid uniform color (easy to remove) or transparent.
        
        OUTPUT FORMAT:
        A single image file containing the sprite sheet.
      `;

      const genClient = new GoogleGenAI({ apiKey: process.env.API_KEY });

      const response = await genClient.models.generateContent({
        model: 'gemini-3-pro-image-preview',
        contents: {
          parts: [
            { text: textPrompt },
            {
              inlineData: {
                mimeType: 'image/png',
                data: cleanCharacter
              }
            }
          ]
        },
        config: {
          imageConfig: {
            imageSize: size,
            aspectRatio: "1:1" // Default to square for new actions
          }
        }
      });

      if (response.candidates?.[0]?.content?.parts) {
        for (const part of response.candidates[0].content.parts) {
          if (part.inlineData) {
            return `data:image/png;base64,${part.inlineData.data}`;
          }
        }
      }

      throw new Error("No image generated in response");

    } catch (error) {
      console.error("Gemini Action Generation Error:", error);
      throw error;
    }
  });
};