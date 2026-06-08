import { useState, useRef } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Camera, Upload, Loader2, User } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useTranslation } from "react-i18next";
import { detectAndCropFace, enhanceImage } from "@/lib/faceDetection";

interface AvatarUploadProps {
  currentImage?: string;
  fallbackText: string;
  onImageChange: (imageUrl: string) => void;
  onFullImageChange?: (fullImageUrl: string) => void;
  size?: "sm" | "md" | "lg" | "xl";
  bucket?: string;
  folder?: string;
}

export function AvatarUpload({ 
  currentImage, 
  fallbackText, 
  onImageChange,
  onFullImageChange,
  size = "lg",
  bucket = "profile-avatars",
  folder = "candidates"
}: AvatarUploadProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const { t } = useTranslation();

  const sizeClasses = {
    sm: "h-12 w-12",
    md: "h-16 w-16",
    lg: "h-20 w-20",
    xl: "h-24 w-24"
  };

  const uploadToStorage = async (file: File): Promise<string | null> => {
    const fileExt = file.name.split('.').pop();
    const fileName = `${folder}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(fileName, file, {
        cacheControl: '3600',
        upsert: false
      });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      throw uploadError;
    }

    const { data: { publicUrl } } = supabase.storage
      .from(bucket)
      .getPublicUrl(fileName);

    return publicUrl;
  };

  // Convert File to data URL for face detection
  const fileToDataUrl = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  // Convert data URL to File for upload
  const dataUrlToFile = async (dataUrl: string, fileName: string): Promise<File> => {
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    return new File([blob], fileName, { type: blob.type });
  };

  const processFile = async (file: File) => {
    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast({
        title: t("avatar.invalidType"),
        description: t("avatar.invalidTypeDesc"),
        variant: "destructive",
      });
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: t("avatar.fileTooLarge"),
        description: t("avatar.fileTooLargeDesc"),
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);

    try {
      // 1. Convert file to data URL
      const imageDataUrl = await fileToDataUrl(file);
      
      // 2. Enhance the FULL original image first
      let enhancedFullImage = await enhanceImage(imageDataUrl);
      const fullImageToUse = enhancedFullImage || imageDataUrl;
      
      if (enhancedFullImage) {
        console.log('✅ Full image enhanced successfully');
      } else {
        console.log('ℹ️ Enhancement failed, using original image');
      }

      // 3. Upload enhanced full image and notify via callback
      if (onFullImageChange) {
        const fullFile = await dataUrlToFile(fullImageToUse, `full-${file.name}`);
        const fullUrl = await uploadToStorage(fullFile);
        if (fullUrl) {
          onFullImageChange(fullUrl);
          console.log('✅ Full enhanced image uploaded');
        }
      }

      // 4. Face-crop from the enhanced full image
      let fileToUpload: File;
      const croppedImage = await detectAndCropFace(fullImageToUse);
      
      if (croppedImage) {
        console.log('✅ Face cropped from enhanced image');
        fileToUpload = await dataUrlToFile(croppedImage, `cropped-${file.name}`);
      } else {
        console.log('ℹ️ No face detected, using full image as avatar');
        fileToUpload = await dataUrlToFile(fullImageToUse, `avatar-${file.name}`);
      }

      // 5. Upload avatar (crop or full) 
      const publicUrl = await uploadToStorage(fileToUpload);
      if (publicUrl) {
        onImageChange(publicUrl);
        toast({
          title: t("avatar.uploaded"),
          description: t("avatar.uploadedDesc"),
        });
      }
    } catch (error) {
      console.error('Upload failed:', error);
      toast({
        title: t("avatar.uploadFailed"),
        description: t("avatar.uploadFailedDesc"),
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const handleClick = () => {
    if (!isUploading) {
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
    // Only set dragging to false if we're leaving the container itself
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
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      processFile(files[0]);
    }
  };

  return (
    <div 
      className={`relative inline-flex cursor-pointer transition-transform ${sizeClasses[size]} ${isDragging ? 'scale-110' : ''}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onClick={handleClick}
    >
      <Avatar className={`${sizeClasses[size]} ${isDragging ? 'ring-2 ring-primary ring-offset-2' : ''}`}>
        {currentImage && <AvatarImage src={currentImage} alt={t("avatar.profileImage")} />}
        <AvatarFallback className="bg-muted text-muted-foreground">
          {fallbackText && fallbackText !== '?' ? (
            <span className="text-lg font-medium">{fallbackText}</span>
          ) : (
            <User className="h-8 w-8" />
          )}
        </AvatarFallback>
      </Avatar>
      
      {/* Overlay for hover/drag states */}
      {(isHovered || isDragging || isUploading) && (
        <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center">
          {isUploading ? (
            <Loader2 className="h-6 w-6 text-white animate-spin" />
          ) : isDragging ? (
            <Upload className="h-6 w-6 text-white" />
          ) : (
            <Camera className="h-6 w-6 text-white" />
          )}
        </div>
      )}
      
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
        disabled={isUploading}
      />
    </div>
  );
}
