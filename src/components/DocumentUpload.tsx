import { useState, useCallback, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Upload, FileText, X, Download, Loader2, Eye, FileCheck, Star, GripVertical } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PDFViewer } from "@/components/PDFViewer";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface DocumentUploadProps {
  candidateId: string;
  candidateName: string;
}

interface Document {
  name: string;
  path: string;
  created_at: string;
  size: number;
}

interface CachedUrl {
  url: string;
  expiresAt: number;
}

export function DocumentUpload({ candidateId, candidateName }: DocumentUploadProps) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<{ url: string; name: string; type: string } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [markedCvPath, setMarkedCvPath] = useState<string | null>(null);
  const [documentOrder, setDocumentOrder] = useState<string[]>([]);
  const [draggedDocPath, setDraggedDocPath] = useState<string | null>(null);
  const [dragOverDocPath, setDragOverDocPath] = useState<string | null>(null);
  
  // Cache for signed URLs (valid for 50 minutes, URLs expire after 60)
  const urlCacheRef = useRef<Map<string, CachedUrl>>(new Map());

  // Load marked CV and document order from localStorage
  useEffect(() => {
    const storedCv = localStorage.getItem(`cv_document_${candidateId}`);
    if (storedCv) {
      setMarkedCvPath(storedCv);
    }
    
    const storedOrder = localStorage.getItem(`document_order_${candidateId}`);
    if (storedOrder) {
      try {
        setDocumentOrder(JSON.parse(storedOrder));
      } catch (e) {
        console.error('Error parsing document order:', e);
      }
    }
  }, [candidateId]);

  // Save document order to localStorage
  const saveDocumentOrder = (order: string[]) => {
    setDocumentOrder(order);
    localStorage.setItem(`document_order_${candidateId}`, JSON.stringify(order));
  };

  // Mark/unmark document as CV
  const toggleCvMark = (docPath: string) => {
    if (markedCvPath === docPath) {
      // Unmark
      localStorage.removeItem(`cv_document_${candidateId}`);
      setMarkedCvPath(null);
      toast({
        title: "CV-Markierung entfernt",
        description: "Das Dokument ist nicht mehr als Lebenslauf markiert.",
      });
    } else {
      // Mark as CV
      localStorage.setItem(`cv_document_${candidateId}`, docPath);
      setMarkedCvPath(docPath);
      toast({
        title: "Als Lebenslauf markiert",
        description: "Das Dokument wird nun als Lebenslauf angezeigt.",
      });
    }
  };

  // Sort documents: CV first, then by custom order or date
  const sortedDocuments = [...documents].sort((a, b) => {
    // CV always first
    if (a.path === markedCvPath) return -1;
    if (b.path === markedCvPath) return 1;
    
    // Then by custom order if exists
    const orderA = documentOrder.indexOf(a.path);
    const orderB = documentOrder.indexOf(b.path);
    
    if (orderA !== -1 && orderB !== -1) {
      return orderA - orderB;
    }
    if (orderA !== -1) return -1;
    if (orderB !== -1) return 1;
    
    // Finally by date
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  // Document drag handlers for reordering
  const handleDocDragStart = (e: React.DragEvent, docPath: string) => {
    e.stopPropagation();
    setDraggedDocPath(docPath);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', docPath);
  };

  const handleDocDragOver = (e: React.DragEvent, docPath: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (draggedDocPath && draggedDocPath !== docPath && docPath !== markedCvPath) {
      setDragOverDocPath(docPath);
    }
  };

  const handleDocDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverDocPath(null);
  };

  const handleDocDrop = (e: React.DragEvent, targetPath: string) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!draggedDocPath || draggedDocPath === targetPath || targetPath === markedCvPath) {
      setDraggedDocPath(null);
      setDragOverDocPath(null);
      return;
    }

    // Get current order (excluding CV)
    const nonCvDocs = sortedDocuments.filter(d => d.path !== markedCvPath);
    const currentOrder = nonCvDocs.map(d => d.path);
    
    const fromIndex = currentOrder.indexOf(draggedDocPath);
    const toIndex = currentOrder.indexOf(targetPath);
    
    if (fromIndex !== -1 && toIndex !== -1) {
      const newOrder = [...currentOrder];
      newOrder.splice(fromIndex, 1);
      newOrder.splice(toIndex, 0, draggedDocPath);
      saveDocumentOrder(newOrder);
      
      toast({
        title: "Reihenfolge geändert",
        description: "Die Dokument-Reihenfolge wurde aktualisiert.",
      });
    }
    
    setDraggedDocPath(null);
    setDragOverDocPath(null);
  };

  const handleDocDragEnd = () => {
    setDraggedDocPath(null);
    setDragOverDocPath(null);
  };

  // Dokumente laden
  const loadDocuments = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.storage
        .from('candidate-documents')
        .list(`${candidateId}/`, {
          sortBy: { column: 'created_at', order: 'desc' }
        });

      if (error) throw error;

      if (data) {
        setDocuments(data.map(file => ({
          name: file.name,
          path: `${candidateId}/${file.name}`,
          created_at: file.created_at,
          size: file.metadata?.size || 0
        })));
      }
    } catch (error) {
      console.error('Error loading documents:', error);
      toast({
        title: t("toast.error"),
        description: t("documents.loadError"),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [candidateId, toast, t]);

  // Pre-load signed URLs for all PDF documents
  const preloadUrls = useCallback(async (docs: Document[]) => {
    const pdfDocs = docs.filter(doc => getFileType(doc.name) === 'pdf');
    
    // Create signed URLs for all PDFs in parallel
    await Promise.all(
      pdfDocs.map(async (doc) => {
        try {
          await getCachedOrSignedUrl(doc.path);
        } catch (error) {
          console.error('Error pre-loading URL for:', doc.name, error);
        }
      })
    );
  }, []);

  // Cleanup orphaned CV marks (when marked document was deleted)
  useEffect(() => {
    if (markedCvPath && documents.length > 0) {
      const cvExists = documents.some(d => d.path === markedCvPath);
      if (!cvExists) {
        localStorage.removeItem(`cv_document_${candidateId}`);
        setMarkedCvPath(null);
      }
    }
  }, [documents, markedCvPath, candidateId]);

  // Initial load
  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  // Pre-load URLs when documents change
  useEffect(() => {
    if (documents.length > 0) {
      preloadUrls(documents);
    }
  }, [documents, preloadUrls]);

  // Sanitize filename for Supabase storage (remove special characters and UUID prefixes)
  const sanitizeFileName = (fileName: string): string => {
    // Get file extension
    const lastDot = fileName.lastIndexOf('.');
    let name = lastDot > 0 ? fileName.substring(0, lastDot) : fileName;
    const ext = lastDot > 0 ? fileName.substring(lastDot) : '';
    
    // Remove UUID prefix (format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx_)
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}_/i;
    name = name.replace(uuidPattern, '');
    
    // Replace umlauts and special characters
    const sanitized = name
      .replace(/ä/gi, 'ae')
      .replace(/ö/gi, 'oe')
      .replace(/ü/gi, 'ue')
      .replace(/ß/g, 'ss')
      .replace(/\s+/g, '_') // Replace spaces with underscores
      .replace(/[^a-zA-Z0-9_\-]/g, '') // Remove all other special chars
      .substring(0, 100); // Limit length
    
    return sanitized + ext.toLowerCase();
  };

  // Normalize filename for CV detection (remove separators, make lowercase)
  const normalizeForCvDetection = (fileName: string): string => {
    return fileName
      .toLowerCase()
      .replace(/\.(pdf|doc|docx)$/i, '') // FIRST remove file extension
      .replace(/[._\-\s]+/g, ''); // THEN remove dots, underscores, dashes, spaces
  };

  // Check if filename indicates a CV/resume - check for common CV-related terms
  const isCvFileName = (fileName: string): boolean => {
    const lowerName = fileName.toLowerCase();
    
    // CV keywords to check for
    const cvKeywords = ['lebenslauf', 'cv', 'resume', 'résumé', 'curriculum', 'bewerbung', 'vita'];
    
    return cvKeywords.some(keyword => lowerName.includes(keyword));
  };

  // Check if this is likely the first/main CV document
  // Logic: First uploaded PDF that doesn't have keywords suggesting it's something else
  const isLikelyCvDocument = (fileName: string, isFirstPdf: boolean): boolean => {
    const lowerName = fileName.toLowerCase();
    
    // First check if it explicitly matches CV keywords
    if (isCvFileName(fileName)) {
      return true;
    }
    
    // Keywords that indicate it's NOT a CV
    const nonCvKeywords = [
      'zeugnis', 'zeugnisse', 'certificate', 'certificates', 'cert',
      'diplom', 'diploma', 'abschluss',
      'arbeitszeugnis', 'arbeitszeugnisse', 'reference', 'referenz',
      'empfehlung', 'recommendation', 'letter',
      'portfolio', 'projekt', 'project', 'sample', 'beispiel',
      'foto', 'photo', 'bild', 'image', 'picture',
      'anhang', 'attachment', 'anlage', 'anlagen',
      'rechnung', 'invoice', 'vertrag', 'contract',
      'ausweis', 'passport', 'id', 'führerschein', 'license',
      'motivationsschreiben', 'anschreiben', 'cover',
      'gehaltsabrechnung', 'payslip', 'lohnabrechnung',
    ];
    
    // If any non-CV keyword is found, it's not a CV
    if (nonCvKeywords.some(keyword => lowerName.includes(keyword))) {
      return false;
    }
    
    // For PDFs: If it's the first PDF and doesn't have exclusion keywords,
    // assume it's likely the CV (common pattern: people name CVs after themselves)
    const isPdf = lowerName.endsWith('.pdf');
    if (isPdf && isFirstPdf) {
      return true;
    }
    
    return false;
  };

  // Datei hochladen
  const uploadFile = async (file: File, isFirstPdf: boolean = false) => {
    setUploading(true);
    try {
      const fileName = sanitizeFileName(file.name);
      const filePath = `${candidateId}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('candidate-documents')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: true // Allow overwriting if file with same name exists
        });

      if (uploadError) throw uploadError;

      // Auto-detect and mark CV - if filename explicitly indicates CV, always mark (replacing existing)
      const isExplicitCv = isCvFileName(file.name);
      const shouldMarkAsCv = isExplicitCv || (!markedCvPath && isLikelyCvDocument(file.name, isFirstPdf));

      if (shouldMarkAsCv) {
        const previouslyMarked = markedCvPath !== null;
        localStorage.setItem(`cv_document_${candidateId}`, filePath);
        setMarkedCvPath(filePath);
        toast({
          title: previouslyMarked ? "Neuer Lebenslauf erkannt" : "Lebenslauf erkannt",
          description: previouslyMarked 
            ? "Das Dokument wurde als CV markiert (ersetzt bisherige Markierung)."
            : "Das Dokument wurde automatisch als CV markiert.",
        });
      }

      // Log activity for document upload
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from('activity_logs').insert({
          user_id: user.id,
          entity_type: 'candidates',
          entity_id: candidateId,
          action: 'DOCUMENT_UPLOAD',
          new_data: { file_name: fileName, file_path: filePath }
        });
      }

      toast({
        title: t("documents.uploaded"),
        description: `${file.name} ${t("documents.uploadedDesc")}`,
      });

      await loadDocuments();
    } catch (error: any) {
      console.error('Error uploading file:', error);
      toast({
        title: t("toast.error"),
        description: error.message || t("documents.uploadError"),
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  // Mehrere Dateien hochladen
  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const allowedTypes = [
      'application/pdf',
      'image/jpeg',
      'image/jpg',
      'image/png',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ];

    // Check if there are currently no documents (first upload scenario)
    const hasNoDocuments = documents.length === 0;
    
    // Find the first PDF in the upload batch
    let firstPdfIndex = -1;
    for (let i = 0; i < files.length; i++) {
      if (files[i].type === 'application/pdf') {
        firstPdfIndex = i;
        break;
      }
    }

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      
      if (!allowedTypes.includes(file.type)) {
        toast({
          title: t("documents.invalidType"),
          description: `${file.name} ${t("documents.invalidTypeDesc")}`,
          variant: "destructive",
        });
        continue;
      }

      if (file.size > 50 * 1024 * 1024) {
        toast({
          title: t("documents.fileTooLarge"),
          description: `${file.name} ${t("documents.fileTooLargeDesc")}`,
          variant: "destructive",
        });
        continue;
      }

      // Mark as first PDF if: no documents exist yet AND this is the first PDF in the batch
      const isFirstPdf = hasNoDocuments && i === firstPdfIndex;
      await uploadFile(file, isFirstPdf);
    }
  };

  // Datei löschen
  const deleteDocument = async (path: string, name: string) => {
    try {
      const { error } = await supabase.storage
        .from('candidate-documents')
        .remove([path]);

      if (error) throw error;

      // Log activity for document deletion
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from('activity_logs').insert({
          user_id: user.id,
          entity_type: 'candidates',
          entity_id: candidateId,
          action: 'DOCUMENT_DELETE',
          new_data: { file_name: name, file_path: path }
        });
      }

      toast({
        title: t("documents.deleted"),
        description: `${name} ${t("documents.deletedDesc")}`,
      });

      await loadDocuments();
    } catch (error) {
      console.error('Error deleting document:', error);
      toast({
        title: t("toast.error"),
        description: t("documents.deleteError"),
        variant: "destructive",
      });
    }
  };

  // Datei herunterladen
  const downloadDocument = async (path: string, name: string) => {
    try {
      const { data, error } = await supabase.storage
        .from('candidate-documents')
        .download(path);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading document:', error);
      toast({
        title: t("toast.error"),
        description: t("documents.downloadError"),
        variant: "destructive",
      });
    }
  };

  // Drag & Drop Handlers
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    const files = e.dataTransfer.files;
    handleFiles(files);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const getFileType = (fileName: string): string => {
    const ext = fileName.split('.').pop()?.toLowerCase() || '';
    if (['pdf'].includes(ext)) return 'pdf';
    if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) return 'image';
    return 'other';
  };

  // Get cached URL or create new signed URL
  const getCachedOrSignedUrl = async (path: string): Promise<string> => {
    const cached = urlCacheRef.current.get(path);
    const now = Date.now();
    
    // Return cached URL if still valid (with 10 min buffer)
    if (cached && cached.expiresAt > now) {
      return cached.url;
    }
    
    // Create new signed URL
    const { data, error } = await supabase.storage
      .from('candidate-documents')
      .createSignedUrl(path, 3600); // 1 hour validity

    if (error) throw error;
    
    // Cache with 50 min expiry (URLs valid for 60 min)
    urlCacheRef.current.set(path, {
      url: data.signedUrl,
      expiresAt: now + 50 * 60 * 1000
    });
    
    return data.signedUrl;
  };

  const openPreview = async (doc: Document) => {
    const fileType = getFileType(doc.name);
    
    // Check cache first for instant preview
    const cachedUrl = urlCacheRef.current.get(doc.path);
    const isCacheValid = cachedUrl && cachedUrl.expiresAt > Date.now();
    
    if (isCacheValid && fileType === 'pdf') {
      // Instant preview from cache
      setPreviewDoc({ url: cachedUrl.url, name: doc.name, type: fileType });
      setPreviewLoading(false);
      return;
    }
    
    // Open dialog immediately with loading state
    setPreviewDoc({ url: '', name: doc.name, type: fileType });
    setPreviewLoading(true);
    
    try {
      if (fileType === 'pdf') {
        const url = await getCachedOrSignedUrl(doc.path);
        setPreviewDoc({ url, name: doc.name, type: fileType });
      } else {
        // For images, use blob URL
        const { data, error } = await supabase.storage
          .from('candidate-documents')
          .download(doc.path);

        if (error) throw error;

        const url = URL.createObjectURL(data);
        setPreviewDoc({ url, name: doc.name, type: fileType });
      }
    } catch (error) {
      console.error('Error loading preview:', error);
      setPreviewDoc(null);
      toast({
        title: t("toast.error"),
        description: t("documents.previewError") || "Vorschau konnte nicht geladen werden",
        variant: "destructive",
      });
    } finally {
      setPreviewLoading(false);
    }
  };

  const closePreview = () => {
    // Only revoke blob URLs (not signed URLs)
    if (previewDoc?.url && previewDoc.url.startsWith('blob:')) {
      URL.revokeObjectURL(previewDoc.url);
    }
    setPreviewDoc(null);
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t("documents.title")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Upload Area */}
          <div
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
              isDragging
                ? 'border-primary bg-primary/5'
                : 'border-muted-foreground/25 hover:border-muted-foreground/50'
            }`}
          >
            <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm text-muted-foreground mb-2">
              {t("documents.dragHere")}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const input = document.createElement('input');
                input.type = 'file';
                input.multiple = true;
                input.accept = '.pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx';
                input.onchange = (e) => {
                  const files = (e.target as HTMLInputElement).files;
                  handleFiles(files);
                };
                input.click();
              }}
              disabled={uploading}
            >
              {uploading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {t("documents.uploading")}
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  {t("documents.selectFile")}
                </>
              )}
            </Button>
            <p className="text-xs text-muted-foreground mt-2">
              {t("documents.allowedTypes")}
            </p>
          </div>

          {/* Documents List */}
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : sortedDocuments.length > 0 ? (
            <TooltipProvider>
              <div className="space-y-2">
                {/* Marked CV - highlighted at top */}
                {markedCvPath && sortedDocuments.find(d => d.path === markedCvPath) && (
                  <>
                    {sortedDocuments.filter(d => d.path === markedCvPath).map((doc) => (
                      <div
                        key={doc.path}
                        className="flex items-center justify-between p-3 border-2 border-primary/50 bg-primary/5 rounded-lg hover:bg-primary/10 transition-colors cursor-pointer"
                        onClick={() => openPreview(doc)}
                      >
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div className="relative">
                            <FileCheck className="h-5 w-5 text-primary flex-shrink-0" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium truncate">{doc.name}</p>
                              <span className="text-xs bg-primary/20 text-primary px-2 py-0.5 rounded-full font-medium flex-shrink-0">
                                Lebenslauf
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {formatFileSize(doc.size)} • {new Date(doc.created_at).toLocaleDateString('de-DE')}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-primary hover:text-primary"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleCvMark(doc.path);
                                }}
                              >
                                <Star className="h-4 w-4 fill-primary" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>CV-Markierung entfernen</TooltipContent>
                          </Tooltip>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              openPreview(doc);
                            }}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              downloadDocument(doc.path, doc.name);
                            }}
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteDocument(doc.path, doc.name);
                            }}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                    {/* Separator between CV and other documents */}
                    {sortedDocuments.filter(d => d.path !== markedCvPath).length > 0 && (
                      <div className="border-t my-3" />
                    )}
                  </>
                )}
                
                {/* Other documents - draggable */}
                {sortedDocuments.filter(d => d.path !== markedCvPath).map((doc, index) => (
                  <div
                    key={doc.path}
                    draggable
                    onDragStart={(e) => handleDocDragStart(e, doc.path)}
                    onDragOver={(e) => handleDocDragOver(e, doc.path)}
                    onDragLeave={handleDocDragLeave}
                    onDrop={(e) => handleDocDrop(e, doc.path)}
                    onDragEnd={handleDocDragEnd}
                    className={`flex items-center justify-between p-3 border rounded-lg hover:bg-accent/50 transition-all cursor-pointer ${
                      draggedDocPath === doc.path ? 'opacity-50' : ''
                    } ${
                      dragOverDocPath === doc.path ? 'border-primary border-2 bg-primary/5' : ''
                    }`}
                    onClick={() => openPreview(doc)}
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <div
                        className="cursor-grab active:cursor-grabbing p-1 hover:bg-muted rounded"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <GripVertical className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <FileText className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{doc.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatFileSize(doc.size)} • {new Date(doc.created_at).toLocaleDateString('de-DE')}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {!markedCvPath && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleCvMark(doc.path);
                              }}
                              className="h-7 w-7 p-0 text-muted-foreground hover:text-yellow-500"
                            >
                              <Star className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Als Lebenslauf markieren</TooltipContent>
                        </Tooltip>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          openPreview(doc);
                        }}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          downloadDocument(doc.path, doc.name);
                        }}
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteDocument(doc.path, doc.name);
                        }}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </TooltipProvider>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">
              {t("documents.noDocuments")}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Preview Dialog */}
      <Dialog open={!!previewDoc} onOpenChange={(open) => !open && closePreview()}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="truncate pr-8">{previewDoc?.name}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-auto min-h-0">
            {previewLoading || !previewDoc?.url ? (
              <div className="flex items-center justify-center h-[75vh]">
                <div className="flex flex-col items-center gap-3">
                  <Loader2 className="h-10 w-10 animate-spin text-primary" />
                  <p className="text-sm text-muted-foreground">Dokument wird geladen...</p>
                </div>
              </div>
            ) : previewDoc?.type === 'pdf' ? (
              <div className="w-full h-[75vh] flex flex-col">
                <PDFViewer url={previewDoc.url} className="flex-1" />
                <div className="flex justify-center gap-2 pt-4 border-t mt-2">
                  <Button variant="outline" onClick={() => window.open(previewDoc.url, '_blank')}>
                    <Download className="h-4 w-4 mr-2" />
                    PDF in neuem Tab öffnen
                  </Button>
                </div>
              </div>
            ) : previewDoc?.type === 'image' ? (
              <img
                src={previewDoc.url}
                alt={previewDoc.name}
                className="max-w-full h-auto mx-auto"
              />
            ) : (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <FileText className="h-16 w-16 text-muted-foreground mb-4" />
                <p className="text-muted-foreground mb-4">
                  {t("documents.noPreviewAvailable") || "Vorschau für diesen Dateityp nicht verfügbar"}
                </p>
                <Button onClick={() => previewDoc && downloadDocument(previewDoc.url, previewDoc.name)}>
                  <Download className="h-4 w-4 mr-2" />
                  {t("documents.download") || "Herunterladen"}
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
