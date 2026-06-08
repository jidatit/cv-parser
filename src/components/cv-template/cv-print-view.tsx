import React, { useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import html2canvas from "html2canvas-pro";
import jsPDF from "jspdf";
import { PDFDocument } from "pdf-lib";
import MainPage from "./main-page";
import MainCV from "./main-cv";
import { Candidate } from "../types/cv-types";
import { supabase } from "@/integrations/supabase/client";

interface CvPrintViewProps {
  candidate: Candidate;
}

const CvPrintView: React.FC<CvPrintViewProps> = ({ candidate }) => {
  const coverRef = useRef<HTMLDivElement>(null);
  const cvRef = useRef<HTMLDivElement>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownload = async () => {
    if (!coverRef.current || !cvRef.current) return;

    setIsDownloading(true);
    try {
      // Temporarily remove blur classes to avoid rendering issues
      const blurElems = document.querySelectorAll(".blur-xl");
      blurElems.forEach((el) => el.classList.remove("blur-xl"));

      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();

      // Capture Cover Page
      const canvas1 = await html2canvas(coverRef.current, {
        scale: 3,
        useCORS: true,
        allowTaint: true,
        imageTimeout: 0,
        backgroundColor: "#171717",
        logging: false,
        windowWidth: 794,
        windowHeight: 1122,
        width: coverRef.current.scrollWidth,
        height: coverRef.current.scrollHeight,
        x: 0,
        y: 0,
        scrollX: 0,
        scrollY: 0,
        onclone: (_doc, clonedEl) => {
          const allEls = clonedEl.querySelectorAll("*");
          allEls.forEach((el) => {
            if (el instanceof HTMLElement) {
              el.style.filter = "none";
              el.style.backdropFilter = "none";
              el.style.willChange = "auto";
              // Fix box-shadow rendering: convert inset green shadows to borderBottom
              const shadow = el.style.boxShadow || _doc.defaultView?.getComputedStyle(el).boxShadow || "";
              if (shadow && shadow !== "none") {
                if (shadow.includes("inset") && shadow.includes("00d992")) {
                  el.style.boxShadow = "none";
                  el.style.borderBottom = "2px solid #00d992";
                } else {
                  el.style.boxShadow = "none";
                }
              }
            }
          });
          // Replace soft hyphens to prevent canvas rendering glitches
          const walker = _doc.createTreeWalker(clonedEl, NodeFilter.SHOW_TEXT);
          while (walker.nextNode()) {
            const node = walker.currentNode;
            if (node.textContent && node.textContent.includes("\u00AD")) {
              node.textContent = node.textContent.replace(/\u00AD/g, "\u200B");
            }
          }
        },
      });
      const imgData1 = canvas1.toDataURL("image/jpeg", 0.92);
      pdf.internal.scaleFactor = 1;

      pdf.addImage(
        imgData1,
        "JPEG",
        -0.2,
        -0.2,
        pdfWidth + 0.4,
        pdfHeight + 0.4,
      );

      // Capture CV Page
      const canvas2 = await html2canvas(cvRef.current, {
        scale: 3,
        useCORS: true,
        allowTaint: true,
        imageTimeout: 0,
        backgroundColor: "#171717",
        logging: false,
        windowWidth: 794,
        width: cvRef.current.scrollWidth,
        height: cvRef.current.scrollHeight,
        x: 0,
        y: 0,
        scrollX: 0,
        scrollY: 0,
        onclone: (_doc, clonedEl) => {
          if (clonedEl instanceof HTMLElement) {
            clonedEl.style.backgroundColor = "#171717";
            clonedEl.style.boxShadow = "none";
            clonedEl.style.border = "none";
          }
          _doc.body.style.backgroundColor = "#171717";
          _doc.documentElement.style.backgroundColor = "#171717";
          // Neutralize filters and fix box-shadow rendering on all child elements
          const allEls = clonedEl.querySelectorAll("*");
          allEls.forEach((el) => {
            if (el instanceof HTMLElement) {
              el.style.filter = "none";
              el.style.backdropFilter = "none";
              el.style.willChange = "auto";
              // Fix box-shadow rendering: convert inset green shadows to borderBottom
              const shadow = el.style.boxShadow || _doc.defaultView?.getComputedStyle(el).boxShadow || "";
              if (shadow && shadow !== "none") {
                if (shadow.includes("inset") && shadow.includes("00d992")) {
                  el.style.boxShadow = "none";
                  el.style.borderBottom = "2px solid #00d992";
                } else {
                  el.style.boxShadow = "none";
                }
              }
            }
          });
          // Replace soft hyphens to prevent canvas rendering glitches
          const walker = _doc.createTreeWalker(clonedEl, NodeFilter.SHOW_TEXT);
          while (walker.nextNode()) {
            const node = walker.currentNode;
            if (node.textContent && node.textContent.includes("\u00AD")) {
              node.textContent = node.textContent.replace(/\u00AD/g, "\u200B");
            }
          }
        },
      });

      const imgData2 = canvas2.toDataURL("image/jpeg", 0.92);

      // CV as one full-height page (no A4 splitting): page 1 = cover, page 2 = entire CV
      const cvBgR = 23;
      const cvBgG = 23;
      const cvBgB = 23; // neutral-900 #171717

      const imgWidth = pdfWidth;
      const imgHeight = (canvas2.height * pdfWidth) / canvas2.width;

      // Add second page with height = full CV content so it stays one complete page
      pdf.addPage([pdfWidth, imgHeight], "p");
      pdf.setFillColor(cvBgR, cvBgG, cvBgB);
      pdf.rect(0, 0, pdfWidth, imgHeight, "F");
      pdf.addImage(imgData2, "JPEG", 0, 0, imgWidth, imgHeight);

      // Restore blur classes
      blurElems.forEach((el) => el.classList.add("blur-xl"));

      // Build filename
      const nameParts = (candidate.name || "Candidate")
        .trim()
        .split(/\s+/)
        .filter(Boolean);
      const first = (nameParts[0] ?? "firstname").replace(/[/\\:*?"<>|]/g, "_");
      const last = (nameParts.slice(1).join("_") || "lastname")
        .replace(/[/\\:*?"<>|]/g, "_")
        .replace(/\s+/g, "_");
      const fileName = `CV_BS_${first}_${last}.pdf`;

      // Export jsPDF as ArrayBuffer for merging
      const cvArrayBuffer = pdf.output("arraybuffer");

      // Fetch candidate documents from Supabase Storage
      let attachmentDocs: { name: string; path: string }[] = [];
      try {
        const { data: fileList, error: listError } = await supabase.storage
          .from("candidate-documents")
          .list(candidate.id, { limit: 200 });

        if (!listError && fileList && fileList.length > 0) {
          // Filter out starred CV document
          const markedCvPath = localStorage.getItem(`cv_document_${candidate.id}`);
          const documentOrderRaw = localStorage.getItem(`document_order_${candidate.id}`);
          let documentOrder: string[] = [];
          if (documentOrderRaw) {
            try { documentOrder = JSON.parse(documentOrderRaw); } catch (_) {}
          }

          const filtered = fileList.filter((f) => {
            const fullPath = `${candidate.id}/${f.name}`;
            return fullPath !== markedCvPath && f.name !== ".emptyFolderPlaceholder";
          });

          // Sort by custom order
          if (documentOrder.length > 0) {
            filtered.sort((a, b) => {
              const pathA = `${candidate.id}/${a.name}`;
              const pathB = `${candidate.id}/${b.name}`;
              const idxA = documentOrder.indexOf(pathA);
              const idxB = documentOrder.indexOf(pathB);
              return (idxA === -1 ? 999 : idxA) - (idxB === -1 ? 999 : idxB);
            });
          }

          attachmentDocs = filtered.map((f) => ({
            name: f.name,
            path: `${candidate.id}/${f.name}`,
          }));
        }
      } catch (e) {
        console.warn("Could not load candidate documents:", e);
      }

      // Merge with pdf-lib
      const mergedPdf = await PDFDocument.create();

      // 1. Copy CV pages (cover + CV)
      const cvDoc = await PDFDocument.load(cvArrayBuffer);
      const cvPages = await mergedPdf.copyPages(cvDoc, cvDoc.getPageIndices());
      cvPages.forEach((page) => mergedPdf.addPage(page));

      // 2. Append each attachment
      for (const doc of attachmentDocs) {
        try {
          const { data: fileData, error: dlError } = await supabase.storage
            .from("candidate-documents")
            .download(doc.path);
          if (dlError || !fileData) {
            console.warn(`Skipping ${doc.name}: download failed`, dlError);
            continue;
          }

          const arrayBuf = await fileData.arrayBuffer();
          const ext = doc.name.split(".").pop()?.toLowerCase() ?? "";

          if (ext === "pdf") {
            const attachPdf = await PDFDocument.load(arrayBuf, { ignoreEncryption: true });
            const pages = await mergedPdf.copyPages(attachPdf, attachPdf.getPageIndices());
            pages.forEach((p) => mergedPdf.addPage(p));
          } else if (["jpg", "jpeg", "png"].includes(ext)) {
            const imgEmbed = ext === "png"
              ? await mergedPdf.embedPng(arrayBuf)
              : await mergedPdf.embedJpg(arrayBuf);
            // A4 in points: 595.28 x 841.89
            const a4W = 595.28;
            const a4H = 841.89;
            const margin = 40;
            const maxW = a4W - 2 * margin;
            const maxH = a4H - 2 * margin;
            const scale = Math.min(maxW / imgEmbed.width, maxH / imgEmbed.height, 1);
            const drawW = imgEmbed.width * scale;
            const drawH = imgEmbed.height * scale;
            const page = mergedPdf.addPage([a4W, a4H]);
            page.drawImage(imgEmbed, {
              x: (a4W - drawW) / 2,
              y: (a4H - drawH) / 2,
              width: drawW,
              height: drawH,
            });
          } else {
            console.log(`Skipping unsupported file type: ${doc.name}`);
          }
        } catch (attachErr) {
          console.warn(`Error attaching ${doc.name}:`, attachErr);
        }
      }

      // Download final merged PDF
      const mergedBytes = await mergedPdf.save();
      const blob = new Blob([mergedBytes as unknown as ArrayBuffer], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("PDF generation failed:", error);
      alert("Failed to generate PDF. Check console for details.");
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <>
      {/* DOWNLOAD BUTTON */}
      <div className="absolute top-32 right-4 z-50">
        <button
          onClick={handleDownload}
          disabled={isDownloading}
          className="px-6 py-2 rounded-md bg-emerald-600 text-white font-semibold hover:bg-emerald-700 transition-colors shadow-lg disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {isDownloading && <Loader2 className="animate-spin" size={18} />}
          {isDownloading ? "Wird erstellt..." : "Download as PDF"}
        </button>
      </div>

      {/* PRINT CONTAINER - A4 pages stacked from top, no gap */}
      <div className="print-container flex flex-col items-center gap-0 bg-neutral-900">
        {/* PAGE 1 - Cover Page (exact A4) */}
        <div
          ref={coverRef}
          className="print-page shrink-0"
          style={{ width: "793px", height: "1122px", minHeight: "1122px" }}
        >
          <MainPage candidate={candidate} forPrint />
        </div>

        {/* PAGE 2+ - CV Details (exact A4 width for first page) */}
        <div ref={cvRef} className="shrink-0 mt-8" style={{ width: "793px" }}>
          <MainCV candidate={candidate} />
        </div>
      </div>
    </>
  );
};

export default CvPrintView;
