import React from 'react';
import { BoardCell, MultiplierType, Tile as TileType } from '../types';
import { ROW_LABELS, COL_LABELS } from '../constants';
import Tile from './Tile';

interface BoardProps {
  board: BoardCell[][];
  className?: string;
  previewTiles?: { tile: TileType, row: number, col: number }[];
  highlightCells?: { row: number, col: number }[]; // New prop for highlighting specific cells (e.g., Master Move)
  isProjector?: boolean;
  onPreviewTileTouchStart?: (e: React.TouchEvent | React.MouseEvent, tile: TileType, row: number, col: number) => void;
}

const Board: React.FC<BoardProps> = ({ 
  board, 
  className = '', 
  previewTiles = [], 
  highlightCells = [], 
  isProjector = false,
  onPreviewTileTouchStart
}) => {
  
  const getCellColor = (m: MultiplierType) => {
    switch (m) {
      case MultiplierType.TripleWord: return 'bg-coral-400';
      case MultiplierType.DoubleWord: return 'bg-pink-300';
      case MultiplierType.TripleLetter: return 'bg-blue-500';
      case MultiplierType.DoubleLetter: return 'bg-sky-300';
      case MultiplierType.Center: return 'bg-pink-300';
      default: return 'bg-white';                               
    }
  };

  // Helper to get border color for preview tiles based on the cell multiplier they sit on
  const getPreviewBorderColor = (m: MultiplierType) => {
      switch (m) {
        case MultiplierType.TripleWord: return 'border-coral-500';
        case MultiplierType.DoubleWord: return 'border-pink-400';
        case MultiplierType.TripleLetter: return 'border-blue-600';
        case MultiplierType.DoubleLetter: return 'border-sky-400';
        case MultiplierType.Center: return 'border-pink-400';
        default: return 'border-[#e8d5b5]'; // Default standard tile border
      }
  };

  const getCellText = (m: MultiplierType) => {
    switch (m) {
      case MultiplierType.TripleWord: return 'TP';
      case MultiplierType.DoubleWord: return 'DP';
      case MultiplierType.TripleLetter: return 'TL';
      case MultiplierType.DoubleLetter: return 'DL';
      case MultiplierType.Center: return '★';
      default: return '';
    }
  };

  const getTextColor = (m: MultiplierType) => {
      switch (m) {
          case MultiplierType.DoubleWord:
          case MultiplierType.DoubleLetter:
              return 'text-mauve-800';
          case MultiplierType.Normal:
              return 'text-cream-200';
          default:
              return 'text-white';     
      }
  };

  // Unified 16x16 Grid Logic
  // Row 0: [Spacer] [1] [2] ... [15]
  // Row 1: [A] [Cell 0,0] ... [Cell 0,14]
  
  const gridItems = [];

  // --- Row 0 (Headers) ---
  // Corner spacer
  gridItems.push(
      <div key="corner" className="bg-pearl-200 border border-pearl-300"></div>
  );
  // Column Headers
  COL_LABELS.forEach(c => {
      gridItems.push(
          <div key={`head-col-${c}`} className={`flex items-center justify-center text-pearl-700 font-bold bg-pearl-200 border border-pearl-300 ${isProjector ? 'text-[1.8vh]' : 'text-[0.6rem] md:text-xs'}`}>
            {c}
          </div>
      );
  });

  // --- Rows 1-15 (Board) ---
  board.forEach((row, rIndex) => {
      // Row Label
      gridItems.push(
          <div key={`head-row-${rIndex}`} className={`flex items-center justify-center text-pearl-700 font-bold bg-pearl-200 border border-pearl-300 ${isProjector ? 'text-[1.8vh]' : 'text-[0.6rem] md:text-xs'}`}>
            {ROW_LABELS[rIndex]}
          </div>
      );

      // Board Cells
      row.forEach(cell => {
        const preview = previewTiles.find(p => p.row === rIndex && p.col === cell.col);
        const isHighlighted = highlightCells.some(h => h.row === rIndex && h.col === cell.col);
        
        const multiplierText = getCellText(cell.multiplier);
        const textColorClass = getTextColor(cell.multiplier);
        const isMultiplier = cell.multiplier !== MultiplierType.Normal;
        
        // Responsive text size for tiles (smaller on mobile)
        const tileTextSizeClass = isProjector 
            ? '' 
            : '!text-[10px] sm:!text-xs md:!text-base';

        gridItems.push(
            <div
                key={`cell-${cell.row}-${cell.col}`}
                className={`
                  relative flex items-center justify-center w-full h-full border border-mauve-200
                  ${getCellColor(cell.multiplier)}
                `}
            >
                {!cell.tile && !preview && multiplierText && (
                  <span className={`font-black select-none ${textColorClass} ${isProjector ? 'text-[1.4vh]' : 'text-[0.55rem] md:text-[0.65rem]'}`}>
                    {multiplierText}
                  </span>
                )}
                
                {/* Existing Board Tile */}
                {cell.tile && (
                   <Tile 
                     tile={cell.tile} 
                     size={isProjector ? 'xl' : 'md'} 
                     className={`
                       !w-full !h-full z-10 
                       border-amber-200
                       ${tileTextSizeClass}
                       ${isHighlighted ? '!bg-[#fde047] !text-black' : ''} 
                     `} 
                   />
                )}

                {/* Preview Tile (Current User Move) */}
                {preview  && (
                    <div 
                        className="absolute inset-0 z-30 touch-none"
                        onTouchStart={(e) => onPreviewTileTouchStart && onPreviewTileTouchStart(e, preview.tile, rIndex, cell.col)}
                        onMouseDown={(e) => onPreviewTileTouchStart && onPreviewTileTouchStart(e, preview.tile, rIndex, cell.col)}
                    >
                        <Tile 
                          tile={preview.tile} 
                          size={isProjector ? 'xl' : 'md'} 
                          className={`
                            !w-full !h-full font-black
                            !bg-[#fde047] 
                            ${isMultiplier ? `border-[2px] ${getPreviewBorderColor(cell.multiplier)}` : 'border border-[#c2a67a]'}
                            ${isProjector ? 'scale-100' : 'scale-105'} 
                            ${tileTextSizeClass}
                            ${onPreviewTileTouchStart ? 'cursor-grab active:cursor-grabbing' : ''}
                          `} 
                        />
                    </div>
                )}
            </div>
        );
      });
  });

  return (
    <div className={`relative bg-mauve-100 p-1 lg:p-2 flex flex-col justify-center aspect-square ${className} ${isProjector ? 'h-full w-auto' : 'w-full'}`}>
      <div className="grid grid-cols-[repeat(16,minmax(0,1fr))] grid-rows-[repeat(16,minmax(0,1fr))] gap-0 w-full h-full bg-mauve-200 border-2 border-mauve-300">
          {gridItems}
      </div>
    </div>
  );
};

export default Board;