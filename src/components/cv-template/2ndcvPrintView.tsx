import React, { useRef, useEffect } from "react";
import html2canvas from "html2canvas-pro";
import jsPDF from "jspdf";
import IntroPage, { IntroPageProps } from "./2ndcvIntroPage";
import CvTemplate, { CVData } from "./2ndcvMainPage";

export interface JobClient {
  name?: string;
  website?: string;
  email?: string;
  phone?: string;
  address?: string;
  description?: string;
  logo_url?: string | null;
}

export interface JobForTemplate {
  title?: string;
  created_at?: string;
  location?: string;
  employment_type?: string;
  salary_range?: string;
  description?: string;
  responsibilities?: string | string[] | null;
  benefits?: string | string[] | null;
  clients?: JobClient | null;
}

export interface CompanyOverride {
  name: string;
  email?: string;
  phone?: string;
  website?: string;
}

interface PrintPageProps {
  job: JobForTemplate;
  presenterName: string;
  presenterEmail: string;
  presenterPhone?: string;
  companyOverride?: CompanyOverride;
  hideDownloadButton?: boolean;
  triggerDownloadRef?: React.MutableRefObject<(() => void) | null>;
  onDownloadComplete?: () => void;
  showIntro?: boolean;
  showCv?: boolean;
  introSubtitleOverride?: string;
}

function toPlainLines(value: string | string[] | null | undefined): string[] {
  if (!value) return [];
  const str = Array.isArray(value) ? value.join("\n") : String(value);
  const trimmed = str.trim();
  if (!trimmed) return [];

  if (/<p[\s>]/i.test(trimmed)) {
    const parts: string[] = [];
    const regex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
    let m;
    while ((m = regex.exec(trimmed)) !== null) {
      const text = m[1]
        .replace(/<[^>]*>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (text) parts.push(text);
    }
    if (parts.length > 0) return parts;
  }

  const plain = trimmed
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return plain
    ? plain
        .split(/\n/)
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&uuml;/g, "ü").replace(/&Uuml;/g, "Ü")
    .replace(/&auml;/g, "ä").replace(/&Auml;/g, "Ä")
    .replace(/&ouml;/g, "ö").replace(/&Ouml;/g, "Ö")
    .replace(/&szlig;/g, "ß")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&ndash;/g, "–").replace(/&mdash;/g, "—")
    .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(Number(num)));
}

function parseBulletPoints(
  text: string | string[] | null | undefined,
): string[] {
  if (!text) return [];
  let str = Array.isArray(text) ? text.join("\n") : String(text);
  str = str
    .replace(/<\/li>\s*<li[^>]*>/gi, "\n")
    .replace(/<li[^>]*>/gi, "\n")
    .replace(/<\/li>/gi, "\n");
  str = str.replace(/<[^>]*>/g, " ");
  str = decodeHtmlEntities(str);
  return str
    .split(/\n/)
    .map((line) => line.replace(/^[•\-*]\s*/, "").trim())
    .filter(Boolean);
}

function buildIntroData(props: PrintPageProps): IntroPageProps {
  const {
    job,
    presenterName,
    presenterEmail,
    presenterPhone,
    companyOverride,
    introSubtitleOverride,
  } = props;
  const client = job?.clients ?? {};

  return {
    year: new Date().getFullYear().toString(),
    title: "Exposé",
    subtitle:
      typeof introSubtitleOverride === "string" && introSubtitleOverride
        ? introSubtitleOverride
        : job?.title
          ? `${job.title}`
          : "Für Position",
    presentedBy: {
      label: "Vorgelegt von",
      name: presenterName || "",
      email: presenterEmail || "",
      phone: presenterPhone,
    },
    company: companyOverride
      ? {
          label: companyOverride.name,
          name: companyOverride.name,
          email: companyOverride.email ?? "",
          phone: companyOverride.phone ?? "",
          website: "beckettstone.ch",
        }
      : {
          label: "Beckett Stone",
          name: "Beckett Stone",
          email: "info@beckettstone.ch",
          phone: "+41 76 801 83 76",
          website: "beckettstone.ch",
        },
  };
}

function buildCvData(job: JobForTemplate): CVData {
  const client = (job?.clients ?? {}) as JobClient;

  const createdAt = job?.created_at ? new Date(job.created_at) : new Date();
  const dateLabel = createdAt.toLocaleDateString("de-CH", {
    month: "long",
    year: "numeric",
  });

  const title = job?.title ?? "";
  const parts = title.split(" ");
  const firstWord = parts[0] ?? "";
  const surname = parts.slice(1).join(" ") ?? "";

  const responsibilitiesLines = parseBulletPoints(job?.responsibilities);
  const benefitsLines = parseBulletPoints(job?.benefits);
  const profileParagraphs = [...toPlainLines(job?.description)];

  const locationLabel = job?.location
    ? `Standort: ${job.location}`
    : "Standort: –";
  const employmentLabel = job?.employment_type
    ? `Anstellung: ${job.employment_type}`
    : "Anstellung: –";
  const capacityLabel = job?.salary_range
    ? `Gehaltsband: ${job.salary_range}`
    : "";

  return {
    personal: {
      name: firstWord,
      surname,
      position: title,
      date: dateLabel,
    },
    company: {
      name: client.name ?? "Unternehmen",
      location: client.address ?? client.name ?? "",
      logoUrl: client.logo_url ?? null,
      description: client?.description ?? "",
    },
    importantInfo: {
      location: locationLabel,
      employment: employmentLabel,
      capacity: capacityLabel,
    },
    profile: {
      title: "UNTERNEHMENSPROFIL",
      paragraphs:
        profileParagraphs.length > 0
          ? profileParagraphs
          : ["Keine Unternehmensbeschreibung verfügbar."],
    },
    responsibilities: {
      title: "VERANTWORTLICHKEITEN",
      items:
        responsibilitiesLines.length > 0
          ? responsibilitiesLines.map((text) => ({ text }))
          : [{ text: "Verantwortlichkeiten wurden noch nicht definiert." }],
    },
    benefits: {
      title: "BENEFITS",
      items:
        benefitsLines.length > 0
          ? benefitsLines.map((text) => ({ text }))
          : [{ text: "Benefits wurden noch nicht definiert." }],
    },
  };
}

const PrintPage: React.FC<PrintPageProps> = (props) => {
  const introRef = useRef<HTMLDivElement>(null);
  const cvRef = useRef<HTMLDivElement>(null);

  const introData = buildIntroData(props);
  const cvData = buildCvData(props.job);
  const showIntro = props.showIntro ?? true;
  const showCv = props.showCv ?? true;

  const handleDownload = async () => {
    try {
      const blurElems = document.querySelectorAll(
        ".blur-xl, .blur-lg, .blur-md",
      );
      blurElems.forEach((el) =>
        el.classList.remove("blur-xl", "blur-lg", "blur-md"),
      );

      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
        compress: true,
        precision: 16,
      });

      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const BLEED = 2;
      const SCALE = 3;

      const captureOptions = (bgColor: string) => ({
        scale: SCALE,
        useCORS: true,
        allowTaint: true,
        backgroundColor: bgColor,
        logging: false,
        imageTimeout: 0,
        width: 793,
        height: 1122,
        windowWidth: 793,
        windowHeight: 1122,
        x: 0,
        y: 0,
        scrollX: 0,
        scrollY: 0,
        onclone: (clonedDoc: Document, clonedElement: HTMLElement) => {
          if (clonedElement?.style) {
            clonedElement.style.width = "793px";
            clonedElement.style.minWidth = "793px";
            clonedElement.style.maxWidth = "793px";
            clonedElement.style.boxSizing = "border-box";
            clonedElement.style.transform = "translateZ(0)";
            clonedElement.style.backfaceVisibility = "hidden";
            (clonedElement.style as any).WebkitFontSmoothing = "antialiased";
            (clonedElement.style as any).MozOsxFontSmoothing = "grayscale";
            clonedElement.style.textRendering = "optimizeLegibility";
            clonedElement.style.imageRendering = "high-quality";
            clonedElement.style.border = "none";
            clonedElement.style.outline = "none";
            clonedElement.style.boxShadow = "none";
            clonedElement.style.margin = "0";
            clonedElement.style.padding = "0";
          }

          const allElements = clonedDoc.querySelectorAll("*");
          allElements.forEach((el) => {
            if (el instanceof HTMLElement) {
              (el.style as any).WebkitFontSmoothing = "antialiased";
              (el.style as any).MozOsxFontSmoothing = "grayscale";
              el.style.textRendering = "optimizeLegibility";
              el.style.fontKerning = "normal";
              el.style.filter = "none";
              el.style.backdropFilter = "none";
              el.style.transform = "translateZ(0)";
              el.style.willChange = "auto";
            }
          });

          // Fix: Canvas fillText() renders \u00AD as visible glyph.
          // Replace with \u200B (zero-width space) which is truly invisible
          // on canvas AND provides line-break opportunities.
          const introWalker = clonedDoc.createTreeWalker(clonedElement, NodeFilter.SHOW_TEXT);
          let introTextNode: Node | null;
          while ((introTextNode = introWalker.nextNode())) {
            if (introTextNode.textContent && introTextNode.textContent.includes("\u00AD")) {
              introTextNode.textContent = introTextNode.textContent.replace(/\u00AD/g, "\u200B");
            }
          }

        },
      });
      // INTRO PAGE
      if (showIntro && introRef.current) {
        console.log("Capturing intro page...");
        const canvas1 = await html2canvas(
          introRef.current,
          captureOptions("#0a0a0a"),
        );

        console.log(`Intro canvas: ${canvas1.width}×${canvas1.height}`);
        const imgData1 = canvas1.toDataURL("image/jpeg", 0.92);

        pdf.setFillColor(10, 10, 10);
        pdf.rect(0, 0, pdfWidth, pdfHeight);
        pdf.fill();

        pdf.addImage(
          imgData1,
          "JPEG",
          -BLEED,
          0,
          pdfWidth + 2 * BLEED,
          pdfHeight,
          undefined,
          "FAST",
        );
      }

      // CV PAGE - CRITICAL FIX: Use 793px to match component width
      if (showCv && cvRef.current) {
        console.log("Capturing CV page...");

        const cvHeight = cvRef.current.scrollHeight;

        // Pre-convert cross-origin logo images to rasterized PNG data URLs
        // SVG images fail silently in html2canvas, so we rasterize to PNG first
        let logoDataUrl: string | null = null;
        const allImgs = cvRef.current.querySelectorAll('img');
        for (const img of allImgs) {
          if (img.src && img.src.startsWith('http') && !img.src.startsWith('data:') && !img.src.includes('/Element') && !img.src.includes('/WhatsApp') && !img.src.includes('/hdtry')) {
            try {
              const response = await fetch(img.src);
              const blob = await response.blob();
              const objectUrl = URL.createObjectURL(blob);

              // Rasterize: load into Image, draw on canvas, export as PNG
              logoDataUrl = await new Promise<string>((resolve, reject) => {
                const tempImg = new Image();
                tempImg.crossOrigin = 'anonymous';
                tempImg.onload = () => {
                  const rasterCanvas = document.createElement('canvas');
                  const scale = 3;
                  rasterCanvas.width = (tempImg.naturalWidth || 300) * scale;
                  rasterCanvas.height = (tempImg.naturalHeight || 300) * scale;
                  const ctx = rasterCanvas.getContext('2d');
                  if (ctx) {
                    ctx.scale(scale, scale);
                    ctx.drawImage(tempImg, 0, 0, tempImg.naturalWidth || 300, tempImg.naturalHeight || 300);
                  }
                  URL.revokeObjectURL(objectUrl);
                  resolve(rasterCanvas.toDataURL('image/png'));
                };
                tempImg.onerror = () => {
                  URL.revokeObjectURL(objectUrl);
                  reject(new Error('Image load failed'));
                };
                tempImg.src = objectUrl;
              });
              console.log("Logo rasterized to PNG data URL for PDF");
            } catch (e) {
              console.warn('Could not rasterize logo for PDF:', e);
            }
            break;
          }
        }

        const canvas2 = await html2canvas(cvRef.current, {
          scale: SCALE,
          useCORS: true,
          backgroundColor: "#ffffff",
          logging: false,
          width: 793,
          height: cvHeight,
          windowWidth: 793,
          windowHeight: cvHeight,
          x: 0,
          y: 0,
          scrollX: 0,
          scrollY: 0,
          onclone: (clonedDoc: Document, clonedEl: HTMLElement) => {
            if (clonedEl?.style) {
              clonedEl.style.width = "793px";
              clonedEl.style.minWidth = "793px";
              clonedEl.style.maxWidth = "793px";
              clonedEl.style.boxSizing = "border-box";
              clonedEl.style.backgroundColor = "#ffffff";
              clonedEl.style.boxShadow = "none";
              clonedEl.style.border = "none";
            }
            clonedDoc.body.style.backgroundColor = "#ffffff";
            clonedDoc.documentElement.style.backgroundColor = "#ffffff";

            // Fix: Prevent html2canvas from treating overflow-wrap:break-word
            // as word-break:break-word (which allows breaks at any character)
            const h1Elements = clonedEl.querySelectorAll('h1');
            h1Elements.forEach((h1) => {
              if (h1 instanceof HTMLElement) {
                h1.style.overflowWrap = 'normal';
                h1.style.wordBreak = 'normal';
              }
            });

            // Fix: Canvas fillText() renders \u00AD as visible glyph.
            // Replace with \u200B (zero-width space) which is truly invisible
            // on canvas AND provides line-break opportunities.
            const cvWalker = clonedDoc.createTreeWalker(clonedEl, NodeFilter.SHOW_TEXT);
            let cvTextNode: Node | null;
            while ((cvTextNode = cvWalker.nextNode())) {
              if (cvTextNode.textContent && cvTextNode.textContent.includes("\u00AD")) {
                cvTextNode.textContent = cvTextNode.textContent.replace(/\u00AD/g, "\u200B");
              }
            }

            // Replace cross-origin logo src with pre-fetched rasterized PNG data URL
            if (logoDataUrl) {
              const clonedImgs = clonedEl.querySelectorAll('img');
              clonedImgs.forEach((img) => {
                if (img.src && img.src.startsWith('http') && !img.src.startsWith('data:') && !img.src.includes('/Element') && !img.src.includes('/WhatsApp') && !img.src.includes('/hdtry')) {
                  img.src = logoDataUrl!;
                }
              });
            }
          },
        });

        console.log(`CV canvas: ${canvas2.width}×${canvas2.height}`);
        const imgData2 = canvas2.toDataURL("image/jpeg", 0.92);

        const imgWidth = pdfWidth;
        const imgHeight = (canvas2.height * pdfWidth) / canvas2.width;

        pdf.addPage([pdfWidth, imgHeight], "p");

        pdf.setFillColor(255, 255, 255);
        pdf.rect(0, 0, pdfWidth, imgHeight);
        pdf.fill();

        pdf.addImage(
          imgData2,
          "JPEG",
          -BLEED,
          0,
          imgWidth + 2 * BLEED,
          imgHeight,
          undefined,
          "FAST",
        );
      }

      blurElems.forEach((el) =>
        el.classList.add("blur-xl", "blur-lg", "blur-md"),
      );

      pdf.save(`Job_Expose_${new Date().toISOString().slice(0, 10)}.pdf`);
      console.log("PDF generated successfully");
    } catch (err) {
      console.error("PDF generation failed:", err);
      alert("Failed to create PDF. Check console for details.");
    } finally {
      props.onDownloadComplete?.();
    }
  };

  useEffect(() => {
    if (props.triggerDownloadRef) {
      props.triggerDownloadRef.current = handleDownload;
      return () => {
        props.triggerDownloadRef!.current = null;
      };
    }
  }, [props.triggerDownloadRef]);

  return (
    <>
      {!props.hideDownloadButton && (
        <div className="absolute top-32 right-4 z-50">
          <button
            onClick={handleDownload}
            className="px-6 mt-2 py-2 rounded-md bg-emerald-600 text-white font-semibold hover:bg-emerald-700 transition-colors shadow-lg"
          >
            Download as PDF
          </button>
        </div>
      )}

      <div className="print-container min-h-screen flex flex-col items-center gap-6 py-0 px-0">
        {showIntro && (
          <div
            ref={introRef}
            className="print-page"
            data-page="intro"
            style={{
              width: "793px",
              height: "1122px",
              minHeight: "1122px",
              minWidth: "793px",
              maxWidth: "793px",
              flexShrink: 0,
              background: "#0a0a0a",
              overflow: "hidden",
              border: "none",
              outline: "none",
              boxShadow: "none",
              position: "relative",
            }}
          >
            <IntroPage {...introData} />
          </div>
        )}

        {showCv && (
          <div
            ref={cvRef}
            data-page="cv"
            style={{
              width: "793px",
              minWidth: "793px",
              maxWidth: "793px",
              minHeight: "1122px",
              flexShrink: 0,
              background: "none",
              border: "none",
              outline: "none",
              boxShadow: "none",
              padding: "0",
              margin: "0",
              position: "relative",
            }}
          >
            <CvTemplate data={cvData} />
          </div>
        )}
      </div>
    </>
  );
};

export default PrintPage;
