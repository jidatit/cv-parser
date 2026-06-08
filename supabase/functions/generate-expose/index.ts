import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { PDFDocument, rgb, StandardFonts } from "https://esm.sh/pdf-lib@1.17.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Auth check
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.76.1');
  const authClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } });
  const { data: { user }, error: authError } = await authClient.auth.getUser();
  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  try {
    const { candidateName, matches } = await req.json();
    console.log("Generating exposé for candidate:", candidateName, "with", matches.length, "matches");

    // Create a new PDF document
    const pdfDoc = await PDFDocument.create();
    
    // Embed fonts
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const italicFont = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

    const pageWidth = 595; // A4 width
    const pageHeight = 842; // A4 height
    const margin = 50;
    const lineHeight = 16;

    // Helper function to wrap text
    const wrapText = (text: string, maxWidth: number, fontSize: number): string[] => {
      if (!text) return [];
      const words = text.split(' ');
      const lines: string[] = [];
      let currentLine = '';
      
      words.forEach(word => {
        const testLine = currentLine ? `${currentLine} ${word}` : word;
        const textWidth = testLine.length * fontSize * 0.5; // Rough approximation
        
        if (textWidth < maxWidth) {
          currentLine = testLine;
        } else {
          if (currentLine) lines.push(currentLine);
          currentLine = word;
        }
      });
      
      if (currentLine) lines.push(currentLine);
      return lines;
    };

    // Create a page for each match
    for (let i = 0; i < matches.length; i++) {
      const match = matches[i];
      const page = pdfDoc.addPage([pageWidth, pageHeight]);
      let yPosition = pageHeight - margin;

      // Header - Page number
      page.drawText(`Exposé - Seite ${i + 1} von ${matches.length}`, {
        x: margin,
        y: yPosition,
        size: 10,
        font: italicFont,
        color: rgb(0.5, 0.5, 0.5),
      });
      yPosition -= 30;

      // Candidate name
      page.drawText(`Kandidat: ${candidateName}`, {
        x: margin,
        y: yPosition,
        size: 14,
        font: boldFont,
        color: rgb(0.2, 0.4, 0.8),
      });
      yPosition -= 40;

      // Job Title
      page.drawText(match.jobTitle || "Position", {
        x: margin,
        y: yPosition,
        size: 22,
        font: boldFont,
        color: rgb(0.1, 0.1, 0.1),
      });
      yPosition -= 35;

      // Company section
      page.drawText("UNTERNEHMEN", {
        x: margin,
        y: yPosition,
        size: 14,
        font: boldFont,
        color: rgb(0.2, 0.4, 0.8),
      });
      yPosition -= 5;
      page.drawLine({
        start: { x: margin, y: yPosition },
        end: { x: pageWidth - margin, y: yPosition },
        thickness: 2,
        color: rgb(0.2, 0.4, 0.8),
      });
      yPosition -= 20;

      // Company name
      if (match.companyName) {
        page.drawText(match.companyName, {
          x: margin,
          y: yPosition,
          size: 16,
          font: boldFont,
          color: rgb(0, 0, 0),
        });
        yPosition -= 25;
      }

      // Company details
      if (match.companyIndustry) {
        page.drawText(`Branche: ${match.companyIndustry}`, {
          x: margin,
          y: yPosition,
          size: 11,
          font: regularFont,
          color: rgb(0.3, 0.3, 0.3),
        });
        yPosition -= lineHeight;
      }

      if (match.companyWebsite) {
        page.drawText(`Website: ${match.companyWebsite}`, {
          x: margin,
          y: yPosition,
          size: 11,
          font: regularFont,
          color: rgb(0.2, 0.4, 0.8),
        });
        yPosition -= lineHeight;
      }

      if (match.companyAddress) {
        page.drawText(`Adresse: ${match.companyAddress}`, {
          x: margin,
          y: yPosition,
          size: 11,
          font: regularFont,
          color: rgb(0.3, 0.3, 0.3),
        });
        yPosition -= lineHeight;
      }

      yPosition -= 10;

      // Company description
      if (match.companyDescription) {
        page.drawText("ÜBER DAS UNTERNEHMEN", {
          x: margin,
          y: yPosition,
          size: 12,
          font: boldFont,
          color: rgb(0.2, 0.4, 0.8),
        });
        yPosition -= 20;

        const descLines = wrapText(match.companyDescription, pageWidth - 2 * margin, 10);
        for (const line of descLines.slice(0, 5)) { // Limit to 5 lines
          page.drawText(line, {
            x: margin,
            y: yPosition,
            size: 10,
            font: regularFont,
            color: rgb(0.2, 0.2, 0.2),
          });
          yPosition -= lineHeight - 2;
        }
        yPosition -= 15;
      }

      // Job section
      page.drawText("POSITION", {
        x: margin,
        y: yPosition,
        size: 14,
        font: boldFont,
        color: rgb(0.2, 0.4, 0.8),
      });
      yPosition -= 5;
      page.drawLine({
        start: { x: margin, y: yPosition },
        end: { x: pageWidth - margin, y: yPosition },
        thickness: 2,
        color: rgb(0.2, 0.4, 0.8),
      });
      yPosition -= 20;

      // Job details
      if (match.jobLocation) {
        page.drawText(`Standort: ${match.jobLocation}`, {
          x: margin,
          y: yPosition,
          size: 11,
          font: regularFont,
          color: rgb(0.3, 0.3, 0.3),
        });
        yPosition -= lineHeight;
      }

      if (match.jobEmploymentType) {
        page.drawText(`Anstellungsart: ${match.jobEmploymentType}`, {
          x: margin,
          y: yPosition,
          size: 11,
          font: regularFont,
          color: rgb(0.3, 0.3, 0.3),
        });
        yPosition -= lineHeight;
      }

      if (match.jobSalaryRange) {
        page.drawText(`Gehaltsspanne: ${match.jobSalaryRange}`, {
          x: margin,
          y: yPosition,
          size: 11,
          font: regularFont,
          color: rgb(0.3, 0.3, 0.3),
        });
        yPosition -= lineHeight;
      }

      if (match.jobExperienceLevel) {
        page.drawText(`Erfahrungslevel: ${match.jobExperienceLevel}`, {
          x: margin,
          y: yPosition,
          size: 11,
          font: regularFont,
          color: rgb(0.3, 0.3, 0.3),
        });
        yPosition -= lineHeight;
      }

      yPosition -= 10;

      // Job description
      if (match.jobDescription) {
        page.drawText("BESCHREIBUNG", {
          x: margin,
          y: yPosition,
          size: 12,
          font: boldFont,
          color: rgb(0.2, 0.4, 0.8),
        });
        yPosition -= 20;

        const descLines = wrapText(match.jobDescription, pageWidth - 2 * margin, 10);
        for (const line of descLines.slice(0, 8)) { // Limit to 8 lines
          if (yPosition < margin + 20) break;
          page.drawText(line, {
            x: margin,
            y: yPosition,
            size: 10,
            font: regularFont,
            color: rgb(0.2, 0.2, 0.2),
          });
          yPosition -= lineHeight - 2;
        }
        yPosition -= 15;
      }

      // Requirements
      if (match.jobRequirements && yPosition > margin + 60) {
        page.drawText("ANFORDERUNGEN", {
          x: margin,
          y: yPosition,
          size: 12,
          font: boldFont,
          color: rgb(0.2, 0.4, 0.8),
        });
        yPosition -= 20;

        const reqLines = wrapText(match.jobRequirements, pageWidth - 2 * margin, 10);
        for (const line of reqLines.slice(0, 5)) { // Limit to 5 lines
          if (yPosition < margin + 20) break;
          page.drawText(line, {
            x: margin,
            y: yPosition,
            size: 10,
            font: regularFont,
            color: rgb(0.2, 0.2, 0.2),
          });
          yPosition -= lineHeight - 2;
        }
      }

      // Skills
      if (match.jobSkills && match.jobSkills.length > 0 && yPosition > margin + 40) {
        yPosition -= 10;
        page.drawText("GEFORDERTE FÄHIGKEITEN", {
          x: margin,
          y: yPosition,
          size: 12,
          font: boldFont,
          color: rgb(0.2, 0.4, 0.8),
        });
        yPosition -= 20;

        const skillsText = match.jobSkills.join(" • ");
        const skillLines = wrapText(skillsText, pageWidth - 2 * margin, 10);
        for (const line of skillLines.slice(0, 3)) { // Limit to 3 lines
          if (yPosition < margin + 20) break;
          page.drawText(line, {
            x: margin,
            y: yPosition,
            size: 10,
            font: regularFont,
            color: rgb(0.2, 0.2, 0.2),
          });
          yPosition -= lineHeight - 2;
        }
      }
    }

    // Save the PDF
    const pdfBytes = await pdfDoc.save();
    
    console.log("Exposé generated successfully, size:", pdfBytes.length, "bytes");

    return new Response(pdfBytes as unknown as BodyInit, {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${candidateName.replace(/\s+/g, "_")}_Expose.pdf"`,
      },
    });
  } catch (error) {
    console.error("Error generating exposé:", error);
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
