import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { ZoomIn, ZoomOut, Loader2 } from "lucide-react";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";

// Set worker source for version 4.x
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

interface PDFViewerProps {
  url: string;
  className?: string;
}

export function PDFViewer({ url, className = "" }: PDFViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRefs = useRef<Map<number, HTMLCanvasElement>>(new Map());
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [totalPages, setTotalPages] = useState(0);
  const [scale, setScale] = useState(() => {
    const saved = localStorage.getItem('pdf_viewer_zoom');
    return saved ? parseFloat(saved) : 1.5;
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [renderedPages, setRenderedPages] = useState<Set<number>>(new Set());
  const renderingRef = useRef<Set<number>>(new Set());

  // Save zoom level to localStorage when it changes
  useEffect(() => {
    localStorage.setItem('pdf_viewer_zoom', scale.toString());
  }, [scale]);

  // Load PDF document
  useEffect(() => {
    const loadPDF = async () => {
      setLoading(true);
      setError(null);
      setRenderedPages(new Set());
      renderingRef.current = new Set();
      
      try {
        const loadingTask = pdfjsLib.getDocument(url);
        const pdf = await loadingTask.promise;
        setPdfDoc(pdf);
        setTotalPages(pdf.numPages);
      } catch (err) {
        console.error("Error loading PDF:", err);
        setError("PDF konnte nicht geladen werden");
      } finally {
        setLoading(false);
      }
    };

    loadPDF();
  }, [url]);

  // Render a single page
  const renderPage = useCallback(async (pageNum: number) => {
    if (!pdfDoc) return;
    
    const canvas = canvasRefs.current.get(pageNum);
    if (!canvas) return;
    
    // Prevent duplicate rendering
    if (renderingRef.current.has(pageNum)) return;
    renderingRef.current.add(pageNum);

    try {
      const page = await pdfDoc.getPage(pageNum);
      const context = canvas.getContext("2d");
      
      if (!context) return;

      const devicePixelRatio = window.devicePixelRatio || 1;
      const viewport = page.getViewport({ scale });
      
      canvas.width = viewport.width * devicePixelRatio;
      canvas.height = viewport.height * devicePixelRatio;
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      
      context.scale(devicePixelRatio, devicePixelRatio);

      const renderContext = {
        canvasContext: context,
        viewport: viewport,
      };

      await page.render(renderContext).promise;
      setRenderedPages(prev => new Set(prev).add(pageNum));
    } catch (err: any) {
      if (err?.name !== "RenderingCancelledException") {
        console.error("Error rendering page:", pageNum, err);
      }
    } finally {
      renderingRef.current.delete(pageNum);
    }
  }, [pdfDoc, scale]);

  // Render all pages when PDF loads or scale changes
  useEffect(() => {
    if (!pdfDoc || totalPages === 0) return;
    
    setRenderedPages(new Set());
    renderingRef.current = new Set();
    
    // Render all pages
    for (let i = 1; i <= totalPages; i++) {
      renderPage(i);
    }
  }, [pdfDoc, totalPages, scale, renderPage]);

  const setCanvasRef = (pageNum: number, element: HTMLCanvasElement | null) => {
    if (element) {
      canvasRefs.current.set(pageNum, element);
    } else {
      canvasRefs.current.delete(pageNum);
    }
  };

  const zoomIn = () => {
    setScale((prev) => Math.min(prev + 0.2, 3));
  };

  const zoomOut = () => {
    setScale((prev) => Math.max(prev - 0.2, 0.5));
  };

  if (loading) {
    return (
      <div className={`flex items-center justify-center h-full ${className}`}>
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className={`flex items-center justify-center h-full ${className}`}>
        <p className="text-destructive">{error}</p>
      </div>
    );
  }

  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* Controls */}
      <div className="flex items-center justify-between p-2 border-b bg-muted/30">
        <span className="text-sm text-muted-foreground">
          {totalPages} {totalPages === 1 ? 'Seite' : 'Seiten'}
        </span>
        
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={zoomOut}>
            <ZoomOut className="h-4 w-4" />
          </Button>
          <span className="text-sm min-w-[50px] text-center">
            {Math.round(scale * 100)}%
          </span>
          <Button variant="ghost" size="sm" onClick={zoomIn}>
            <ZoomIn className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* All Pages Container */}
      <div
        ref={containerRef}
        className="flex-1 overflow-auto flex flex-col items-center gap-4 p-4 bg-muted/20"
      >
        {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => (
          <div key={pageNum} className="relative">
            <canvas
              ref={(el) => setCanvasRef(pageNum, el)}
              className="shadow-lg bg-white"
            />
            {!renderedPages.has(pageNum) && (
              <div className="absolute inset-0 flex items-center justify-center bg-muted/50">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            )}
            <div className="absolute bottom-2 right-2 text-xs text-muted-foreground bg-background/80 px-2 py-1 rounded">
              {pageNum} / {totalPages}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
