import * as mammoth from "mammoth";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import { GlobalWorkerOptions } from "pdfjs-dist/legacy/build/pdf.mjs";
import { detectAndCropFace } from "@/lib/faceDetection";

// Always use CDN for worker - simpler and more reliable
GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

interface PersonPhotoResult {
  found: boolean;
  imageDataUrl?: string;
  confidence?: "high" | "medium" | "low";
  method?: string;
}

/**
 * Trim whitespace from edges of image
 */
function trimWhitespace(imageDataUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();

    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("No canvas context"));
        return;
      }

      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;

      // Find the bounds of non-white pixels
      let minX = canvas.width;
      let minY = canvas.height;
      let maxX = 0;
      let maxY = 0;

      const threshold = 240; // Consider pixels with RGB > 240 as "white"

      for (let y = 0; y < canvas.height; y++) {
        for (let x = 0; x < canvas.width; x++) {
          const i = (y * canvas.width + x) * 4;
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];

          // If pixel is NOT white
          if (r < threshold || g < threshold || b < threshold) {
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
          }
        }
      }

      // Add small padding (5px) for breathing room
      const padding = 5;
      minX = Math.max(0, minX - padding);
      minY = Math.max(0, minY - padding);
      maxX = Math.min(canvas.width, maxX + padding);
      maxY = Math.min(canvas.height, maxY + padding);

      const trimmedWidth = maxX - minX;
      const trimmedHeight = maxY - minY;

      console.log(
        `  🔲 Trimmed whitespace: ${trimmedWidth}×${trimmedHeight} (was ${canvas.width}×${canvas.height})`,
      );

      // Create trimmed canvas
      const trimmedCanvas = document.createElement("canvas");
      trimmedCanvas.width = trimmedWidth;
      trimmedCanvas.height = trimmedHeight;

      const trimmedCtx = trimmedCanvas.getContext("2d");
      if (!trimmedCtx) {
        reject(new Error("No canvas context"));
        return;
      }

      trimmedCtx.drawImage(
        canvas,
        minX,
        minY,
        trimmedWidth,
        trimmedHeight,
        0,
        0,
        trimmedWidth,
        trimmedHeight,
      );
      resolve(trimmedCanvas.toDataURL("image/png"));
    };

    img.onerror = () => reject(new Error("Image load failed"));
    img.src = imageDataUrl;
  });
}

/**
 * Crop image using percentage boundaries
 */
function cropImageByPercentages(
  imageDataUrl: string,
  bounds: { top: number; left: number; bottom: number; right: number },
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();

    img.onload = () => {
      // Calculate crop coordinates directly from percentages
      const cropX = (bounds.left / 100) * img.width;
      const cropY = (bounds.top / 100) * img.height;
      const cropWidth = ((bounds.right - bounds.left) / 100) * img.width;
      const cropHeight = ((bounds.bottom - bounds.top) / 100) * img.height;

      // Add small padding (2%) for better framing
      const paddingX = cropWidth * 0.02;
      const paddingY = cropHeight * 0.02;

      const finalX = Math.max(0, cropX - paddingX);
      const finalY = Math.max(0, cropY - paddingY);
      const finalWidth = Math.min(img.width - finalX, cropWidth + paddingX * 2);
      const finalHeight = Math.min(
        img.height - finalY,
        cropHeight + paddingY * 2,
      );

      console.log(
        `✂️ Cropping: x=${finalX.toFixed(0)}, y=${finalY.toFixed(
          0,
        )}, ${finalWidth.toFixed(0)}×${finalHeight.toFixed(0)}`,
      );

      const canvas = document.createElement("canvas");
      canvas.width = finalWidth;
      canvas.height = finalHeight;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("No canvas context"));
        return;
      }

      ctx.drawImage(
        img,
        finalX,
        finalY,
        finalWidth,
        finalHeight,

        0,
        0,
        finalWidth,
        finalHeight,
      );
      resolve(canvas.toDataURL("image/png"));
    };

    img.onerror = () => reject(new Error("Image load failed"));
    img.src = imageDataUrl;
  });
}

/**
 * Fallback: Use background color detection
 * Photos usually have different background than the page
 */
async function extractByColorDifference(
  pageImageDataUrl: string,
): Promise<string | null> {
  console.log("🎨 Trying color difference detection...");

  return new Promise((resolve) => {
    const img = new Image();

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
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;

      // Sample the page background color (from corners)
      const bgColor = {
        r: data[0],
        g: data[1],
        b: data[2],
      };

      // Find regions with significantly different colors
      let minX = canvas.width,
        minY = canvas.height,
        maxX = 0,
        maxY = 0;
      let foundDifference = false;

      const threshold = 50; // Color difference threshold

      for (let y = 0; y < canvas.height; y++) {
        for (let x = 0; x < canvas.width; x++) {
          const i = (y * canvas.width + x) * 4;
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];

          const diff =
            Math.abs(r - bgColor.r) +
            Math.abs(g - bgColor.g) +
            Math.abs(b - bgColor.b);

          if (diff > threshold) {
            foundDifference = true;
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
          }
        }
      }

      if (!foundDifference) {
        console.log("❌ No color difference found");
        resolve(null);
        return;
      }

      // Crop to the different region
      const width = maxX - minX;
      const height = maxY - minY;

      console.log(`📐 Different region: ${minX},${minY} ${width}×${height}`);

      const cropCanvas = document.createElement("canvas");
      cropCanvas.width = width;
      cropCanvas.height = height;

      const cropCtx = cropCanvas.getContext("2d");
      if (!cropCtx) {
        resolve(null);
        return;
      }

      cropCtx.drawImage(canvas, minX, minY, width, height, 0, 0, width, height);
      resolve(cropCanvas.toDataURL("image/png"));
    };

    img.onerror = () => resolve(null);
    img.src = pageImageDataUrl;
  });
}

/**
 * Main extraction function
 */
export async function extractPersonPhotoFromPDF(
  file: File,
): Promise<PersonPhotoResult> {
  console.log("🎯 Starting DIRECT face extraction...");

  try {
    // Render PDF at high quality
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const page = await pdf.getPage(1);

    const scale = 3.0;
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("No canvas context");

    await page.render({ canvasContext: ctx, viewport }).promise;
    const pageImage = canvas.toDataURL("image/png");

    console.log(`✅ Rendered: ${canvas.width}x${canvas.height}px`);

    // Method 1: Browser-based face detection (handles round and square frames)
    console.log("🔍 Running browser face detection...");
    const extracted = await detectAndCropFace(pageImage);

    if (extracted) {
      console.log("✅ SUCCESS via browser face detection!");
      return {
        found: true,
        imageDataUrl: extracted,
        confidence: "high",
        method: "browser-face-detection",
      };
    }

    // Method 2: Color difference detection (fallback)
    console.log("🔄 Trying color detection fallback...");
    const colorExtracted = await extractByColorDifference(pageImage);

    if (colorExtracted) {
      console.log("✅ SUCCESS via color detection!");
      return {
        found: true,
        imageDataUrl: colorExtracted,
        confidence: "medium",
        method: "color-detection",
      };
    }

    return {
      found: false,
      confidence: "low",
      method: "all-failed",
    };
  } catch (error) {
    console.error("❌ Error:", error);
    return {
      found: false,
      confidence: "low",
      method: "error",
    };
  }
}
// Helper: Convert file to base64

// RECOMMENDED: More comprehensive extraction using page resources
// export async function extractAllImagesFromPDF(file: File): Promise<ExtractedImage[]> {
//   const arrayBuffer = await file.arrayBuffer();
//   const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

//   const images: ExtractedImage[] = [];

//   console.log(`Extracting all images from ${pdf.numPages} pages`);

//   for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
//     try {
//       const page = await pdf.getPage(pageNum);

//       // Get operator list to find all image operations
//       const ops = await page.getOperatorList();

//       // Track unique image names
//       const imageNames = new Set<string>();

//       // Find all image operation types
//       for (let i = 0; i < ops.fnArray.length; i++) {
//         const op = ops.fnArray[i];

//         // Check all possible image operations
//         if (
//           op === pdfjsLib.OPS.paintImageXObject ||
//           op === pdfjsLib.OPS.paintInlineImageXObject ||
//           op === pdfjsLib.OPS.paintImageMaskXObject ||
//           op === pdfjsLib.OPS.paintJpegXObject ||
//           op === 85 || // paintImageXObject
//           op === 86 || // paintInlineImageXObject
//           op === 87    // paintImageMaskXObject
//         ) {
//           const imageName = ops.argsArray[i]?.[0];
//           if (imageName && typeof imageName === 'string') {
//             imageNames.add(imageName);
//           }
//         }
//       }

//       console.log(`Page ${pageNum}: Found ${imageNames.size} unique images: ${Array.from(imageNames).join(', ')}`);

//       // Extract each unique image
//       for (const imageName of imageNames) {
//         try {
//           const image: any = await page.objs.get(imageName);

//           if (!image) {
//             console.log(`Could not get image data for: ${imageName}`);
//             continue;
//           }

//           const width = image.width || 0;
//           const height = image.height || 0;

//           if (!width || !height) {
//             console.log(`Invalid dimensions for ${imageName}: ${width}x${height}`);
//             continue;
//           }

//           console.log(`Extracting ${imageName}: ${width}x${height}, kind: ${image.kind}`);

//           // Create canvas
//           const canvas = document.createElement('canvas');
//           canvas.width = width;
//           canvas.height = height;
//           const ctx = canvas.getContext('2d');

//           if (!ctx) continue;

//           // Handle image data
//           if (image.data && image.data.length > 0) {
//             const imageData = ctx.createImageData(width, height);
//             const srcData = image.data;
//             const destData = imageData.data;

//             // Handle different image kinds
//             // kind 1 = Grayscale, 2 = RGB, 3 = RGBA
//             if (image.kind === 1) {
//               // Grayscale
//               for (let j = 0; j < width * height; j++) {
//                 const gray = srcData[j];
//                 destData[j * 4] = gray;
//                 destData[j * 4 + 1] = gray;
//                 destData[j * 4 + 2] = gray;
//                 destData[j * 4 + 3] = 255;
//               }
//             } else if (image.kind === 2) {
//               // RGB
//               for (let j = 0; j < width * height; j++) {
//                 destData[j * 4] = srcData[j * 3];
//                 destData[j * 4 + 1] = srcData[j * 3 + 1];
//                 destData[j * 4 + 2] = srcData[j * 3 + 2];
//                 destData[j * 4 + 3] = 255;
//               }
//             } else {
//               // RGBA or unknown - copy as is
//               for (let j = 0; j < destData.length; j++) {
//                 destData[j] = srcData[j] || 0;
//               }
//               // Ensure alpha channel
//               for (let j = 3; j < destData.length; j += 4) {
//                 if (destData[j] === 0) destData[j] = 255;
//               }
//             }

//             ctx.putImageData(imageData, 0, 0);
//           } else if (image.bitmap) {
//             // Use bitmap if available
//             ctx.drawImage(image.bitmap, 0, 0);
//           } else {
//             console.log(`No data available for ${imageName}`);
//             continue;
//           }

//           const dataUrl = canvas.toDataURL('image/png');

//           images.push({
//             page: pageNum,
//             type: 'png',
//             dataUrl,
//             width,
//             height,
//           });

//           console.log(`✓ Successfully extracted ${imageName} (${width}x${height})`);
//         } catch (imgError) {
//           console.error(`Error extracting ${imageName}:`, imgError);
//         }
//       }
//     } catch (pageError) {
//       console.error(`Error processing page ${pageNum}:`, pageError);
//     }
//   }

//   console.log(`\n=== EXTRACTION COMPLETE ===`);
//   console.log(`Total images extracted: ${images.length}`);
//   images.forEach((img, idx) => {
//     console.log(`  ${idx + 1}. Page ${img.page}: ${img.width}x${img.height}px`);
//   });

//   return images;
// }

// // Alternative simpler method - render entire page and extract
// export async function extractImagesAsPageSnapshots(file: File): Promise<ExtractedImage[]> {
//   const arrayBuffer = await file.arrayBuffer();
//   const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

//   const images: ExtractedImage[] = [];

//   for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
//     try {
//       const page = await pdf.getPage(pageNum);
//       const viewport = page.getViewport({ scale: 2.0 }); // Higher scale = better quality

//       const canvas = document.createElement('canvas');
//       const context = canvas.getContext('2d');

//       if (!context) continue;

//       canvas.height = viewport.height;
//       canvas.width = viewport.width;

//       await page.render({
//         canvasContext: context,
//         viewport: viewport,
//       }).promise;

//       const dataUrl = canvas.toDataURL('image/png');

//       images.push({
//         page: pageNum,
//         type: 'png',
//         dataUrl,
//         width: viewport.width,
//         height: viewport.height,
//       });
//     } catch (error) {
//       console.error(`Error rendering page ${pageNum}:`, error);
//     }
//   }

//   return images;
// }

const extractTextFromPDF = async (file: File): Promise<string> => {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    let fullText = "";

    // Extract text from each page with layout awareness
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const viewport = page.getViewport({ scale: 1.0 });

      // Group text items by their vertical position (Y coordinate)
      interface TextItem {
        str: string;
        transform: number[];
        width: number;
        height: number;
      }

      const lines: Map<number, TextItem[]> = new Map();

      textContent.items.forEach((item: any) => {
        const textItem = item as TextItem;
        if (!textItem.str.trim()) return;

        // Y coordinate (vertical position)
        const y = Math.round(textItem.transform[5]);

        if (!lines.has(y)) {
          lines.set(y, []);
        }
        lines.get(y)!.push(textItem);
      });

      // Sort lines by Y coordinate (top to bottom)
      const sortedYPositions = Array.from(lines.keys()).sort((a, b) => b - a);

      // Process each line
      sortedYPositions.forEach((y) => {
        const lineItems = lines.get(y)!;

        // Sort items in the line by X coordinate (left to right)
        lineItems.sort((a, b) => a.transform[4] - b.transform[4]);

        // Build the line text with proper spacing
        let lineText = "";
        let lastX = 0;

        lineItems.forEach((item, index) => {
          const currentX = item.transform[4];
          const text = item.str;

          if (index > 0) {
            // Calculate gap between words
            const gap = currentX - lastX;
            // If gap is significant, add space (adjust threshold as needed)
            if (gap > 10) {
              lineText += " ";
            }
          }

          lineText += text;
          lastX = currentX + item.width;
        });

        // Add the line to fullText
        if (lineText.trim()) {
          fullText += lineText.trim() + "\n";
        }
      });

      // Add page separator
      if (i < pdf.numPages) {
        fullText += "\n";
      }
    }

    return fullText.trim();
  } catch (error) {
    console.error("Error extracting PDF text:", error);
    throw new Error("Failed to extract text from PDF");
  }
};

/**
 * Extract text from DOCX files
 */
const extractTextFromDOCX = async (file: File): Promise<string> => {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    return result.value.trim();
  } catch (error) {
    console.error("Error extracting DOCX text:", error);
    throw new Error("Failed to extract text from DOCX");
  }
};

/**
 * Extract text from plain text files
 */
const extractTextFromTXT = async (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (event) => {
      const text = event.target?.result as string;
      resolve(text?.trim() || "");
    };

    reader.onerror = () => {
      reject(new Error("Failed to read text file"));
    };

    reader.readAsText(file);
  });
};

/**
 * Main function to extract text from different file types
 */
export const extractTextFromFile = async (file: File): Promise<string> => {
  const fileType = file.type;
  const fileName = file.name.toLowerCase();

  try {
    // PDF files
    if (fileType === "application/pdf" || fileName.endsWith(".pdf")) {
      return await extractTextFromPDF(file);
    }

    // DOCX files
    if (
      fileType ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      fileName.endsWith(".docx")
    ) {
      return await extractTextFromDOCX(file);
    }

    // DOC files (legacy Word format)
    if (fileType === "application/msword" || fileName.endsWith(".doc")) {
      throw new Error(
        "Legacy .doc files are not supported. Please convert to .docx or .pdf",
      );
    }

    // Plain text files
    if (fileType === "text/plain" || fileName.endsWith(".txt")) {
      return await extractTextFromTXT(file);
    }

    throw new Error("Unsupported file type");
  } catch (error) {
    console.error("Error extracting text:", error);
    throw error;
  }
};

// import {
//   PDFDocument,
//   PDFName,
//   PDFRawStream,
//   PDFDict,
//   PDFRef,
//   PDFNumber,
//   PDFArray,
// } from "pdf-lib";
// import pako from "pako";

// function getNumberValue(obj: any): number | null {
//   if (obj instanceof PDFNumber) return obj.asNumber();
//   if (typeof obj === "number") return obj;
//   return null;
// }

// // Helper function to convert blob to base64 data URL
// function blobToBase64(blob: Blob): Promise<string> {
//   return new Promise((resolve, reject) => {
//     const reader = new FileReader();
//     reader.onloadend = () => resolve(reader.result as string);
//     reader.onerror = reject;
//     reader.readAsDataURL(blob);
//   });
// }

// // Decompress FlateDecode data
// function inflateFlateDecode(data: Uint8Array): Uint8Array {
//   try {
//     return pako.inflate(data);
//   } catch (error) {
//     console.error("Failed to inflate data:", error);
//     throw error;
//   }
// }

// // Parse color space - handle both simple names and arrays
// function parseColorSpace(colorSpaceObj: any): { type: string; components: number } {
//   if (!colorSpaceObj) {
//     return { type: "/DeviceRGB", components: 3 };
//   }

//   // If it's a simple name
//   if (typeof colorSpaceObj.toString === 'function') {
//     const csName = colorSpaceObj.toString();

//     if (csName === "/DeviceRGB" || csName === "DeviceRGB") {
//       return { type: "/DeviceRGB", components: 3 };
//     } else if (csName === "/DeviceGray" || csName === "DeviceGray") {
//       return { type: "/DeviceGray", components: 1 };
//     } else if (csName === "/DeviceCMYK" || csName === "DeviceCMYK") {
//       return { type: "/DeviceCMYK", components: 4 };
//     }
//   }

//   // If it's an array (indexed color space, etc.)
//   if (colorSpaceObj instanceof PDFArray) {
//     const firstElement = colorSpaceObj.get(0);
//     if (firstElement) {
//       const csType = firstElement.toString();

//       if (csType === "/Indexed") {
//         // Indexed color space - typically uses a base color space
//         const baseSpace = colorSpaceObj.get(1);
//         if (baseSpace) {
//           return parseColorSpace(baseSpace);
//         }
//       } else if (csType === "/ICCBased") {
//         // ICC-based color space - check the stream for number of components
//         const iccStream = colorSpaceObj.get(1);
//         // Default to RGB for ICC
//         return { type: "/DeviceRGB", components: 3 };
//       }
//     }
//   }

//   // Default to RGB
//   return { type: "/DeviceRGB", components: 3 };
// }

// // Convert raw image data to PNG with proper handling
// function createPNGFromRawData(
//   rawData: Uint8Array,
//   width: number,
//   height: number,
//   colorSpace: { type: string; components: number },
//   bitsPerComponent: number
// ): string {
//   const canvas = document.createElement("canvas");
//   canvas.width = width;
//   canvas.height = height;
//   const ctx = canvas.getContext("2d");

//   if (!ctx) throw new Error("Could not get canvas context");

//   const imageData = ctx.createImageData(width, height);
//   const pixels = imageData.data;

//   const totalPixels = width * height;
//   const expectedBytes = totalPixels * colorSpace.components;

//   // Validate data length
//   if (rawData.length < expectedBytes) {
//     console.warn(`Insufficient data: expected ${expectedBytes}, got ${rawData.length}`);
//     // Fill with white pixels as fallback
//     for (let i = 0; i < totalPixels * 4; i += 4) {
//       pixels[i] = 255;     // R
//       pixels[i + 1] = 255; // G
//       pixels[i + 2] = 255; // B
//       pixels[i + 3] = 255; // A
//     }
//   } else {
//     // Handle different color spaces
//     if (colorSpace.type === "/DeviceRGB") {
//       // RGB data: 3 bytes per pixel
//       for (let i = 0; i < totalPixels; i++) {
//         const srcIdx = i * 3;
//         const dstIdx = i * 4;
//         pixels[dstIdx] = rawData[srcIdx];         // R
//         pixels[dstIdx + 1] = rawData[srcIdx + 1]; // G
//         pixels[dstIdx + 2] = rawData[srcIdx + 2]; // B
//         pixels[dstIdx + 3] = 255;                 // A
//       }
//     } else if (colorSpace.type === "/DeviceGray") {
//       // Grayscale: 1 byte per pixel
//       for (let i = 0; i < totalPixels; i++) {
//         const gray = rawData[i];
//         const dstIdx = i * 4;
//         pixels[dstIdx] = gray;     // R
//         pixels[dstIdx + 1] = gray; // G
//         pixels[dstIdx + 2] = gray; // B
//         pixels[dstIdx + 3] = 255;  // A
//       }
//     } else if (colorSpace.type === "/DeviceCMYK") {
//       // CMYK: 4 bytes per pixel - convert to RGB
//       for (let i = 0; i < totalPixels; i++) {
//         const srcIdx = i * 4;
//         const dstIdx = i * 4;

//         const c = rawData[srcIdx] / 255;
//         const m = rawData[srcIdx + 1] / 255;
//         const y = rawData[srcIdx + 2] / 255;
//         const k = rawData[srcIdx + 3] / 255;

//         pixels[dstIdx] = Math.round(255 * (1 - c) * (1 - k));     // R
//         pixels[dstIdx + 1] = Math.round(255 * (1 - m) * (1 - k)); // G
//         pixels[dstIdx + 2] = Math.round(255 * (1 - y) * (1 - k)); // B
//         pixels[dstIdx + 3] = 255;                                 // A
//       }
//     }
//   }

//   ctx.putImageData(imageData, 0, 0);
//   return canvas.toDataURL("image/png");
// }

// export async function extractImagesFromPDF(file: File) {
//   const arrayBuffer = await file.arrayBuffer();
//   const pdfDoc = await PDFDocument.load(arrayBuffer);
//   const context = pdfDoc.context;

//   const images: { page: number; type: string; dataUrl: string }[] = [];

//   for (let pageIndex = 0; pageIndex < pdfDoc.getPageCount(); pageIndex++) {
//     const page = pdfDoc.getPage(pageIndex);
//     const pageNode: any = page.node;
//     const resourcesRef = pageNode.Resources();

//     if (!resourcesRef) continue;

//     let resources: PDFDict | null = null;
//     if (resourcesRef instanceof PDFRef) {
//       resources = context.lookup(resourcesRef, PDFDict);
//     } else if (resourcesRef instanceof PDFDict) {
//       resources = resourcesRef;
//     }

//     if (!resources) continue;

//     const xObjectRef = resources.get(PDFName.of("XObject"));
//     if (!xObjectRef) continue;

//     let xObjectDict: PDFDict | null = null;
//     if (xObjectRef instanceof PDFRef) {
//       xObjectDict = context.lookup(xObjectRef, PDFDict);
//     } else if (xObjectRef instanceof PDFDict) {
//       xObjectDict = xObjectRef;
//     }

//     if (!xObjectDict) continue;

//     for (const key of xObjectDict.keys()) {
//       const xObjRef = xObjectDict.get(key);
//       if (!xObjRef) continue;

//       let xObj;
//       if (xObjRef instanceof PDFRef) {
//         xObj = context.lookup(xObjRef);
//       } else {
//         xObj = xObjRef;
//       }

//       if (!(xObj instanceof PDFRawStream)) continue;

//       const dict = xObj.dict;
//       const subtype = dict.get(PDFName.of("Subtype"));
//       if (!subtype || subtype?.encodedName !== "/Image") continue;

//       try {
//         const filter = dict.get(PDFName.of("Filter"));
//         const filterName = filter?.toString();
//         const width = getNumberValue(dict.get(PDFName.of("Width"))) || 0;
//         const height = getNumberValue(dict.get(PDFName.of("Height"))) || 0;

//         // Skip tiny images (likely artifacts or icons)
//         if (width < 10 || height < 10) {
//           console.log(`Skipping tiny image: ${width}x${height} on page ${pageIndex + 1}`);
//           continue;
//         }

//         const colorSpaceObj = dict.get(PDFName.of("ColorSpace"));
//         const colorSpace = parseColorSpace(colorSpaceObj);
//         const bitsPerComponent = getNumberValue(dict.get(PDFName.of("BitsPerComponent"))) || 8;

//         let imageData: Uint8Array = xObj.contents;

//         console.log(`Processing image on page ${pageIndex + 1}: ${width}x${height}, filter: ${filterName}, colorspace: ${colorSpace.type}`);

//         // Handle DCTDecode (JPEG) - already in correct format
//         if (filterName === "/DCTDecode") {
//           const blob = new Blob([imageData], { type: "image/jpeg" });
//           const dataUrl = await blobToBase64(blob);
//           images.push({
//             page: pageIndex + 1,
//             type: "jpeg",
//             dataUrl,
//           });
//         }
//         // Handle FlateDecode (compressed)
//         else if (filterName === "/FlateDecode") {
//           try {
//             // Decompress the data
//             const decompressed = inflateFlateDecode(imageData);

//             console.log(`Decompressed ${imageData.length} -> ${decompressed.length} bytes`);

//             // Convert to PNG using canvas
//             const dataUrl = createPNGFromRawData(
//               decompressed,
//               width,
//               height,
//               colorSpace,
//               bitsPerComponent
//             );

//             images.push({
//               page: pageIndex + 1,
//               type: "png",
//               dataUrl,
//             });
//           } catch (err) {
//             console.error(`Failed to process FlateDecode image on page ${pageIndex + 1}:`, err);
//           }
//         } else if (!filterName) {
//           // No filter - raw data
//           const dataUrl = createPNGFromRawData(
//             imageData,
//             width,
//             height,
//             colorSpace,
//             bitsPerComponent
//           );

//           images.push({
//             page: pageIndex + 1,
//             type: "png",
//             dataUrl,
//           });
//         } else {
//           console.log(`Unsupported filter: ${filterName} on page ${pageIndex + 1}`);
//         }
//       } catch (error) {
//         console.error(`Error extracting image on page ${pageIndex + 1}:`, error);
//       }
//     }
//   }

//   return images;
// }

/**
 * Validate file before processing
 */
export const validateFile = (
  file: File,
): { valid: boolean; error?: string } => {
  const maxSize = 10 * 1024 * 1024; // 10MB
  const allowedTypes = [
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/plain",
  ];

  const fileName = file.name.toLowerCase();
  const allowedExtensions = [".pdf", ".docx", ".txt"];

  if (file.size > maxSize) {
    return { valid: false, error: "File size must be less than 10MB" };
  }

  const hasValidType = allowedTypes.includes(file.type);
  const hasValidExtension = allowedExtensions.some((ext) =>
    fileName.endsWith(ext),
  );

  if (!hasValidType && !hasValidExtension) {
    return {
      valid: false,
      error:
        "Only PDF, DOCX, and TXT files are allowed. Legacy .doc files are not supported.",
    };
  }

  return { valid: true };
};

/**
 * Clean extracted text by removing extra whitespace and null bytes
 */
export const cleanExtractedText = (text: string): string => {
  // Preserve original spacing and structure for better AI parsing
  return text
    .replace(/\r\n/g, "\n") // Normalize line endings
    .replace(/\t/g, " ") // Convert tabs to spaces
    .replace(/ {3,}/g, "  ") // Reduce multiple spaces to max 2
    .replace(/\n{4,}/g, "\n\n\n"); // Max 3 consecutive newlines
};
