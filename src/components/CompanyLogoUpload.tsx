import { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { getSignedLogoUrl } from "@/lib/storageUtils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Building2,
  Upload,
  Loader2,
  Trash2,
  RefreshCw,
  Eye,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

interface CompanyLogoUploadProps {
  currentLogo?: string | null;
  companyName: string;
  onLogoChange: (url: string | null) => void;
  clientId?: string;
  websiteUrl?: string | null;
  logoBgColor?: string | null;
}

export const extractEdgeColor = (src: string): Promise<string | null> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(null);
        return;
      }
      ctx.drawImage(img, 0, 0);
      const corners = [
        ctx.getImageData(0, 0, 1, 1).data,
        ctx.getImageData(img.width - 1, 0, 1, 1).data,
        ctx.getImageData(0, img.height - 1, 1, 1).data,
        ctx.getImageData(img.width - 1, img.height - 1, 1, 1).data,
      ];
      const transparentCount = corners.filter((d) => d[3] < 128).length;

      if (transparentCount >= 3) {
        resolve("rgb(255,255,255)");
        return;
      }

      const opaqueColors = corners
        .filter((d) => d[3] >= 128)
        .map((d) => `rgb(${d[0]},${d[1]},${d[2]})`);

      if (opaqueColors.length === 0) {
        resolve("rgb(255,255,255)");
        return;
      }

      const freq: Record<string, number> = {};
      opaqueColors.forEach((c) => (freq[c] = (freq[c] || 0) + 1));
      const dominant = Object.entries(freq).sort((a, b) => b[1] - a[1])[0][0];
      resolve(dominant);
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
};

export function CompanyLogoUpload({
  currentLogo,
  companyName,
  onLogoChange,
  clientId,
  websiteUrl,
  logoBgColor: logoBgColorProp,
}: CompanyLogoUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isRefetching, setIsRefetching] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [logoBgColor, setLogoBgColor] = useState<string | null>(null);
  const [resolvedLogoUrl, setResolvedLogoUrl] = useState<string | undefined>(undefined);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const { t } = useTranslation();

  // Resolve signed URL for private bucket
  useEffect(() => {
    if (currentLogo) {
      getSignedLogoUrl(currentLogo).then((url) => setResolvedLogoUrl(url || undefined));
    } else {
      setResolvedLogoUrl(undefined);
    }
  }, [currentLogo]);

  useEffect(() => {
    if (logoBgColorProp) {
      setLogoBgColor(logoBgColorProp);
    } else if (resolvedLogoUrl) {
      extractEdgeColor(resolvedLogoUrl).then((color) => setLogoBgColor(color));
    } else {
      setLogoBgColor(null);
    }
  }, [resolvedLogoUrl, logoBgColorProp]);

  const uploadLogo = async (file: File) => {
    try {
      setUploading(true);

      if (file.size > 2 * 1024 * 1024) {
        toast({
          title: t("toast.error"),
          description: t("toast.fileTooLarge2MB"),
          variant: "destructive",
        });
        return;
      }

      if (!file.type.startsWith("image/")) {
        toast({
          title: t("toast.error"),
          description: t("toast.selectImageFile"),
          variant: "destructive",
        });
        return;
      }

      const fileExt = file.name.split(".").pop();
      const fileName = `${Math.random().toString(36).substring(2)}.${fileExt}`;
      const filePath = `${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("company-logos")
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      // Store the storage path (not the full public URL) since bucket is private
      onLogoChange(filePath);

      toast({
        title: t("common.success"),
        description: t("toast.logoUploadSuccess"),
      });
    } catch (error) {
      console.error("Error uploading logo:", error);
      toast({
        title: t("toast.error"),
        description: t("toast.uploadError"),
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      uploadLogo(file);
    }
  };

  const handleClick = () => {
    if (!uploading && !isRefetching) {
      fileInputRef.current?.click();
    }
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX;
    const y = e.clientY;
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
      setIsDragging(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "copy";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      uploadLogo(files[0]);
    }
  };

  const handleDeleteLogo = () => {
    onLogoChange(null);
    toast({
      title: t("common.success"),
      description: t("toast.logoDeleted", "Logo wurde entfernt"),
    });
  };

  const handleRefetchLogo = async () => {
    if (!clientId || !websiteUrl) {
      toast({
        title: t("toast.error"),
        description: "Keine Website-URL vorhanden",
        variant: "destructive",
      });
      return;
    }

    setIsRefetching(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        "fetch-company-logo",
        {
          body: { url: websiteUrl, clientId },
        },
      );

      if (error) throw error;

      if (data?.success && data?.logo_url) {
        onLogoChange(data.logo_url);
        toast({
          title: t("common.success"),
          description: "Logo wurde neu geladen",
        });
      } else {
        toast({
          title: t("toast.error"),
          description: data?.error || "Kein Logo gefunden",
          variant: "destructive",
        });
      }
    } catch (err) {
      console.error("Logo refetch failed:", err);
      toast({
        title: t("toast.error"),
        description: "Logo konnte nicht geladen werden",
        variant: "destructive",
      });
    } finally {
      setIsRefetching(false);
    }
  };

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            className={`relative inline-flex cursor-pointer transition-transform h-24 w-24 ${isDragging ? "scale-110" : ""}`}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onClick={handleClick}
          >
            <Avatar
              className={`h-24 w-24 border-2 border-border ${isDragging ? "ring-2 ring-primary ring-offset-2" : ""}`}
              style={logoBgColor ? { backgroundColor: logoBgColor } : undefined}
            >
              <AvatarImage
                src={resolvedLogoUrl}
                alt={companyName}
                className="object-contain p-1.5"
              />
              <AvatarFallback className="text-2xl bg-muted">
                <Building2 className="h-12 w-12" />
              </AvatarFallback>
            </Avatar>

            {(isHovered || isDragging || uploading || isRefetching) && (
              <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center">
                {uploading || isRefetching ? (
                  <Loader2 className="h-6 w-6 text-white animate-spin" />
                ) : (
                  <Upload className="h-6 w-6 text-white" />
                )}
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
              disabled={uploading || isRefetching}
            />
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          {currentLogo && (
            <>
              <ContextMenuItem onClick={() => setShowPreview(true)}>
                <Eye className="h-4 w-4 mr-2" />
                Vorschau
              </ContextMenuItem>
              <ContextMenuSeparator />
            </>
          )}
          {websiteUrl && clientId && (
            <ContextMenuItem
              onClick={handleRefetchLogo}
              disabled={isRefetching}
            >
              <RefreshCw
                className={`h-4 w-4 mr-2 ${isRefetching ? "animate-spin" : ""}`}
              />
              Logo neu laden
            </ContextMenuItem>
          )}
          {currentLogo && (
            <ContextMenuItem
              onClick={handleDeleteLogo}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Logo entfernen
            </ContextMenuItem>
          )}
        </ContextMenuContent>
      </ContextMenu>

      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-lg">
          <DialogTitle className="sr-only">
            Logo Vorschau – {companyName}
          </DialogTitle>
          {resolvedLogoUrl && (
            <div className="flex items-center justify-center p-4">
              <img
                src={resolvedLogoUrl}
                alt={`Logo ${companyName}`}
                className="max-w-full max-h-[60vh] object-contain rounded-lg"
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
