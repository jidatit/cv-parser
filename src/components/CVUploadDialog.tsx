import { useState, useRef, DragEvent } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload, FileText, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ParsedCandidateData } from "@/services/CVParserService";
import { supabase } from "@/integrations/supabase/client";
import { processWorkExperienceCompanies } from "@/lib/companyUtils";
import { extractTextFromFile, cleanExtractedText } from "@/lib/fileParser";
import { t } from "i18next";

interface CVUploadDialogProps {
  onCandidateCreated?: () => void;
  onCandidateParsed?: (data: ParsedCandidateData) => void;
  candidateId?: string;
  candidateName?: string;
}

// Map structure-cv-with-gemini response to ParsedCandidateData format
// function mapGeminiResponseToParseData(data: any): ParsedCandidateData {
//   return {
//     person: {
//       full_name: data.person?.full_name || "",
//       current_role: data.experience?.[0]?.title || "",
//       email: data.person?.email || "",
//       phone: data.person?.phone || "",
//       location: data.person?.location || "",
//       links: [data.person?.linkedin, data.person?.github].filter(Boolean),
//       birthdate: data.person?.birthdate || null,
//     },
//     skills: data.skills || [],
//     languages:
//       data.languages?.map((lang: any) => ({
//         name: lang.name || "",
//         level: lang.level || "",
//       })) || [],
//     experiences:
//       data.experience?.map((exp: any) => ({
//         company_name: exp.company || "",
//         role_title: exp.title || "",
//         start_date: exp.start || "",
//         end_date: exp.end || "",
//         description: exp.description || "",
//       })) || [],
//     education:
//       data.education?.map((edu: any) => ({
//         institution: edu.institution || "",
//         degree: edu.degree || "",
//         start_date: edu.start || "",
//         end_date: edu.end || "",
//       })) || [],
//     certifications:
//       data.certifications?.map((cert: any) => ({
//         name: cert.name || "",
//         issuer: cert.issuer || "",
//         date: cert.date || "",
//       })) || [],
//   };
// }

function mapGeminiResponseToParseData(data: any): ParsedCandidateData {
  return {
    person: {
      full_name: data.person?.full_name || "",
      current_role: data.experience?.[0]?.title || "",
      email: data.person?.email || "",
      phone: data.person?.phone || "",
      location: data.person?.location || "",
      links: [data.person?.linkedin, data.person?.github].filter(Boolean),
      birthdate: data.person?.birthdate || null,
    },
    skills: data.skills || [],
    languages:
      data.languages?.map((lang: any) => ({
        name: lang.name || "",
        level: lang.proficiency || lang.level || "",
      })) || [],
    experiences:
      data.experience?.map((exp: any) => ({
        company_name: exp.company || "",
        role_title: exp.title || "",
        start_date: exp.start || "",
        end_date: exp.end || "",
        description: exp.description || "",
      })) || [],
    education:
      data.education?.map((edu: any) => ({
        institution: edu.institution || "",
        degree: edu.degree || "",
        start_date: edu.start || "",
        end_date: edu.end || "",
        grade: edu.grade || "",
      })) || [],

    further_education:
      data.further_education?.map((furtherEdu: any) => ({
        name: furtherEdu.name || "",
        institution: furtherEdu.institution || "",
        date: furtherEdu.date || "",
        description: furtherEdu.description || "",
      })) || [],
    certifications:
      data.certifications?.map((cert: any) => ({
        name: cert.name || "",
        issuer: cert.issuer || "",
        date: cert.date || "",
      })) || [],
    awards_publications: data.awards_publications || [],
    max_commute: data.max_commute || "",
    summary: data.summary || "",
    desired_position: data.desired_position || "",
    signature_achievements: data.signature_achievements || [],
    growth_potential: data.growth_potential || [],
    ai_summary: data.ai_summary || "",
    current_salary: data.current_salary || "",
    desired_salary: data.desired_salary || "",
    workload: data.workload || "",
    willing_to_relocate: data.willing_to_relocate || "",
    notice_period: data.notice_period || "",
    reason_for_change: data.reason_for_change || "",
    most_proud_of: data.most_proud_of || "",
    potential_risks: data.potential_risks || [],
    insights_notes: data.insights_notes || "",
    candidate_values: data.candidate_values || [],
    industry: data.desired_industry || "",
    years_of_experience: data.years_of_experience || "",
    linkedin_url: data.person?.linkedin || "",
  };
}

export function CVUploadDialog({
  onCandidateCreated,
  onCandidateParsed,
  candidateId,
  candidateName,
}: CVUploadDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const validateAndSetFile = (selectedFile: File) => {
    if (selectedFile.type === "application/pdf") {
      setFile(selectedFile);
    } else {
      toast({
        title: t("toast.invalidFileType"),
        description: t("toast.onlyPdfAllowed"),
        variant: "destructive",
      });
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      validateAndSetFile(selectedFile);
    }
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile) {
      validateAndSetFile(droppedFile);
    }
  };

  const handleDropZoneClick = () => {
    fileInputRef.current?.click();
  };

  // Helper function to upload CV to storage
  const uploadCVToStorage = async (
    candidateIdForUpload: string,
    cvFile: File,
  ) => {
    try {
      const fileName = cvFile.name;
      const filePath = `${candidateIdForUpload}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("candidate-documents")
        .upload(filePath, cvFile, {
          cacheControl: "3600",
          upsert: true,
        });

      if (uploadError) throw uploadError;

      console.log("CV uploaded to storage:", filePath);
    } catch (error) {
      console.error("Error uploading CV to storage:", error);
      toast({
        title: "Hinweis",
        description:
          "CV wurde geparst, aber nicht im Dokumenten-Ordner gespeichert",
        variant: "destructive",
      });
    }
  };
  // ============================================================================
  // IMPROVED CV UPLOAD HANDLER - SENDS PDF DIRECTLY TO GEMINI
  // ============================================================================

  const handleUpload = async () => {
    if (!file) return;

    console.log("handleUpload - sending PDF directly to Gemini");
    setIsUploading(true);

    try {
      // Step 1: Convert PDF to base64 (keep original formatting)
      console.log("Converting PDF to base64...");
      const base64Data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          // Remove data:application/pdf;base64, prefix
          const base64 = result.split(",")[1];
          resolve(base64);
        };
        reader.onerror = () => reject(new Error("Failed to read file"));
        reader.readAsDataURL(file);
      });

      if (!base64Data) {
        throw new Error("Failed to convert PDF to base64");
      }

      console.log(`PDF converted to base64 (${base64Data.length} chars)`);

      // Step 2: Send PDF directly to Gemini edge function
      console.log("Parsing CV with Gemini (native PDF processing)...");
      const { data: parseResult, error: parseError } =
        await supabase.functions.invoke("jidatit-structure-with-gemini", {
          body: {
            pdfBase64: base64Data,
            fileName: file.name,
          },
        });

      if (parseError || !parseResult?.success) {
        throw new Error(
          parseResult?.error || parseError?.message || "Parsing failed",
        );
      }

      console.log("Gemini Response:", parseResult);

      // Step 3: Map the response to ParsedCandidateData format
      const parsedData = mapGeminiResponseToParseData(parseResult.data);
      const geminiData = parseResult.data;
      console.log("Parsed data:", parsedData);

      if (parsedData && parsedData.person?.full_name) {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          toast({
            title: "Nicht angemeldet",
            description: "Bitte melden Sie sich an",
            variant: "destructive",
          });
          return;
        }

        // Create simple log entry
        const noteText = JSON.stringify([
          {
            id: Date.now().toString(),
            content: onCandidateCreated
              ? `<p>CV hochgeladen und Kandidat erstellt</p>`
              : `<p>CV hochgeladen und Daten aktualisiert</p>`,
            author: "System",
            timestamp: new Date().toISOString(),
          },
        ]);

        // Prepare all candidate fields
        const educationStructured =
          parsedData.education?.map((edu: any) => ({
            degree: edu.degree || null,
            institution: edu.institution || null,
            start_date: edu.start_date || null,
            end_date: edu.end_date || null,
            grade: edu.grade || null,
          })) || [];
        console.log("educationStructured", educationStructured);
        const workExperienceRaw =
          parsedData.experiences?.map((exp) => ({
            company: exp.company_name || "",
            position: exp.role_title || "",
            startDate: exp.start_date || "",
            endDate: exp.end_date || "",
            description: exp.description || "",
          })) || [];

        const workExperienceFormatted = await processWorkExperienceCompanies(
          workExperienceRaw,
          user.id,
        );

        const awardsPublications = geminiData.awards_publications || [];
        const certifications = geminiData.certifications || [];

        const willingToRelocate =
          geminiData.willing_to_relocate === true ||
          geminiData.willing_to_relocate === "Yes" ||
          geminiData.willing_to_relocate === "yes"
            ? "Yes"
            : geminiData.willing_to_relocate === false ||
                geminiData.willing_to_relocate === "No" ||
                geminiData.willing_to_relocate === "no"
              ? "No"
              : null;

        const candidateDbData = {
          name: parsedData.person.full_name,
          email: parsedData.person.email || null,
          phone: parsedData.person.phone || null,
          location: parsedData.person.location || null,
          position: parsedData.person.current_role || null,
          desired_position: geminiData.desired_position || null,
          industry: geminiData.desired_industry || null,
          experience: geminiData.years_of_experience || null,
          current_salary: geminiData.current_salary || null,
          desired_salary: geminiData.desired_salary || null,
          workload: geminiData.workload || null,
          willing_to_relocate: willingToRelocate,
          max_commute: geminiData.max_commute || null,
          notice_period: geminiData.notice_period || null,
          reason_for_change: geminiData.reason_for_change || null,
          birthdate: parsedData.person.birthdate || null,
          linkedin_url: parsedData.person.links?.[0] || null,
          summary: geminiData.summary || null,
          skills: parsedData.skills || [],
          education: educationStructured as any,
          further_education: parsedData.further_education || ([] as any),
          work_experience: workExperienceFormatted as any,
          languages: parsedData.languages as any,
          certifications: certifications as any,
          awards_publications: awardsPublications as any,
          ai_summary: geminiData.ai_summary || null,
          signature_achievements: Array.isArray(
            geminiData.signature_achievements,
          )
            ? geminiData.signature_achievements
            : typeof geminiData.signature_achievements === "string"
              ? [geminiData.signature_achievements]
              : [],
          growth_potential: Array.isArray(geminiData.growth_potential)
            ? geminiData.growth_potential
            : typeof geminiData.growth_potential === "string"
              ? [geminiData.growth_potential]
              : [],
          most_proud_of: geminiData.most_proud_of || null,
          potential_risks: Array.isArray(geminiData.potential_risks)
            ? geminiData.potential_risks.join(", ")
            : geminiData.potential_risks || null,
          insights_notes: geminiData.insights_notes || null,
          candidate_values: Array.isArray(geminiData.candidate_values)
            ? geminiData.candidate_values
            : typeof geminiData.candidate_values === "string"
              ? [geminiData.candidate_values]
              : [],
        };

        // Create or update candidate
        if (onCandidateCreated) {
          console.log("Creating new candidate in DB");

          const { data: newCandidate, error } = await supabase
            .from("candidates")
            .insert({
              user_id: user.id,
              assigned_to: user.id,
              notes: noteText,
              ...candidateDbData,
            })
            .select()
            .single();

          if (error) throw error;

          if (newCandidate?.id) {
            await uploadCVToStorage(newCandidate.id, file);
          }

          onCandidateCreated?.();

          toast({
            title: "✓ Kandidat erfolgreich angelegt (AI)",
            description: `${parsedData.person.full_name} wurde automatisch aus dem CV erstellt.`,
          });
        } else if (onCandidateParsed) {
          console.log("Updating existing candidate in DB");
          if (candidateId) {
            await uploadCVToStorage(candidateId, file);

            const { data: currentCandidate } = await supabase
              .from("candidates")
              .select("notes")
              .eq("id", candidateId)
              .single();

            let updatedNotes = noteText;
            if (currentCandidate?.notes) {
              try {
                const existingNotes = JSON.parse(currentCandidate.notes);
                if (Array.isArray(existingNotes)) {
                  const newNote = JSON.parse(noteText)[0];
                  updatedNotes = JSON.stringify([newNote, ...existingNotes]);
                }
              } catch (e) {
                console.error("Error parsing existing notes:", e);
              }
            }

            const { error: updateError } = await supabase
              .from("candidates")
              .update({
                ...candidateDbData,
                notes: updatedNotes,
              })
              .eq("id", candidateId);

            if (updateError) {
              console.error("Error updating candidate:", updateError);
            }
          }
          const educationStructured =
            parsedData.education?.map((edu: any) => ({
              degree: edu.degree || null,
              institution: edu.institution || null,
              start_date: edu.start_date || null,
              end_date: edu.end_date || null,
              grade: edu.grade || null,
            })) || [];
          console.log("educationStructured", educationStructured);
          const workExperienceRaw =
            parsedData.experiences?.map((exp) => ({
              company: exp.company_name || "",
              position: exp.role_title || "",
              startDate: exp.start_date || "",
              endDate: exp.end_date || "",
              description: exp.description || "",
            })) || [];
          const workExperienceFormatted = await processWorkExperienceCompanies(
            workExperienceRaw,
            user.id,
          );
          const completeData = {
            ...parsedData,
            education: educationStructured || [],
            work_experience: workExperienceFormatted || [],
            awards_publications: geminiData.awards_publications || [],
            max_commute: geminiData.max_commute || "",
            summary: geminiData.summary || "",
            desired_position: geminiData.desired_position || "",
            signature_achievements: Array.isArray(
              geminiData.signature_achievements,
            )
              ? geminiData.signature_achievements
              : typeof geminiData.signature_achievements === "string"
                ? [geminiData.signature_achievements]
                : [],
            growth_potential: Array.isArray(geminiData.growth_potential)
              ? geminiData.growth_potential
              : typeof geminiData.growth_potential === "string"
                ? [geminiData.growth_potential]
                : [],
            ai_summary: geminiData.ai_summary || "",
            current_salary: geminiData.current_salary || "",
            desired_salary: geminiData.desired_salary || "",
            workload: geminiData.workload || "",
            willing_to_relocate: willingToRelocate || "",
            notice_period: geminiData.notice_period || "",
            reason_for_change: geminiData.reason_for_change || "",
            most_proud_of: geminiData.most_proud_of || "",
            potential_risks: Array.isArray(geminiData.potential_risks)
              ? geminiData.potential_risks
              : typeof geminiData.potential_risks === "string"
                ? [geminiData.potential_risks]
                : [],
            insights_notes: geminiData.insights_notes || "",
            candidate_values: Array.isArray(geminiData.candidate_values)
              ? geminiData.candidate_values
              : typeof geminiData.candidate_values === "string"
                ? [geminiData.candidate_values]
                : [],
            industry: geminiData.desired_industry || "",
            years_of_experience: geminiData.years_of_experience || "",
          };

          onCandidateParsed(completeData);

          toast({
            title: "✓ CV erfolgreich geparst & gespeichert",
            description:
              "Die Kandidateninformationen wurden automatisch aktualisiert.",
          });
        }

        setIsOpen(false);
        setFile(null);
      } else {
        toast({
          title: "Fehler beim Parsen",
          description: "Name konnte nicht extrahiert werden.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Error parsing CV:", error);
      toast({
        title: "Fehler",
        description:
          error instanceof Error
            ? error.message
            : "Beim Verarbeiten der CV ist ein Fehler aufgetreten.",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };
  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Upload className="h-4 w-4 mr-2" />
          CV hochladen
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>CV Upload & Automatische Erfassung (AI)</DialogTitle>
          <DialogDescription>
            {onCandidateCreated
              ? "Laden Sie eine PDF-Datei hoch. Die AI analysiert automatisch alle Daten und legt den Kandidaten in der Datenbank an."
              : "Laden Sie eine PDF-Datei hoch. Die AI analysiert automatisch alle Daten und füllt die Formularfelder aus. Speichern Sie anschließend manuell."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Drag & Drop Zone */}
          <div
            onClick={handleDropZoneClick}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`
              relative border-2 border-dashed rounded-lg p-8 text-center cursor-pointer
              transition-colors duration-200 min-h-[140px] flex items-center justify-center
              ${
                isDragOver
                  ? "border-primary bg-primary/5"
                  : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50"
              }
              ${isUploading ? "pointer-events-none opacity-50" : ""}
            `}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              onChange={handleFileChange}
              disabled={isUploading}
              className="hidden"
            />
            <div className="flex flex-col items-center gap-2">
              <div
                className={`p-3 rounded-full ${isDragOver ? "bg-primary/10" : "bg-muted"}`}
              >
                <Upload
                  className={`h-6 w-6 ${isDragOver ? "text-primary" : "text-muted-foreground"}`}
                />
              </div>
              <div>
                <p className="text-sm font-medium">
                  {isDragOver
                    ? t("cvUpload.dropHere") || "PDF hier ablegen"
                    : t("cvUpload.dragAndDrop") || "PDF hierher ziehen"}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {t("cvUpload.orClickToSelect") ||
                    "oder klicken zum Auswählen"}
                </p>
              </div>
            </div>
          </div>

          {file && (
            <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
              <FileText className="h-5 w-5 text-primary" />
              <span className="text-sm font-medium truncate flex-1">
                {file.name}
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="flex-shrink-0"
                onClick={(e) => {
                  e.stopPropagation();
                  setFile(null);
                }}
                disabled={isUploading}
              >
                ✕
              </Button>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setIsOpen(false)}
              disabled={isUploading}
            >
              Abbrechen
            </Button>
            <Button onClick={handleUpload} disabled={!file || isUploading}>
              {isUploading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {isUploading
                ? onCandidateCreated
                  ? "Verarbeite und erstelle Kandidat..."
                  : "Verarbeite CV..."
                : onCandidateCreated
                  ? "CV parsen & Kandidat anlegen"
                  : "CV parsen & Felder ausfüllen"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
