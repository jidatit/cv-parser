interface Experience {
  company_name?: string;
  role_title?: string;
  start_date?: string;
  end_date?: string;
  description?: string;
  client_id?: string;
}

interface Education {
  institution?: string;
  degree?: string;
  start_date?: string;
  end_date?: string;
}

interface Language {
  name?: string;
  level?: string;
}

interface Certification {
  name?: string;
  issuer?: string;
  date?: string;
}

interface AwardPublication {
  title?: string;
  type?: 'award' | 'publication';
  year?: string;
  publisher?: string;
  description?: string;
}

interface PersonInfo {
  full_name: string;
  current_role?: string;
  email?: string;
  phone?: string;
  location?: string;
  links?: string[];
  birthdate?: string | null;
}

export interface ParsedCandidateData {
  person: PersonInfo;
  skills?: string[];
  languages?: Language[];
  experiences?: Experience[];
  education?: Education[];
  certifications?: Certification[];
  awards_publications?: AwardPublication[];
  further_education?: Array<{ name?: string; institution?: string; date?: string; description?: string }>;
  max_commute?: string;
  summary?: string;
  desired_position?: string;
  signature_achievements?: string[];
  growth_potential?: string[];
  ai_summary?: string;
  current_salary?: string;
  desired_salary?: string;
  workload?: string;
  willing_to_relocate?: string;
  notice_period?: string;
  reason_for_change?: string;
  most_proud_of?: string;
  potential_risks?: string[];
  insights_notes?: string;
  candidate_values?: string[];
  industry?: string;
  years_of_experience?: string;
  linkedin_url?: string;
}

export type { Experience, Education, Language, Certification, PersonInfo, AwardPublication };

export class CVParserService {
  static async parseCV(file: File): Promise<ParsedCandidateData | null> {
    try {
      // Konvertiere File zu Base64
      const base64 = await this.fileToBase64(file);
      
      console.log('Sending PDF to AI for parsing...');

      // Call Supabase Edge Function to parse CV with AI
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/parse-cv`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ 
            pdfBase64: base64,
            fileName: file.name 
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to parse CV');
      }

      const parsedData = await response.json();
      console.log('Parsed CV data:', parsedData);
      return parsedData;
    } catch (error) {
      console.error('Error parsing CV:', error);
      return null;
    }
  }

  private static fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          // Entferne das "data:application/pdf;base64," Prefix
          const base64 = reader.result.split(',')[1];
          resolve(base64);
        } else {
          reject(new Error('Failed to convert file to base64'));
        }
      };
      reader.onerror = error => reject(error);
    });
  }
}
