import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Upload, Download, Move, Settings, Trash2, Layers, Sliders, Maximize, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
import Pica from 'pica';

// Constants for the fixed portrait canvas
const CANVAS_WIDTH = 1200;
const CANVAS_HEIGHT = 1800;
const DEFAULT_ZOOM = 0.25;  // 25% default magnification

// Initialize pica for high-quality image processing
const pica = Pica();

export default function App() {
  const [images, setImages] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [gutter, setGutter] = useState({ top: 100, bottom: 100 });
  const [quality, setQuality] = useState(0.8);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [isProcessing, setIsProcessing] = useState(false);
  const [displaySize, setDisplaySize] = useState({ width: 420, height: 630 });

  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);

  const currentImage = images[currentIndex];

  // Calculate responsive canvas display size
  useEffect(() => {
    const updateSize = () => {
      // Available height = viewport - header(40px) - controls(80px) - gaps(100px)
      const availableHeight = window.innerHeight - 220;
      const maxHeight = Math.min(availableHeight, 720);
      const ratio = maxHeight / CANVAS_HEIGHT;
      setDisplaySize({
        width: Math.round(CANVAS_WIDTH * ratio),
        height: Math.round(CANVAS_HEIGHT * ratio)
      });
    };
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  // Reset transforms whenever the image in the queue changes
  useEffect(() => {
    setZoom(DEFAULT_ZOOM);
    setOffset({ x: 0, y: 0 });
  }, [currentIndex]);

  // Main Drawing Logic for the Preview Canvas
  useEffect(() => {
    if (!currentImage || !canvasRef.current) return;

    const ctx = canvasRef.current.getContext('2d');
    const img = new Image();
    img.src = currentImage.url;

    img.onload = () => {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      const drawWidth = img.width * zoom;
      const drawHeight = img.height * zoom;
      const centerX = (CANVAS_WIDTH - drawWidth) / 2 + offset.x;
      const centerY = (CANVAS_HEIGHT - drawHeight) / 2 + offset.y;

      ctx.drawImage(img, centerX, centerY, drawWidth, drawHeight);

      // Orange gutter visualization
      ctx.fillStyle = 'rgba(255, 120, 0, 0.25)';
      ctx.fillRect(0, 0, CANVAS_WIDTH, gutter.top);
      ctx.fillRect(0, CANVAS_HEIGHT - gutter.bottom, CANVAS_WIDTH, gutter.bottom);

      ctx.strokeStyle = 'rgba(255, 100, 0, 0.9)';
      ctx.setLineDash([15, 10]);
      ctx.lineWidth = 4;

      ctx.beginPath();
      ctx.moveTo(0, gutter.top);
      ctx.lineTo(CANVAS_WIDTH, gutter.top);
      ctx.moveTo(0, CANVAS_HEIGHT - gutter.bottom);
      ctx.lineTo(CANVAS_WIDTH, CANVAS_HEIGHT - gutter.bottom);
      ctx.stroke();
      ctx.setLineDash([]);

      // Blue vertical center line
      ctx.strokeStyle = 'rgba(59, 130, 246, 0.7)';
      ctx.setLineDash([20, 8]);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(CANVAS_WIDTH / 2, 0);
      ctx.lineTo(CANVAS_WIDTH / 2, CANVAS_HEIGHT);
      ctx.stroke();
      ctx.setLineDash([]);
    };
  }, [currentImage, zoom, offset, gutter]);

  const onFileChange = (e) => {
    const files = Array.from(e.target.files);
    const newImages = files.map(file => ({
      file,
      url: URL.createObjectURL(file),
      name: file.name
    }));
    setImages(prev => [...prev, ...newImages]);
  };

  // Drag and Pan Logic
  const handleMouseDown = (e) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;
    setOffset({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
  };

  const handleMouseUp = () => setIsDragging(false);

  // High-quality export using Pica
  const handleCropAndDownload = useCallback(async () => {
    if (!currentImage || isProcessing) return;
    setIsProcessing(true);

    try {
      const img = new Image();
      img.src = currentImage.url;

      await new Promise((resolve) => { img.onload = resolve; });

      // Create source canvas with the composed image
      const sourceCanvas = document.createElement('canvas');
      sourceCanvas.width = CANVAS_WIDTH;
      sourceCanvas.height = CANVAS_HEIGHT;
      const sourceCtx = sourceCanvas.getContext('2d');

      sourceCtx.fillStyle = '#ffffff';
      sourceCtx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      const drawWidth = img.width * zoom;
      const drawHeight = img.height * zoom;
      const centerX = (CANVAS_WIDTH - drawWidth) / 2 + offset.x;
      const centerY = (CANVAS_HEIGHT - drawHeight) / 2 + offset.y;

      sourceCtx.drawImage(img, centerX, centerY, drawWidth, drawHeight);

      // Use Pica for high-quality processing (maintains quality even at full res)
      const exportCanvas = document.createElement('canvas');
      exportCanvas.width = CANVAS_WIDTH;
      exportCanvas.height = CANVAS_HEIGHT;

      await pica.resize(sourceCanvas, exportCanvas, {
        quality: 3, // Highest quality
        alpha: false,
        unsharpAmount: 80,
        unsharpRadius: 0.6,
        unsharpThreshold: 2
      });

      // Export with pica's optimized blob generation
      const blob = await pica.toBlob(exportCanvas, 'image/jpeg', quality);

      const link = document.createElement('a');
      link.download = `studioflow_${currentImage.name.split('.')[0]}.jpg`;
      link.href = URL.createObjectURL(blob);
      link.click();
      URL.revokeObjectURL(link.href);

      // Cleanup source object URL to free memory
      URL.revokeObjectURL(currentImage.url);

      // Move to next image
      if (currentIndex < images.length - 1) {
        setCurrentIndex(prev => prev + 1);
      } else {
        setImages([]);
        setCurrentIndex(0);
      }
    } catch (error) {
      console.error('Export failed:', error);
    } finally {
      setIsProcessing(false);
    }
  }, [currentImage, currentIndex, images.length, zoom, offset, quality, isProcessing]);

  const handleZoomIn = () => setZoom(prev => Math.min(prev + 0.1, 3));
  const handleZoomOut = () => setZoom(prev => Math.max(prev - 0.1, 0.05));
  const handleResetZoom = () => {
    setZoom(DEFAULT_ZOOM);
    setOffset({ x: 0, y: 0 });
  };

  return (
    <div className="h-screen overflow-hidden bg-slate-900 text-slate-100 flex font-sans">

      {/* Sidebar - Compact controls */}
      <aside className="w-80 bg-slate-800 border-r border-slate-700 flex flex-col h-screen">
        <div className="p-5 border-b border-slate-700 shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center text-white">
                <Layers size={18} />
              </div>
              <h1 className="text-lg font-bold text-white">StudioFlow</h1>
            </div>
            {images.length > 0 && (
              <button onClick={() => setImages([])} className="text-slate-400 hover:text-red-400 transition-colors">
                <Trash2 size={16} />
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-6">

          {/* Upload */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full py-6 border-2 border-dashed border-slate-600 rounded-xl hover:border-orange-500 hover:bg-slate-700/50 transition-all flex flex-col items-center gap-2 group"
          >
            <Upload className="text-slate-400 group-hover:text-orange-500" size={24} />
            <span className="text-sm font-medium text-slate-300">Import Images</span>
            <input type="file" ref={fileInputRef} multiple className="hidden" onChange={onFileChange} accept="image/*" />
          </button>

          {images.length > 0 && (
            <>
              {/* Queue */}
              <div>
                <div className="flex justify-between items-center mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                  <span>Queue</span>
                  <span className="text-orange-500">{currentIndex + 1}/{images.length}</span>
                </div>
                <div className="flex gap-1.5 overflow-x-auto pb-2 scrollbar-hide">
                  {images.map((img, idx) => (
                    <button
                      key={idx}
                      onClick={() => setCurrentIndex(idx)}
                      className={`min-w-[40px] h-12 rounded-md border-2 transition-all overflow-hidden ${idx === currentIndex ? 'border-orange-500 ring-2 ring-orange-500/30' : 'border-slate-600 opacity-50 hover:opacity-80'}`}
                    >
                      <img src={img.url} className="w-full h-full object-cover" alt="thumb" />
                    </button>
                  ))}
                </div>
              </div>

              {/* Compression */}
              <div className="bg-slate-700/50 p-4 rounded-xl space-y-3">
                <h2 className="text-[10px] uppercase tracking-widest text-slate-400 font-bold flex items-center gap-2">
                  <Sliders size={12} /> Export Quality
                </h2>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-300">JPEG</span>
                  <span className="text-orange-500 font-bold">{(quality * 100).toFixed(0)}%</span>
                </div>
                <input
                  type="range" min="0.1" max="1.0" step="0.05" value={quality}
                  onChange={(e) => setQuality(parseFloat(e.target.value))}
                  className="w-full h-1 bg-slate-600 rounded-lg appearance-none cursor-pointer accent-orange-500"
                />
              </div>

              {/* Gutters */}
              <div className="bg-slate-700/50 p-4 rounded-xl space-y-3">
                <h2 className="text-[10px] uppercase tracking-widest text-slate-400 font-bold flex items-center gap-2">
                  <Settings size={12} /> Safe Zones (px)
                </h2>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] text-slate-500 uppercase">Top</label>
                    <input
                      type="number" value={gutter.top}
                      onChange={(e) => setGutter(p => ({ ...p, top: parseInt(e.target.value) || 0 }))}
                      className="w-full bg-slate-600 border-0 rounded-lg p-2 text-xs text-white mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 uppercase">Bottom</label>
                    <input
                      type="number" value={gutter.bottom}
                      onChange={(e) => setGutter(p => ({ ...p, bottom: parseInt(e.target.value) || 0 }))}
                      className="w-full bg-slate-600 border-0 rounded-lg p-2 text-xs text-white mt-1"
                    />
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Export Button */}
        {images.length > 0 && (
          <div className="p-5 border-t border-slate-700 shrink-0">
            <button
              onClick={handleCropAndDownload}
              disabled={isProcessing}
              className="w-full bg-orange-500 hover:bg-orange-600 disabled:bg-slate-600 text-white font-bold py-3.5 rounded-xl flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
            >
              {isProcessing ? (
                <span className="animate-pulse">Processing...</span>
              ) : (
                <>
                  <Download size={18} />
                  <span>Save & Next</span>
                </>
              )}
            </button>
            <p className="text-center text-[9px] text-slate-500 mt-3 font-mono">
              1200 × 1800px JPEG
            </p>
          </div>
        )}
      </aside>

      {/* Main Workspace */}
      <main className="flex-1 flex flex-col items-center justify-center bg-slate-900 relative overflow-hidden">
        {images.length === 0 ? (
          <div className="text-center opacity-40">
            <Maximize size={48} className="mx-auto mb-4 text-slate-600" />
            <p className="text-sm text-slate-500">Import images to begin</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-6">
            {/* Image name */}
            <div className="flex items-center gap-4">
              <span className="text-xs font-medium text-slate-400 truncate max-w-[200px]">
                {currentImage.name}
              </span>
              <span className="bg-slate-800 px-2 py-1 rounded text-[10px] font-mono text-slate-500">
                {CANVAS_WIDTH}×{CANVAS_HEIGHT}
              </span>
            </div>

            {/* Canvas Frame */}
            <div
              className="relative shadow-2xl shadow-black/50 rounded-lg overflow-hidden cursor-move bg-white"
              style={{
                width: displaySize.width,
                height: displaySize.height,
              }}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
            >
              <canvas
                ref={canvasRef}
                width={CANVAS_WIDTH}
                height={CANVAS_HEIGHT}
                className="w-full h-full pointer-events-none"
              />
            </div>

            {/* Magnification Controls - Below Canvas */}
            <div className="flex items-center gap-4 bg-slate-800 px-5 py-3 rounded-xl">
              <button
                onClick={handleZoomOut}
                className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-700 hover:bg-slate-600 transition-colors"
              >
                <ZoomOut size={16} />
              </button>

              <div className="flex items-center gap-3 min-w-[180px]">
                <Move size={14} className="text-slate-500" />
                <input
                  type="range" min="0.05" max="3" step="0.01" value={zoom}
                  onChange={(e) => setZoom(parseFloat(e.target.value))}
                  className="flex-1 h-1 bg-slate-600 rounded-lg appearance-none cursor-pointer accent-orange-500"
                />
                <span className="text-sm font-bold text-orange-500 min-w-[45px] text-right">
                  {(zoom * 100).toFixed(0)}%
                </span>
              </div>

              <button
                onClick={handleZoomIn}
                className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-700 hover:bg-slate-600 transition-colors"
              >
                <ZoomIn size={16} />
              </button>

              <div className="w-px h-5 bg-slate-700" />

              <button
                onClick={handleResetZoom}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 transition-colors text-xs"
              >
                <RotateCcw size={12} />
                Reset
              </button>
            </div>

            {/* Drag hint */}
            <p className="text-[10px] text-slate-600">
              Drag to reposition • Scroll or use controls to zoom
            </p>
          </div>
        )}
      </main>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #475569; border-radius: 10px; }
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        
        input[type="range"]::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 14px;
          height: 14px;
          background: white;
          border: 2px solid #f97316;
          border-radius: 50%;
          cursor: pointer;
        }
      `}</style>
    </div>
  );
}
