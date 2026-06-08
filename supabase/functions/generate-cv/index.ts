import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { PDFDocument, rgb, StandardFonts } from "https://esm.sh/pdf-lib@1.17.1";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Helper function to fetch and embed image
async function embedImage(pdfDoc: any, imageUrl: string): Promise<any | null> {
  try {
    console.log("Fetching image from:", imageUrl);
    const response = await fetch(imageUrl);
    if (!response.ok) {
      console.error("Failed to fetch image:", response.status);
      return null;
    }
    
    const contentType = response.headers.get("content-type") || "";
    const imageBytes = await response.arrayBuffer();
    
    if (contentType.includes("png")) {
      return await pdfDoc.embedPng(imageBytes);
    } else if (contentType.includes("jpeg") || contentType.includes("jpg")) {
      return await pdfDoc.embedJpg(imageBytes);
    } else {
      // Try to detect from URL or just attempt jpg
      if (imageUrl.toLowerCase().includes(".png")) {
        return await pdfDoc.embedPng(imageBytes);
      }
      return await pdfDoc.embedJpg(imageBytes);
    }
  } catch (error) {
    console.error("Error embedding image:", error);
    return null;
  }
}

// Helper function to fetch candidate documents from Supabase Storage
async function fetchCandidateDocuments(
  supabase: any, 
  candidateId: string, 
  excludePath: string | null,
  documentOrder: string[]
): Promise<{ name: string; data: Uint8Array }[]> {
  const documents: { name: string; data: Uint8Array; path: string }[] = [];
  
  try {
    // List all files in candidate folder
    const { data: files, error: listError } = await supabase.storage
      .from('candidate-documents')
      .list(`${candidateId}/`, { sortBy: { column: 'created_at', order: 'asc' } });
    
    if (listError) {
      console.error("Error listing documents:", listError);
      return [];
    }
    
    if (!files || files.length === 0) {
      console.log("No documents found for candidate");
      return [];
    }
    
    // Filter and download PDF documents (exclude marked CV)
    for (const file of files) {
      const filePath = `${candidateId}/${file.name}`;
      
      // Skip if this is the marked CV
      if (excludePath && filePath === excludePath) {
        console.log("Skipping marked CV:", filePath);
        continue;
      }
      
      // Only process PDF files
      if (!file.name.toLowerCase().endsWith('.pdf')) {
        console.log("Skipping non-PDF file:", file.name);
        continue;
      }
      
      try {
        const { data, error } = await supabase.storage
          .from('candidate-documents')
          .download(filePath);
        
        if (error) {
          console.error("Error downloading document:", file.name, error);
          continue;
        }
        
        const arrayBuffer = await data.arrayBuffer();
        documents.push({
          name: file.name,
          path: filePath,
          data: new Uint8Array(arrayBuffer)
        });
        console.log("Downloaded document:", file.name);
      } catch (downloadError) {
        console.error("Error processing document:", file.name, downloadError);
      }
    }
    
    // Sort documents by custom order if provided
    if (documentOrder && documentOrder.length > 0) {
      documents.sort((a, b) => {
        const orderA = documentOrder.indexOf(a.path);
        const orderB = documentOrder.indexOf(b.path);
        
        if (orderA !== -1 && orderB !== -1) {
          return orderA - orderB;
        }
        if (orderA !== -1) return -1;
        if (orderB !== -1) return 1;
        return 0; // Keep original order for unordered documents
      });
      console.log("Documents sorted by custom order");
    }
  } catch (error) {
    console.error("Error fetching candidate documents:", error);
  }
  
  return documents.map(d => ({ name: d.name, data: d.data }));
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Auth check
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
  const authClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } });
  const { data: { user }, error: authError } = await authClient.auth.getUser();
  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  try {
    const { candidate, template, candidateId, markedCvPath, documentOrder } = await req.json();
    console.log("Generating CV for candidate:", candidate.name, "with template:", template);
    console.log("Photo URL:", candidate.photo_url);
    console.log("Candidate ID for documents:", candidateId);
    console.log("Marked CV path to exclude:", markedCvPath);
    console.log("Document order:", documentOrder);

    // Create a new PDF document
    const pdfDoc = await PDFDocument.create();
    
    // Embed fonts
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const italicFont = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

    // Try to embed photo if available
    let photoImage = null;
    if (candidate.photo_url) {
      photoImage = await embedImage(pdfDoc, candidate.photo_url);
    }

    // Add a page
    const page = pdfDoc.addPage([595, 842]); // A4 size
    const { width, height } = page.getSize();
    
    let yPosition = height - 50;
    const margin = 50;
    const lineHeight = 20;
    
    // Photo dimensions
    const photoSize = 80;
    const textStartX = photoImage ? margin + photoSize + 20 : margin;

    // Helper function to add text
    const addText = (text: string, size: number, font: any, color = rgb(0, 0, 0)) => {
      page.drawText(text, {
        x: margin,
        y: yPosition,
        size,
        font,
        color,
      });
      yPosition -= lineHeight;
    };

    // Helper function to add section
    const addSection = (title: string) => {
      yPosition -= 10;
      page.drawText(title, {
        x: margin,
        y: yPosition,
        size: 16,
        font: boldFont,
        color: rgb(0.2, 0.2, 0.6),
      });
      yPosition -= 5;
      page.drawLine({
        start: { x: margin, y: yPosition },
        end: { x: width - margin, y: yPosition },
        thickness: 2,
        color: rgb(0.2, 0.2, 0.6),
      });
      yPosition -= 20;
    };

    // Template-specific styling
    const getTemplateColors = (templateId: string) => {
      switch (templateId) {
        case "modern":
          return { primary: rgb(0.2, 0.4, 0.8), secondary: rgb(0.3, 0.3, 0.3) };
        case "classic":
          return { primary: rgb(0.2, 0.2, 0.2), secondary: rgb(0.4, 0.4, 0.4) };
        case "creative":
          return { primary: rgb(0.6, 0.2, 0.6), secondary: rgb(0.3, 0.3, 0.3) };
        case "minimal":
          return { primary: rgb(0.2, 0.6, 0.4), secondary: rgb(0.3, 0.3, 0.3) };
        default:
          return { primary: rgb(0.2, 0.2, 0.2), secondary: rgb(0.4, 0.4, 0.4) };
      }
    };

    const colors = getTemplateColors(template);

    // Draw photo if available
    if (photoImage) {
      const imgDims = photoImage.scale(1);
      const scale = Math.min(photoSize / imgDims.width, photoSize / imgDims.height);
      
      page.drawImage(photoImage, {
        x: margin,
        y: yPosition - photoSize + 25,
        width: imgDims.width * scale,
        height: imgDims.height * scale,
      });
    }

    // Header - Name (positioned next to photo if present)
    page.drawText(candidate.name || "Kandidat", {
      x: textStartX,
      y: yPosition,
      size: 28,
      font: boldFont,
      color: colors.primary,
    });
    yPosition -= 35;

    // Contact Information (positioned next to photo if present)
    const contactInfo: string[] = [];
    if (candidate.position) contactInfo.push(candidate.position);
    if (candidate.email) contactInfo.push(candidate.email);
    if (candidate.phone) contactInfo.push(candidate.phone);
    if (candidate.location) contactInfo.push(candidate.location);
    
    contactInfo.forEach((info) => {
      page.drawText(info, {
        x: textStartX,
        y: yPosition,
        size: 10,
        font: regularFont,
        color: colors.secondary,
      });
      yPosition -= 15;
    });

    // Ensure we move past the photo area before continuing
    if (photoImage) {
      const photoBottomY = height - 50 - photoSize - 10;
      if (yPosition > photoBottomY) {
        yPosition = photoBottomY;
      }
    }

    yPosition -= 10;

    // Professional Summary / AI Summary
    if (candidate.ai_summary || candidate.desired_position || candidate.experience || candidate.summary) {
      addSection("BERUFSPROFIL");
      
      // If AI summary exists, use it as the main summary
      if (candidate.ai_summary) {
        const summaryLines = candidate.ai_summary.match(/.{1,80}/g) || [candidate.ai_summary];
        summaryLines.forEach((line: string) => {
          if (yPosition < 100) return;
          page.drawText(line, {
            x: margin,
            y: yPosition,
            size: 11,
            font: italicFont,
            color: rgb(0.2, 0.2, 0.2),
          });
          yPosition -= 15;
        });
        yPosition -= 5;
      }
      
      if (candidate.desired_position) {
        addText(`Gewünschte Position: ${candidate.desired_position}`, 11, regularFont);
      }
      if (candidate.experience) {
        addText(`Erfahrung: ${candidate.experience}`, 11, regularFont);
      }
    }

    // Signature Achievements
    if (candidate.signature_achievements && candidate.signature_achievements.length > 0) {
      addSection("SIGNATURE ACHIEVEMENTS");
      
      candidate.signature_achievements.forEach((achievement: string) => {
        if (yPosition < 100) return;
        page.drawText(`★ ${achievement}`, {
          x: margin,
          y: yPosition,
          size: 11,
          font: regularFont,
          color: rgb(0.2, 0.2, 0.2),
        });
        yPosition -= lineHeight;
      });
    }

    // Personal Insights (Growth Potential & Most Proud Of)
    const hasPersonalInsights = (candidate.growth_potential && candidate.growth_potential.length > 0) || candidate.most_proud_of;
    if (hasPersonalInsights) {
      addSection("PERSÖNLICHE STÄRKEN");
      
      if (candidate.growth_potential && candidate.growth_potential.length > 0) {
        page.drawText("Entwicklungspotential:", {
          x: margin,
          y: yPosition,
          size: 10,
          font: boldFont,
          color: colors.secondary,
        });
        yPosition -= 15;
        
        candidate.growth_potential.forEach((point: string) => {
          if (yPosition < 100) return;
          page.drawText(`• ${point}`, {
            x: margin + 10,
            y: yPosition,
            size: 10,
            font: regularFont,
            color: rgb(0.2, 0.2, 0.2),
          });
          yPosition -= 15;
        });
        yPosition -= 5;
      }
      
      if (candidate.most_proud_of) {
        page.drawText("Stolz auf:", {
          x: margin,
          y: yPosition,
          size: 10,
          font: boldFont,
          color: colors.secondary,
        });
        yPosition -= 15;
        
        const proudLines = candidate.most_proud_of.match(/.{1,75}/g) || [candidate.most_proud_of];
        proudLines.forEach((line: string) => {
          if (yPosition < 100) return;
          page.drawText(line, {
            x: margin + 10,
            y: yPosition,
            size: 10,
            font: regularFont,
            color: rgb(0.2, 0.2, 0.2),
          });
          yPosition -= 15;
        });
      }
    }

    // Work Experience
    if (candidate.work_experience && candidate.work_experience.length > 0) {
      addSection("BERUFSERFAHRUNG");
      
      candidate.work_experience.forEach((exp: any) => {
        if (yPosition < 100) {
          const newPage = pdfDoc.addPage([595, 842]);
          yPosition = height - 50;
        }
        
        page.drawText(exp.position || "Position", {
          x: margin,
          y: yPosition,
          size: 12,
          font: boldFont,
          color: rgb(0, 0, 0),
        });
        yPosition -= lineHeight;
        
        page.drawText(exp.company || "Unternehmen", {
          x: margin,
          y: yPosition,
          size: 11,
          font: italicFont,
          color: colors.secondary,
        });
        yPosition -= lineHeight;
        
        if (exp.startDate || exp.endDate) {
          page.drawText(`${exp.startDate || "N/A"} - ${exp.endDate || "Heute"}`, {
            x: margin,
            y: yPosition,
            size: 10,
            font: regularFont,
            color: colors.secondary,
          });
          yPosition -= lineHeight;
        }
        
        if (exp.description) {
          const descLines = exp.description.match(/.{1,80}/g) || [exp.description];
          descLines.forEach((line: string) => {
            if (yPosition < 100) return;
            page.drawText(line, {
              x: margin,
              y: yPosition,
              size: 10,
              font: regularFont,
              color: rgb(0.2, 0.2, 0.2),
            });
            yPosition -= 15;
          });
        }
        yPosition -= 10;
      });
    }

    // Education
    if (candidate.education && candidate.education.length > 0) {
      addSection("AUSBILDUNG");
      
      candidate.education.forEach((edu: any) => {
        if (yPosition < 100) {
          const newPage = pdfDoc.addPage([595, 842]);
          yPosition = height - 50;
        }
        
        page.drawText(edu.degree || "Abschluss", {
          x: margin,
          y: yPosition,
          size: 12,
          font: boldFont,
          color: rgb(0, 0, 0),
        });
        yPosition -= lineHeight;
        
        const eduInfo: string[] = [];
        if (edu.field) eduInfo.push(edu.field);
        if (edu.institution) eduInfo.push(edu.institution);
        
        if (eduInfo.length > 0) {
          page.drawText(eduInfo.join(" - "), {
            x: margin,
            y: yPosition,
            size: 11,
            font: italicFont,
            color: colors.secondary,
          });
          yPosition -= lineHeight;
        }
        
        if (edu.startDate || edu.endDate) {
          page.drawText(`${edu.startDate || "N/A"} - ${edu.endDate || "N/A"}`, {
            x: margin,
            y: yPosition,
            size: 10,
            font: regularFont,
            color: colors.secondary,
          });
          yPosition -= lineHeight;
        }
        
        if (edu.grade) {
          page.drawText(`Note: ${edu.grade}`, {
            x: margin,
            y: yPosition,
            size: 10,
            font: regularFont,
            color: rgb(0.2, 0.2, 0.2),
          });
          yPosition -= lineHeight;
        }
        yPosition -= 10;
      });
    }

    // Skills
    if (candidate.skills && candidate.skills.length > 0) {
      addSection("FÄHIGKEITEN");
      
      const skillsText = candidate.skills.join(" • ");
      const skillLines = skillsText.match(/.{1,80}/g) || [skillsText];
      
      skillLines.forEach((line: string) => {
        if (yPosition < 100) return;
        page.drawText(line, {
          x: margin,
          y: yPosition,
          size: 11,
          font: regularFont,
          color: rgb(0.2, 0.2, 0.2),
        });
        yPosition -= lineHeight;
      });
    }

    // Languages with 5-point rating
    if (candidate.languages && candidate.languages.length > 0) {
      addSection("SPRACHEN");
      
      candidate.languages.forEach((lang: { name: string; level: number }) => {
        if (yPosition < 100) return;
        
        // Draw language name
        page.drawText(lang.name, {
          x: margin,
          y: yPosition,
          size: 11,
          font: regularFont,
          color: rgb(0.2, 0.2, 0.2),
        });
        
        // Draw 5-point rating circles
        const circleStartX = margin + 120;
        const circleRadius = 4;
        const circleSpacing = 12;
        
        for (let i = 1; i <= 5; i++) {
          const circleX = circleStartX + (i - 1) * circleSpacing;
          const isFilled = i <= (lang.level || 0);
          
          if (isFilled) {
            // Filled circle
            page.drawCircle({
              x: circleX,
              y: yPosition + 3,
              size: circleRadius,
              color: colors.primary,
            });
          } else {
            // Empty circle (outline)
            page.drawCircle({
              x: circleX,
              y: yPosition + 3,
              size: circleRadius,
              borderColor: colors.primary,
              borderWidth: 1,
            });
          }
        }
        
        yPosition -= lineHeight;
      });
    }

    // Further Education (includes certifications)
    if (candidate.further_education && candidate.further_education.length > 0) {
      addSection("WEITERBILDUNGEN & ZERTIFIKATE");
      
      candidate.further_education.forEach((fe: any) => {
        if (yPosition < 100) return;
        
        const feName = typeof fe === 'string' ? fe : (fe.name || fe);
        const feDate = typeof fe === 'object' && fe.date ? ` (${fe.date})` : '';
        
        page.drawText(`• ${feName}${feDate}`, {
          x: margin,
          y: yPosition,
          size: 11,
          font: regularFont,
          color: rgb(0.2, 0.2, 0.2),
        });
        yPosition -= lineHeight;
      });
    }

    // Additional Information
    const hasAdditionalInfo = candidate.current_salary || candidate.desired_salary || 
      candidate.willing_to_relocate || candidate.workload || candidate.notice_period || 
      candidate.max_commute || candidate.industry;
    
    if (hasAdditionalInfo) {
      addSection("WEITERE INFORMATIONEN");
      
      if (candidate.industry) {
        addText(`Branche: ${candidate.industry}`, 11, regularFont);
      }
      if (candidate.workload) {
        addText(`Arbeitspensum: ${candidate.workload}`, 11, regularFont);
      }
      if (candidate.current_salary) {
        addText(`Aktuelles Gehalt: ${candidate.current_salary}`, 11, regularFont);
      }
      if (candidate.desired_salary) {
        addText(`Gewünschtes Gehalt: ${candidate.desired_salary}`, 11, regularFont);
      }
      if (candidate.notice_period) {
        addText(`Kündigungsfrist: ${candidate.notice_period}`, 11, regularFont);
      }
      if (candidate.willing_to_relocate) {
        addText(`Umzugsbereitschaft: ${candidate.willing_to_relocate}`, 11, regularFont);
      }
      if (candidate.max_commute) {
        addText(`Max. Pendeldistanz: ${candidate.max_commute}`, 11, regularFont);
      }
    }

    // Fetch and append candidate documents (excluding the marked CV)
    if (candidateId) {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, supabaseServiceKey);
      
      const attachedDocs = await fetchCandidateDocuments(supabase, candidateId, markedCvPath || null, documentOrder || []);
      
      if (attachedDocs.length > 0) {
        console.log(`Appending ${attachedDocs.length} documents to CV`);
        
        for (const doc of attachedDocs) {
          try {
            const externalPdf = await PDFDocument.load(doc.data);
            const copiedPages = await pdfDoc.copyPages(externalPdf, externalPdf.getPageIndices());
            
            copiedPages.forEach((page) => {
              pdfDoc.addPage(page);
            });
            
            console.log(`Appended document: ${doc.name} (${copiedPages.length} pages)`);
          } catch (appendError) {
            console.error(`Error appending document ${doc.name}:`, appendError);
            // Continue with other documents even if one fails
          }
        }
      }
    }

    // Save the PDF
    const pdfBytes = await pdfDoc.save();
    
    console.log("CV generated successfully, size:", pdfBytes.length, "bytes");

    return new Response(pdfBytes as unknown as BodyInit, {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${candidate.name.replace(/\s+/g, "_")}_CV.pdf"`,
      },
    });
  } catch (error) {
    console.error("Error generating CV:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
