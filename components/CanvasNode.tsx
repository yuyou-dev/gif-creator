import React from 'react';
import { GripHorizontal, Maximize2 } from 'lucide-react';
import { CanvasNodeData } from '../types';

interface CanvasNodeProps {
  data: CanvasNodeData;
  isSelected: boolean;
  children: React.ReactNode;
  onMouseDown: (e: React.MouseEvent, nodeId: string) => void;
}

export const CanvasNode: React.FC<CanvasNodeProps> = ({ data, isSelected, children, onMouseDown }) => {
  return (
    <div
      className={`absolute flex flex-col rounded-xl shadow-2xl transition-shadow duration-200 group
        ${isSelected ? 'ring-2 ring-indigo-500 shadow-indigo-500/20' : 'shadow-black/50'}
      `}
      style={{
        transform: `translate(${data.position.x}px, ${data.position.y}px)`,
        width: data.width ? `${data.width}px` : 'auto',
        backgroundColor: '#1e293b', // slate-800
        border: '1px solid #334155', // slate-700
        minWidth: '300px'
      }}
    >
      {/* Input Port */}
      {data.type === 'preview' && (
        <div className="absolute top-1/2 -left-3 w-4 h-4 rounded-full bg-indigo-500 border-2 border-slate-900 z-50 shadow-sm" />
      )}

      {/* Header / Drag Handle */}
      <div
        onMouseDown={(e) => onMouseDown(e, data.id)}
        className={`
          h-10 px-4 flex items-center justify-between rounded-t-xl cursor-grab active:cursor-grabbing border-b border-slate-700
          ${data.type === 'source' ? 'bg-gradient-to-r from-slate-800 to-slate-700' : 'bg-gradient-to-r from-indigo-900/50 to-slate-800'}
        `}
      >
        <div className="flex items-center space-x-2">
          <div className={`w-2 h-2 rounded-full ${data.type === 'source' ? 'bg-emerald-400' : 'bg-pink-500'}`} />
          <span className="text-xs font-bold text-slate-200 uppercase tracking-wide">{data.title}</span>
        </div>
        <GripHorizontal size={14} className="text-slate-500" />
      </div>

      {/* Content */}
      <div className="p-1 relative">
        {children}
      </div>

      {/* Output Port */}
      {data.type === 'source' && (
        <div className="absolute top-1/2 -right-2 w-4 h-4 rounded-full bg-emerald-500 border-2 border-slate-900 z-50 shadow-sm transition-transform group-hover:scale-125" />
      )}
    </div>
  );
};
