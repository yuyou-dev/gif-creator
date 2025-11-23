import React, { useState, useEffect, useRef } from 'react';
import { 
  Upload, Download, Sparkles, RefreshCw, 
  Monitor, LayoutTemplate, User, 
  Settings2, FileImage, Ghost, Maximize,
  Pin, PinOff, Trash2, ArrowRight, ArrowDown,
  Copy, Zap, Play, History, ZoomIn, ZoomOut, X
} from 'lucide-react';
import { SpriteConfig, ImageDimensions, ProcessingState, GenerationConfig, ImageResolution, SavedGif, CanvasNodeData, Position } from './types';
import { SpriteCanvas } from './components/SpriteCanvas';
import { PreviewPlayer } from './components/PreviewPlayer';
import { CanvasNode } from './components/CanvasNode';
import { ConnectionLine } from './components/ConnectionLine';
import { analyzeSpriteSheet, generateSpriteVariant, generateActionSprite } from './services/geminiService';
import { generateGif } from './utils/gifBuilder';

const INITIAL_CONFIG: SpriteConfig = {
  rows: 4,
  cols: 4,
  totalFrames: 16,
  fps: 12,
  scale: 1,
  transparent: null,
  autoTransparent: true,
  direction: 'row' // Default to standard Row-Major, but user can toggle
};

const App: React.FC = () => {
  // Animation State
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState<ImageDimensions>({ width: 0, height: 0 });
  const [config, setConfig] = useState<SpriteConfig>(INITIAL_CONFIG);
  
  // Generation State
  const [genConfig, setGenConfig] = useState<GenerationConfig>({
    mode: 'template',
    templateImage: null,
    characterImage: null,
    prompt: "",
    actionPrompt: "",
    size: '2K'
  });
  
  // Template Persistence State
  const [isTemplateSaved, setIsTemplateSaved] = useState(false);

  // Global Processing State
  const [processingState, setProcessingState] = useState<ProcessingState>({ status: 'idle', progress: 0 });

  // History / Gallery State
  const [savedGifs, setSavedGifs] = useState<SavedGif[]>([]);
  const [isGalleryOpen, setIsGalleryOpen] = useState(false);

  // -- Infinite Canvas & Node State --
  const viewportRef = useRef<HTMLDivElement>(null);
  // Initial scale 0.8 for comfortable view with constrained node size
  const [viewport, setViewport] = useState({ scale: 0.8, x: 100, y: 100 });
  
  // Viewport Panning State
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef({ x: 0, y: 0 });

  // Node Dragging State
  const [isDraggingNode, setIsDraggingNode] = useState<string | null>(null);
  const nodeDragStart = useRef({ x: 0, y: 0 }); // Mouse position at start
  const initialNodePos = useRef({ x: 0, y: 0 }); // Node position at start

  // Nodes Data
  const [nodes, setNodes] = useState<CanvasNodeData[]>([]);

  // Max visual height for the source node
  const MAX_SOURCE_HEIGHT = 600;

  // -- Effects --
  
  // Load saved template from local storage on mount
  useEffect(() => {
    try {
      const savedTemplate = localStorage.getItem('spriteMotion_template');
      if (savedTemplate) {
        setGenConfig(prev => ({ ...prev, templateImage: savedTemplate }));
        setIsTemplateSaved(true);
      }
    } catch (e) {
      console.error("Failed to load saved template", e);
    }
  }, []);

  // Initialize Nodes when Image Loaded
  useEffect(() => {
    if (!imageUrl) {
        setNodes([]);
    } else {
        // Initial setup before dimensions are known
        if (nodes.length === 0) {
            setNodes([
                {
                    id: 'source',
                    type: 'source',
                    title: 'Sprite Sheet',
                    position: { x: 0, y: 0 },
                    width: 300,
                    height: 300
                },
                {
                    id: 'preview',
                    type: 'preview',
                    title: 'Animation',
                    position: { x: 400, y: 0 },
                    width: 420,
                    height: 460
                }
            ]);
        }
    }
  }, [imageUrl]);

  // Layout Update Effect: When dimensions change, update node sizes and layout to prevent overlap
  useEffect(() => {
    if (dimensions.width === 0 || nodes.length === 0) return;

    // Calculate constrained display dimensions
    let displayWidth = dimensions.width;
    let displayHeight = dimensions.height;

    // Constrain logic: Scale down if taller than MAX_SOURCE_HEIGHT
    if (displayHeight > MAX_SOURCE_HEIGHT) {
        const scale = MAX_SOURCE_HEIGHT / displayHeight;
        displayHeight = MAX_SOURCE_HEIGHT;
        displayWidth = dimensions.width * scale;
    }

    const padding = 16; // internal padding of node content
    const headerHeight = 40;
    const minSourceWidth = 300;
    
    // Calculate accurate dimensions for Source Node based on constrained image size
    const sourceNodeWidth = Math.max(minSourceWidth, displayWidth + padding);
    const sourceNodeHeight = displayHeight + headerHeight + padding;

    // Fixed dimensions for Preview Node (400px inner + padding + header)
    const previewNodeWidth = 420; 
    const previewNodeHeight = 400 + headerHeight + padding;

    const gap = 150; // Distance between nodes

    setNodes(prev => {
        // Keep current source position if dragging, otherwise default
        const sourceNode = prev.find(n => n.id === 'source');
        const sourcePos = sourceNode?.position || { x: 0, y: 0 };
        
        // Calculate where the preview node should be
        const newPreviewX = sourcePos.x + sourceNodeWidth + gap;
        // Align tops for stability
        const newPreviewY = sourcePos.y;

        return [
            {
                id: 'source',
                type: 'source',
                title: 'Sprite Sheet',
                position: sourcePos,
                width: sourceNodeWidth,
                height: sourceNodeHeight
            },
            {
                id: 'preview',
                type: 'preview',
                title: 'Animation',
                position: { 
                    x: newPreviewX, 
                    y: newPreviewY 
                },
                width: previewNodeWidth,
                height: previewNodeHeight
            }
        ];
    });
  }, [dimensions]); // Trigger when image dimensions are loaded/changed

  // -- Handlers --

  const handleToggleSaveTemplate = () => {
    if (!genConfig.templateImage) return;

    if (isTemplateSaved) {
      localStorage.removeItem('spriteMotion_template');
      setIsTemplateSaved(false);
    } else {
      try {
        localStorage.setItem('spriteMotion_template', genConfig.templateImage);
        setIsTemplateSaved(true);
      } catch (e) {
        console.error("Storage full or error", e);
        alert("Could not save template (file might be too large for browser storage).");
      }
    }
  };

  const handleLoadTemplateToCanvas = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (genConfig.templateImage) {
      setImageUrl(genConfig.templateImage);
      setConfig(prev => ({ ...INITIAL_CONFIG, scale: 1 })); 
      setProcessingState({ status: 'idle', progress: 0 });
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, target: 'main' | 'template' | 'character') => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        if (typeof ev.target?.result === 'string') {
          const res = ev.target.result;
          if (target === 'main') {
            setImageUrl(res);
            setProcessingState({ status: 'idle', progress: 0 });
            setConfig(prev => ({ ...INITIAL_CONFIG, scale: 1 }));
          } else if (target === 'template') {
            setGenConfig(prev => ({ ...prev, templateImage: res }));
            setIsTemplateSaved(false); 
          } else if (target === 'character') {
            setGenConfig(prev => ({ ...prev, characterImage: res }));
          }
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAutoDetect = async () => {
    if (!imageUrl) return;

    setProcessingState({ status: 'analyzing', progress: 0 });
    try {
      const result = await analyzeSpriteSheet(imageUrl);
      setConfig(prev => ({
        ...prev,
        rows: result.rows ?? prev.rows,
        cols: result.cols ?? prev.cols,
        totalFrames: result.totalFrames ?? ((result.rows || prev.rows) * (result.cols || prev.cols))
      }));
      setProcessingState({ status: 'idle', progress: 0 });
    } catch (error) {
      console.error("Detection failed", error);
      setProcessingState({ status: 'idle', progress: 0, error: 'AI detection failed. Please set manually.' });
    }
  };

  const handleGenerateSprite = async () => {
    if (genConfig.mode === 'template') {
        if (!genConfig.templateImage || !genConfig.characterImage) return;
    } else {
        if (!genConfig.characterImage || !genConfig.actionPrompt) return;
    }

    const aiStudio = (window as any).aistudio;
    if (aiStudio) {
        const hasKey = await aiStudio.hasSelectedApiKey();
        if (!hasKey) {
            try {
                await aiStudio.openSelectKey();
            } catch (e) {
                console.error("Key selection failed", e);
                return;
            }
        }
    }

    setProcessingState({ status: 'generating', progress: 0 });

    try {
      let resultBase64: string;

      if (genConfig.mode === 'template') {
          resultBase64 = await generateSpriteVariant(
            genConfig.templateImage!,
            genConfig.characterImage!,
            genConfig.prompt,
            genConfig.size
          );
      } else {
          resultBase64 = await generateActionSprite(
            genConfig.characterImage!,
            genConfig.actionPrompt,
            genConfig.prompt,
            genConfig.size
          );
      }

      setImageUrl(resultBase64);
      setProcessingState({ status: 'idle', progress: 0 });
    } catch (error: any) {
      console.error("Generation failed", error);
      let errorMessage = 'Generation failed. Please try again.';
      const errorString = JSON.stringify(error) + (error.message || '');
      
      if (errorString.includes('403') || errorString.includes('PERMISSION_DENIED')) {
          if (aiStudio) {
              try {
                  await aiStudio.openSelectKey();
                  errorMessage = 'Permission denied. Please select a valid API key with billing enabled.';
              } catch(e) {
                  console.error("Failed to reopen key selector", e);
              }
          }
      } else if (errorString.includes('503') || errorString.includes('overloaded')) {
          errorMessage = 'The AI model is currently overloaded with high traffic. Please wait a moment and try again.';
      }

      setProcessingState({ status: 'idle', progress: 0, error: errorMessage });
    }
  };

  const handleExport = async () => {
    if (!imageUrl) return;
    setProcessingState({ status: 'rendering', progress: 0 });

    try {
      const img = new Image();
      img.src = imageUrl;
      await img.decode();

      const blob = await generateGif(img, config, dimensions, (pct) => {
        setProcessingState(prev => ({ ...prev, progress: pct }));
      });

      const url = URL.createObjectURL(blob);
      
      const fileName = `sprite-${Date.now()}.gif`;
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      const newGif: SavedGif = {
        id: crypto.randomUUID(),
        url: url,
        name: fileName,
        timestamp: Date.now(),
        dimensions: { width: img.width, height: img.height }
      };
      setSavedGifs(prev => [newGif, ...prev]);

      setProcessingState({ status: 'completed', progress: 100 });
      setTimeout(() => setProcessingState({ status: 'idle', progress: 0 }), 2000);

    } catch (e) {
      console.error(e);
      setProcessingState({ status: 'idle', progress: 0, error: 'Failed to generate GIF.' });
    }
  };

  const updateConfig = (key: keyof SpriteConfig, value: any) => {
    setConfig(prev => {
       const next = { ...prev, [key]: value };
       if (key === 'rows' || key === 'cols') {
          if (prev.totalFrames === prev.rows * prev.cols) {
             next.totalFrames = next.rows * next.cols;
          }
       }
       return next;
    });
  };

  // -- Viewport & Drag Logic --
  
  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const zoomSensitivity = 0.001;
        const delta = -e.deltaY * zoomSensitivity;
        const newScale = Math.min(Math.max(0.1, viewport.scale + delta), 5);
        setViewport(prev => ({ ...prev, scale: newScale }));
    } else {
        setViewport(prev => ({ ...prev, x: prev.x - e.deltaX, y: prev.y - e.deltaY }));
    }
  };

  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    if (isDraggingNode) return; // Ignore if clicking a node header
    if (e.button === 0 || e.button === 1) { // Left or Middle click
        setIsPanning(true);
        panStart.current = { x: e.clientX - viewport.x, y: e.clientY - viewport.y };
    }
  };

  const handleNodeMouseDown = (e: React.MouseEvent, nodeId: string) => {
      e.stopPropagation();
      setIsDraggingNode(nodeId);
      nodeDragStart.current = { x: e.clientX, y: e.clientY };
      const node = nodes.find(n => n.id === nodeId);
      if (node) {
          initialNodePos.current = { x: node.position.x, y: node.position.y };
      }
  };

  const handleGlobalMouseMove = (e: React.MouseEvent) => {
      // 1. Panning Canvas
      if (isPanning) {
          setViewport(prev => ({
              ...prev,
              x: e.clientX - panStart.current.x,
              y: e.clientY - panStart.current.y
          }));
      }
      
      // 2. Dragging Node
      if (isDraggingNode) {
          const deltaX = (e.clientX - nodeDragStart.current.x) / viewport.scale;
          const deltaY = (e.clientY - nodeDragStart.current.y) / viewport.scale;
          
          setNodes(prev => prev.map(n => {
              if (n.id === isDraggingNode) {
                  return {
                      ...n,
                      position: {
                          x: initialNodePos.current.x + deltaX,
                          y: initialNodePos.current.y + deltaY
                      }
                  };
              }
              return n;
          }));
      }
  };

  const handleGlobalMouseUp = () => {
      setIsPanning(false);
      setIsDraggingNode(null);
  };

  const zoomIn = () => setViewport(prev => ({ ...prev, scale: Math.min(prev.scale + 0.1, 3) }));
  const zoomOut = () => setViewport(prev => ({ ...prev, scale: Math.max(prev.scale - 0.1, 0.1) }));
  const resetView = () => setViewport({ scale: 0.8, x: 100, y: 100 });

  // Helper to render connection
  const renderConnections = () => {
      if (nodes.length < 2) return null;
      const source = nodes.find(n => n.id === 'source');
      const preview = nodes.find(n => n.id === 'preview');
      
      if (source && preview && source.width && source.height && preview.height) {
          // Calculate center points for the connection ports based on node dimensions
          // Source Port: Right side, vertically centered
          const start = { 
              x: source.position.x + source.width, 
              y: source.position.y + (source.height / 2) 
          };
          
          // Preview Port: Left side, vertically centered
          const end = { 
              x: preview.position.x, 
              y: preview.position.y + (preview.height / 2)
          };
          
          return <ConnectionLine start={start} end={end} />;
      }
      return null;
  };

  return (
    <div className="h-screen bg-[#0f1115] text-slate-300 flex font-sans overflow-hidden">
      
      {/* SIDEBAR */}
      <aside className="w-[340px] flex-shrink-0 bg-[#15171e] border-r border-slate-800 flex flex-col h-full z-20 shadow-2xl relative">
        {/* Header */}
        <div className="h-14 flex items-center justify-between px-4 border-b border-slate-800 bg-[#1a1d26]">
           <div className="flex items-center space-x-2 text-indigo-400">
              <Ghost size={20} className="text-pink-500" />
              <span className="font-bold text-slate-100 tracking-tight">SpriteMotion</span>
              <span className="text-[10px] bg-indigo-500/10 text-indigo-400 px-1.5 rounded border border-indigo-500/20">PRO</span>
           </div>
           <button onClick={() => setIsGalleryOpen(true)} className="p-2 rounded hover:bg-slate-700 text-slate-400 hover:text-white transition-colors relative">
              <History size={18} />
              {savedGifs.length > 0 && <span className="absolute top-1 right-1 w-2 h-2 bg-pink-500 rounded-full"></span>}
           </button>
        </div>

        {/* Sidebar Content */}
        <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-700 p-4 space-y-6">
           {/* Synthesis Section */}
           <div className="space-y-4">
              <div className="flex items-center space-x-2 text-xs font-bold text-slate-500 uppercase tracking-widest">
                <Sparkles size={12} className="text-violet-500" />
                <span>Synthesis</span>
              </div>
              
              <div className="flex bg-slate-800/50 p-1 rounded-lg border border-slate-700">
                <button 
                  onClick={() => setGenConfig(prev => ({...prev, mode: 'template'}))}
                  className={`flex-1 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded transition-all flex items-center justify-center space-x-1 ${genConfig.mode === 'template' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}
                >
                   <Copy size={12} /><span>Replica</span>
                </button>
                <button 
                  onClick={() => setGenConfig(prev => ({...prev, mode: 'action'}))}
                  className={`flex-1 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded transition-all flex items-center justify-center space-x-1 ${genConfig.mode === 'action' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}
                >
                   <Zap size={12} /><span>Creative</span>
                </button>
              </div>

              {genConfig.mode === 'template' && (
                <div className="grid grid-cols-2 gap-3">
                   <div className="space-y-1 relative h-32">
                      <label className="block relative cursor-pointer group h-full">
                         <div className={`rounded-lg border-2 border-dashed flex flex-col items-center justify-center text-center p-2 transition-all h-full ${genConfig.templateImage ? 'border-indigo-500/50 bg-indigo-500/5' : 'border-slate-700 bg-slate-800/50 hover:border-slate-500'}`}>
                            {genConfig.templateImage ? (
                               <img src={genConfig.templateImage} className="w-full h-full object-contain" alt="Template" />
                            ) : (
                               <>
                                  <LayoutTemplate size={20} className="mb-1 text-slate-500" />
                                  <span className="text-[10px] text-slate-500">Template</span>
                               </>
                            )}
                         </div>
                         <input type="file" accept="image/*" onChange={(e) => handleFileChange(e, 'template')} className="hidden" />
                      </label>
                      {genConfig.templateImage && (
                        <>
                            <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleToggleSaveTemplate(); }} className={`absolute -top-2 -right-2 p-1.5 rounded-full shadow-md border border-slate-700 transition-all z-20 ${isTemplateSaved ? 'bg-indigo-500 text-white hover:bg-red-500' : 'bg-slate-800 text-slate-400 hover:text-white'}`}>
                              {isTemplateSaved ? <Pin size={10} fill="currentColor" /> : <Pin size={10} />}
                            </button>
                            <button onClick={handleLoadTemplateToCanvas} className="absolute bottom-1 right-1 p-1.5 rounded bg-black/50 hover:bg-cyan-500 text-white backdrop-blur-sm transition-all z-20 border border-white/10 shadow-sm">
                                <Play size={10} fill="currentColor" />
                            </button>
                        </>
                      )}
                   </div>
                   <div className="space-y-1 h-32">
                      <label className="block relative cursor-pointer group h-full">
                         <div className={`rounded-lg border-2 border-dashed flex flex-col items-center justify-center text-center p-2 transition-all h-full ${genConfig.characterImage ? 'border-pink-500/50 bg-pink-500/5' : 'border-slate-700 bg-slate-800/50 hover:border-slate-500'}`}>
                            {genConfig.characterImage ? (
                               <img src={genConfig.characterImage} className="w-full h-full object-contain" alt="Character" />
                            ) : (
                               <>
                                  <User size={20} className="mb-1 text-slate-500" />
                                  <span className="text-[10px] text-slate-500">Character</span>
                               </>
                            )}
                         </div>
                         <input type="file" accept="image/*" onChange={(e) => handleFileChange(e, 'character')} className="hidden" />
                      </label>
                   </div>
                </div>
              )}

              {genConfig.mode === 'action' && (
                  <div className="space-y-3">
                      <div className="h-32">
                        <label className="block relative cursor-pointer group h-full">
                            <div className={`rounded-lg border-2 border-dashed flex flex-col items-center justify-center text-center p-2 transition-all h-full ${genConfig.characterImage ? 'border-pink-500/50 bg-pink-500/5' : 'border-slate-700 bg-slate-800/50 hover:border-slate-500'}`}>
                                {genConfig.characterImage ? (
                                    <img src={genConfig.characterImage} className="w-full h-full object-contain" alt="Character" />
                                ) : (
                                    <>
                                        <User size={24} className="mb-2 text-slate-500" />
                                        <span className="text-xs text-slate-500 font-medium">Upload Character</span>
                                    </>
                                )}
                            </div>
                            <input type="file" accept="image/*" onChange={(e) => handleFileChange(e, 'character')} className="hidden" />
                        </label>
                      </div>
                      <div className="relative">
                          <textarea 
                             value={genConfig.actionPrompt}
                             onChange={(e) => setGenConfig(prev => ({...prev, actionPrompt: e.target.value}))}
                             placeholder="Describe action..."
                             className="w-full h-20 bg-[#0f1115] border border-slate-700 rounded p-2 text-xs text-slate-200 focus:border-indigo-500 outline-none resize-none placeholder-slate-600"
                          />
                      </div>
                  </div>
              )}

              <div className="space-y-2">
                 <input type="text" value={genConfig.prompt} onChange={(e) => setGenConfig(prev => ({...prev, prompt: e.target.value}))} placeholder="Style prompt..." className="w-full bg-[#0f1115] border border-slate-700 rounded px-2 py-2 text-xs text-slate-200 focus:border-indigo-500 outline-none placeholder-slate-600" />
                 <div className="flex space-x-1">
                    {(['1K', '2K', '4K'] as ImageResolution[]).map((res) => (
                       <button key={res} onClick={() => setGenConfig(prev => ({...prev, size: res}))} className={`flex-1 py-1 text-[10px] font-bold rounded border transition-all ${genConfig.size === res ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-transparent border-slate-700 text-slate-500 hover:text-slate-300'}`}>{res}</button>
                    ))}
                 </div>
                 <button 
                    onClick={handleGenerateSprite}
                    disabled={processingState.status === 'generating' || (genConfig.mode === 'template' ? (!genConfig.templateImage || !genConfig.characterImage) : (!genConfig.characterImage || !genConfig.actionPrompt))}
                    className="w-full py-2.5 rounded bg-gradient-to-r from-violet-600 to-pink-600 text-white font-bold text-xs shadow-lg hover:shadow-pink-500/20 transition-all flex items-center justify-center space-x-2 disabled:opacity-50"
                 >
                     {processingState.status === 'generating' ? <RefreshCw size={14} className="animate-spin" /> : <Sparkles size={14} />}
                     <span>{genConfig.mode === 'template' ? 'REPLICATE' : 'CREATE'}</span>
                 </button>
              </div>
           </div>

           <div className="h-px bg-slate-800 w-full" />

           {/* Configuration Section */}
           <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2 text-xs font-bold text-slate-500 uppercase tracking-widest">
                    <Settings2 size={12} className="text-cyan-500" /><span>Config</span>
                </div>
                <label className="cursor-pointer text-[10px] text-indigo-400 flex items-center bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">
                    <Upload size={10} className="mr-1"/> Override
                    <input type="file" accept="image/*" onChange={(e) => handleFileChange(e, 'main')} className="hidden" />
                </label>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                 <div><span className="text-slate-500 block mb-1">Rows</span><input type="number" value={config.rows} onChange={(e) => updateConfig('rows', parseInt(e.target.value) || 1)} className="w-full bg-[#0f1115] border border-slate-700 rounded px-2 py-1 text-slate-200" /></div>
                 <div><span className="text-slate-500 block mb-1">Cols</span><input type="number" value={config.cols} onChange={(e) => updateConfig('cols', parseInt(e.target.value) || 1)} className="w-full bg-[#0f1115] border border-slate-700 rounded px-2 py-1 text-slate-200" /></div>
              </div>

               <div className="grid grid-cols-2 gap-2 text-xs">
                    <button onClick={() => updateConfig('direction', 'row')} className={`flex items-center justify-center space-x-1 py-1.5 rounded border ${config.direction === 'row' ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-400' : 'bg-slate-800 border-slate-700 text-slate-500'}`}><ArrowRight size={12} /><span>Horz</span></button>
                    <button onClick={() => updateConfig('direction', 'column')} className={`flex items-center justify-center space-x-1 py-1.5 rounded border ${config.direction === 'column' ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-400' : 'bg-slate-800 border-slate-700 text-slate-500'}`}><ArrowDown size={12} /><span>Vert</span></button>
               </div>

              <div className="space-y-3">
                 <div>
                    <div className="flex justify-between text-[10px] text-slate-500 mb-1"><span>Frames</span><span className="text-cyan-400">{config.totalFrames}</span></div>
                    <input type="range" min="1" max={config.rows * config.cols} value={config.totalFrames} onChange={(e) => updateConfig('totalFrames', parseInt(e.target.value))} className="w-full accent-cyan-500 h-1 bg-slate-800 rounded-lg appearance-none" />
                 </div>
                 <div>
                    <div className="flex justify-between text-[10px] text-slate-500 mb-1"><span>FPS</span><span className="text-cyan-400">{config.fps}</span></div>
                    <input type="range" min="1" max={60} value={config.fps} onChange={(e) => updateConfig('fps', parseInt(e.target.value))} className="w-full accent-cyan-500 h-1 bg-slate-800 rounded-lg appearance-none" />
                 </div>
              </div>
              
               <button onClick={handleAutoDetect} disabled={!imageUrl} className="w-full py-1.5 text-xs bg-slate-800 border border-slate-700 rounded text-slate-400 flex items-center justify-center space-x-2 disabled:opacity-50">
                 {processingState.status === 'analyzing' ? <RefreshCw size={12} className="animate-spin" /> : <Monitor size={12} />}<span>Auto-Detect</span>
               </button>

               <div className="h-px bg-slate-800 w-full my-2" />

               {/* Export Settings */}
               <div className="space-y-3 pt-2">
                  <label className="flex items-center space-x-2 cursor-pointer select-none">
                     <input type="checkbox" checked={config.autoTransparent} onChange={(e) => updateConfig('autoTransparent', e.target.checked)} className="rounded bg-slate-900 border-slate-700 text-cyan-500 focus:ring-0" />
                     <span className="text-xs text-slate-400">Transparent BG</span>
                  </label>
                  <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-500">Export Scale</span>
                      <div className="flex space-x-1">
                          {[1, 2, 4].map((scaleVal) => (
                              <button key={scaleVal} onClick={() => updateConfig('scale', scaleVal)} className={`px-2 py-0.5 text-[10px] rounded border ${config.scale === scaleVal ? 'bg-cyan-600 border-cyan-500 text-white' : 'bg-transparent border-slate-700 text-slate-500 hover:text-slate-300'}`}>{scaleVal}x</button>
                          ))}
                      </div>
                  </div>
                  <button onClick={handleExport} disabled={!imageUrl || processingState.status === 'rendering'} className="w-full py-3 rounded bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs shadow-lg shadow-cyan-900/20 transition-all flex items-center justify-center space-x-2 disabled:opacity-50">
                     {processingState.status === 'rendering' ? <RefreshCw size={14} className="animate-spin" /> : <Download size={14} />}<span>EXPORT GIF</span>
                  </button>
               </div>
           </div>
        </div>
        
        <div className="p-3 border-t border-slate-800 bg-[#0f1115] text-[10px] text-slate-500 font-mono">
            {processingState.error ? <span className="text-red-400">{processingState.error}</span> : <span className="truncate">{processingState.status === 'idle' ? 'Ready' : processingState.status + '...'}</span>}
        </div>
      </aside>

      {/* MAIN CONTENT: Infinite Node Canvas */}
      <main className="flex-1 flex flex-col bg-[#111217] relative">
         {/* Top Overlay Controls */}
         <div className="h-14 flex items-center justify-between px-6 z-20 absolute top-0 w-full pointer-events-none">
             <div className="flex items-center space-x-4 pointer-events-auto bg-[#15171e]/80 backdrop-blur rounded-full px-4 py-1.5 border border-white/5 mt-4">
                <FileImage size={14} className="text-slate-400" />
                <span className="text-xs font-medium text-slate-300">Canvas</span>
             </div>
             <div className="flex items-center space-x-2 pointer-events-auto bg-[#15171e]/80 backdrop-blur rounded-full px-2 py-1 border border-white/5 mt-4">
                 <button onClick={zoomOut} className="p-1.5 text-slate-400 hover:text-white rounded hover:bg-white/10"><ZoomOut size={14} /></button>
                 <span className="text-[10px] w-8 text-center text-slate-500 font-mono">{Math.round(viewport.scale * 100)}%</span>
                 <button onClick={zoomIn} className="p-1.5 text-slate-400 hover:text-white rounded hover:bg-white/10"><ZoomIn size={14} /></button>
                 <div className="w-px h-4 bg-white/10 mx-1"></div>
                 <button onClick={resetView} className="p-1.5 text-slate-400 hover:text-white rounded hover:bg-white/10"><Maximize size={14} /></button>
             </div>
         </div>

         {/* Interactive Area */}
         <div 
            ref={viewportRef}
            className="flex-1 overflow-hidden relative bg-[#0b0c10] cursor-default"
            onWheel={handleWheel}
            onMouseDown={handleCanvasMouseDown}
            onMouseMove={handleGlobalMouseMove}
            onMouseUp={handleGlobalMouseUp}
            onMouseLeave={handleGlobalMouseUp}
         >
             {/* Grid Background Pattern */}
             <div 
                className="absolute inset-0 pointer-events-none opacity-20"
                style={{
                    backgroundImage: `linear-gradient(to right, #334155 1px, transparent 1px), linear-gradient(to bottom, #334155 1px, transparent 1px)`,
                    backgroundSize: `${20 * viewport.scale}px ${20 * viewport.scale}px`,
                    backgroundPosition: `${viewport.x}px ${viewport.y}px`
                }}
             />

             {/* World Container */}
             <div 
                className="w-full h-full transform origin-top-left will-change-transform"
                style={{
                    transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`
                }}
             >
                 {/* Layer 1: Connections */}
                 {renderConnections()}

                 {/* Layer 2: Nodes */}
                 {nodes.map(node => (
                     <CanvasNode 
                        key={node.id} 
                        data={node} 
                        isSelected={false} 
                        onMouseDown={handleNodeMouseDown}
                     >
                         {node.type === 'source' ? (
                             <div className="relative min-w-[200px] min-h-[200px] flex items-center justify-center bg-black/40 rounded-b-lg overflow-hidden">
                                {imageUrl ? (
                                    <SpriteCanvas 
                                        imageUrl={imageUrl} 
                                        config={config} 
                                        onDimensionsLoaded={setDimensions} 
                                        maxHeight={MAX_SOURCE_HEIGHT} 
                                    />
                                ) : (
                                    <div className="text-slate-600 text-xs p-8 text-center">No image loaded</div>
                                )}
                             </div>
                         ) : (
                             <div className="w-full h-full bg-black/50 rounded-b-lg p-2" style={{ width: '400px', height: '400px' }}>
                                <PreviewPlayer imageUrl={imageUrl} config={config} dimensions={dimensions} />
                             </div>
                         )}
                     </CanvasNode>
                 ))}
                 
                 {!imageUrl && (
                     <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div className="text-center opacity-30">
                            <Ghost size={64} className="mx-auto mb-4" />
                            <p className="text-lg font-light">Infinite Canvas Ready</p>
                        </div>
                     </div>
                 )}
             </div>
         </div>
      </main>

      {/* Gallery Modal */}
      {isGalleryOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-[#15171e] w-[800px] max-w-[90vw] h-[600px] max-h-[90vh] rounded-xl border border-slate-800 shadow-2xl flex flex-col">
                <div className="flex items-center justify-between p-4 border-b border-slate-800">
                    <h2 className="text-lg font-bold text-white">History</h2>
                    <button onClick={() => setIsGalleryOpen(false)}><X size={20} className="text-slate-400" /></button>
                </div>
                <div className="flex-1 overflow-y-auto p-4">
                    <div className="grid grid-cols-4 gap-4">
                        {savedGifs.map((gif) => (
                            <div key={gif.id} className="bg-slate-800 p-2 rounded border border-slate-700">
                                <img src={gif.url} className="w-full h-auto" alt="gif" />
                                <div className="text-[10px] text-slate-500 mt-1">{gif.name}</div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
      )}

    </div>
  );
};

export default App;