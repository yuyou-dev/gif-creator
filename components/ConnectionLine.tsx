import React from 'react';
import { Position } from '../types';

interface ConnectionLineProps {
  start: Position;
  end: Position;
}

export const ConnectionLine: React.FC<ConnectionLineProps> = ({ start, end }) => {
  // Determine control points for a smooth Bezier curve
  // We want the line to exit horizontally from the start and enter horizontally to the end
  const curvature = 0.5;
  const dist = Math.abs(end.x - start.x);
  
  // Adjust control points based on distance
  const cp1 = { x: start.x + dist * curvature, y: start.y };
  const cp2 = { x: end.x - dist * curvature, y: end.y };

  const pathData = `M ${start.x} ${start.y} C ${cp1.x} ${cp1.y} ${cp2.x} ${cp2.y} ${end.x} ${end.y}`;

  return (
    <svg className="absolute top-0 left-0 w-full h-full pointer-events-none overflow-visible z-0">
      {/* Shadow/Outline for visibility on dark backgrounds */}
      <path
        d={pathData}
        stroke="#0f172a"
        strokeWidth="6"
        fill="none"
        strokeLinecap="round"
      />
      {/* The actual line */}
      <path
        d={pathData}
        stroke="#6366f1" // indigo-500
        strokeWidth="2"
        fill="none"
        className="animate-pulse-slow"
        strokeDasharray="10 5"
      />
      
      {/* Animated Flow Dot */}
      <circle r="4" fill="#a5b4fc">
        <animateMotion dur="2s" repeatCount="indefinite" path={pathData} />
      </circle>
    </svg>
  );
};
