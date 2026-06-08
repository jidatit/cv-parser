export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      access_logs: {
        Row: {
          attempted_path: string
          created_at: string
          id: string
          ip_address: string | null
          required_roles: string[] | null
          user_agent: string | null
          user_email: string | null
          user_id: string | null
          user_role: string | null
        }
        Insert: {
          attempted_path: string
          created_at?: string
          id?: string
          ip_address?: string | null
          required_roles?: string[] | null
          user_agent?: string | null
          user_email?: string | null
          user_id?: string | null
          user_role?: string | null
        }
        Update: {
          attempted_path?: string
          created_at?: string
          id?: string
          ip_address?: string | null
          required_roles?: string[] | null
          user_agent?: string | null
          user_email?: string | null
          user_id?: string | null
          user_role?: string | null
        }
        Relationships: []
      }
      activity_logs: {
        Row: {
          action: string
          changes: Json | null
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          new_data: Json | null
          old_data: Json | null
          user_id: string
        }
        Insert: {
          action: string
          changes?: Json | null
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          user_id: string
        }
        Update: {
          action?: string
          changes?: Json | null
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          user_id?: string
        }
        Relationships: []
      }
      ai_cache: {
        Row: {
          cache_key: string
          created_at: string
          expires_at: string
          function_name: string
          id: string
          response_data: Json
        }
        Insert: {
          cache_key: string
          created_at?: string
          expires_at: string
          function_name: string
          id?: string
          response_data: Json
        }
        Update: {
          cache_key?: string
          created_at?: string
          expires_at?: string
          function_name?: string
          id?: string
          response_data?: Json
        }
        Relationships: []
      }
      ai_matches: {
        Row: {
          candidate_id: string
          created_at: string
          id: string
          job_id: string
          match_reasons: Json
          match_score: number
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          candidate_id: string
          created_at?: string
          id?: string
          job_id: string
          match_reasons?: Json
          match_score: number
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          candidate_id?: string
          created_at?: string
          id?: string
          job_id?: string
          match_reasons?: Json
          match_score?: number
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_matches_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_matches_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_matching_jobs: {
        Row: {
          created_at: string
          error: string | null
          id: string
          message: string | null
          new_matches: number | null
          processed_candidates: number | null
          progress: number
          stats: Json | null
          status: string
          total_candidates: number | null
          total_matches: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          error?: string | null
          id?: string
          message?: string | null
          new_matches?: number | null
          processed_candidates?: number | null
          progress?: number
          stats?: Json | null
          status?: string
          total_candidates?: number | null
          total_matches?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          error?: string | null
          id?: string
          message?: string | null
          new_matches?: number | null
          processed_candidates?: number | null
          progress?: number
          stats?: Json | null
          status?: string
          total_candidates?: number | null
          total_matches?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      applications: {
        Row: {
          candidate_email: string
          candidate_id: string | null
          candidate_name: string
          candidate_phone: string | null
          cover_letter: string | null
          created_at: string
          cv_url: string | null
          id: string
          job_id: string | null
          notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          source: string | null
          status: string
          variant_shown: string | null
        }
        Insert: {
          candidate_email: string
          candidate_id?: string | null
          candidate_name: string
          candidate_phone?: string | null
          cover_letter?: string | null
          created_at?: string
          cv_url?: string | null
          id?: string
          job_id?: string | null
          notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source?: string | null
          status?: string
          variant_shown?: string | null
        }
        Update: {
          candidate_email?: string
          candidate_id?: string | null
          candidate_name?: string
          candidate_phone?: string | null
          cover_letter?: string | null
          created_at?: string
          cv_url?: string | null
          id?: string
          job_id?: string | null
          notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source?: string | null
          status?: string
          variant_shown?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "applications_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applications_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      blog_posts: {
        Row: {
          ai_generated: boolean | null
          category: string | null
          content_html: string | null
          created_at: string
          excerpt: string | null
          featured_image_url: string | null
          id: string
          language: string | null
          linked_job_ids: string[] | null
          meta_description: string | null
          published_at: string | null
          seo_keywords: string[]
          slug: string | null
          status: string
          target_audience: string | null
          title: string
          updated_at: string
          user_id: string
          word_count: number | null
        }
        Insert: {
          ai_generated?: boolean | null
          category?: string | null
          content_html?: string | null
          created_at?: string
          excerpt?: string | null
          featured_image_url?: string | null
          id?: string
          language?: string | null
          linked_job_ids?: string[] | null
          meta_description?: string | null
          published_at?: string | null
          seo_keywords?: string[]
          slug?: string | null
          status?: string
          target_audience?: string | null
          title: string
          updated_at?: string
          user_id: string
          word_count?: number | null
        }
        Update: {
          ai_generated?: boolean | null
          category?: string | null
          content_html?: string | null
          created_at?: string
          excerpt?: string | null
          featured_image_url?: string | null
          id?: string
          language?: string | null
          linked_job_ids?: string[] | null
          meta_description?: string | null
          published_at?: string | null
          seo_keywords?: string[]
          slug?: string | null
          status?: string
          target_audience?: string | null
          title?: string
          updated_at?: string
          user_id?: string
          word_count?: number | null
        }
        Relationships: []
      }
      candidate_badge_assignments: {
        Row: {
          badge_id: string
          candidate_id: string
          created_at: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          badge_id: string
          candidate_id: string
          created_at?: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          badge_id?: string
          candidate_id?: string
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "candidate_badge_assignments_badge_id_fkey"
            columns: ["badge_id"]
            isOneToOne: false
            referencedRelation: "candidate_badges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidate_badge_assignments_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
        ]
      }
      candidate_badges: {
        Row: {
          color: string
          created_at: string
          id: string
          label: string
          updated_at: string
          user_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          label: string
          updated_at?: string
          user_id: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          label?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      candidates: {
        Row: {
          ai_summary: string | null
          assigned_to: string | null
          avatar_url: string | null
          awards_publications: Json | null
          birthdate: string | null
          candidate_values: string[] | null
          certifications: Json | null
          created_at: string | null
          current_salary: string | null
          desired_position: string | null
          desired_salary: string | null
          driving_license: string | null
          education: Json | null
          email: string | null
          embedding: string | null
          experience: string | null
          full_image_url: string | null
          further_education: Json | null
          growth_potential: string[] | null
          id: string
          industry: string | null
          insights_notes: string | null
          is_verified: boolean
          languages: Json | null
          last_pushed_at: string | null
          linkedin_url: string | null
          location: string | null
          location_lat: number | null
          location_lng: number | null
          max_commute: string | null
          most_proud_of: string | null
          name: string
          notes: string | null
          notice_period: string | null
          phone: string | null
          position: string | null
          potential_risks: string | null
          priority: string | null
          reason_for_change: string | null
          recruiting_status: string | null
          signature_achievements: string[] | null
          skills: string[] | null
          source_contact: string | null
          status: string | null
          summary: string | null
          updated_at: string | null
          user_id: string
          willing_to_relocate: string | null
          work_experience: Json | null
          workload: string | null
        }
        Insert: {
          ai_summary?: string | null
          assigned_to?: string | null
          avatar_url?: string | null
          awards_publications?: Json | null
          birthdate?: string | null
          candidate_values?: string[] | null
          certifications?: Json | null
          created_at?: string | null
          current_salary?: string | null
          desired_position?: string | null
          desired_salary?: string | null
          driving_license?: string | null
          education?: Json | null
          email?: string | null
          embedding?: string | null
          experience?: string | null
          full_image_url?: string | null
          further_education?: Json | null
          growth_potential?: string[] | null
          id?: string
          industry?: string | null
          insights_notes?: string | null
          is_verified?: boolean
          languages?: Json | null
          last_pushed_at?: string | null
          linkedin_url?: string | null
          location?: string | null
          location_lat?: number | null
          location_lng?: number | null
          max_commute?: string | null
          most_proud_of?: string | null
          name: string
          notes?: string | null
          notice_period?: string | null
          phone?: string | null
          position?: string | null
          potential_risks?: string | null
          priority?: string | null
          reason_for_change?: string | null
          recruiting_status?: string | null
          signature_achievements?: string[] | null
          skills?: string[] | null
          source_contact?: string | null
          status?: string | null
          summary?: string | null
          updated_at?: string | null
          user_id: string
          willing_to_relocate?: string | null
          work_experience?: Json | null
          workload?: string | null
        }
        Update: {
          ai_summary?: string | null
          assigned_to?: string | null
          avatar_url?: string | null
          awards_publications?: Json | null
          birthdate?: string | null
          candidate_values?: string[] | null
          certifications?: Json | null
          created_at?: string | null
          current_salary?: string | null
          desired_position?: string | null
          desired_salary?: string | null
          driving_license?: string | null
          education?: Json | null
          email?: string | null
          embedding?: string | null
          experience?: string | null
          full_image_url?: string | null
          further_education?: Json | null
          growth_potential?: string[] | null
          id?: string
          industry?: string | null
          insights_notes?: string | null
          is_verified?: boolean
          languages?: Json | null
          last_pushed_at?: string | null
          linkedin_url?: string | null
          location?: string | null
          location_lat?: number | null
          location_lng?: number | null
          max_commute?: string | null
          most_proud_of?: string | null
          name?: string
          notes?: string | null
          notice_period?: string | null
          phone?: string | null
          position?: string | null
          potential_risks?: string | null
          priority?: string | null
          reason_for_change?: string | null
          recruiting_status?: string | null
          signature_achievements?: string[] | null
          skills?: string[] | null
          source_contact?: string | null
          status?: string | null
          summary?: string | null
          updated_at?: string | null
          user_id?: string
          willing_to_relocate?: string | null
          work_experience?: Json | null
          workload?: string | null
        }
        Relationships: []
      }
      clients: {
        Row: {
          address: string | null
          benefits: string | null
          careers_url: string | null
          contact_person: string | null
          created_at: string
          description: string | null
          description_approved: boolean | null
          email: string | null
          id: string
          industry: string | null
          logo_bg_color: string | null
          logo_url: string | null
          name: string
          notes: string | null
          phone: string | null
          status: string | null
          structured_notes: Json | null
          updated_at: string
          user_id: string
          website: string | null
        }
        Insert: {
          address?: string | null
          benefits?: string | null
          careers_url?: string | null
          contact_person?: string | null
          created_at?: string
          description?: string | null
          description_approved?: boolean | null
          email?: string | null
          id?: string
          industry?: string | null
          logo_bg_color?: string | null
          logo_url?: string | null
          name: string
          notes?: string | null
          phone?: string | null
          status?: string | null
          structured_notes?: Json | null
          updated_at?: string
          user_id: string
          website?: string | null
        }
        Update: {
          address?: string | null
          benefits?: string | null
          careers_url?: string | null
          contact_person?: string | null
          created_at?: string
          description?: string | null
          description_approved?: boolean | null
          email?: string | null
          id?: string
          industry?: string | null
          logo_bg_color?: string | null
          logo_url?: string | null
          name?: string
          notes?: string | null
          phone?: string | null
          status?: string | null
          structured_notes?: Json | null
          updated_at?: string
          user_id?: string
          website?: string | null
        }
        Relationships: []
      }
      commute_cache: {
        Row: {
          auto_distance: string | null
          auto_duration: string | null
          calculated_at: string
          destination: string
          expires_at: string
          id: string
          oepnv_distance: string | null
          oepnv_duration: string | null
          origin: string
        }
        Insert: {
          auto_distance?: string | null
          auto_duration?: string | null
          calculated_at?: string
          destination: string
          expires_at?: string
          id?: string
          oepnv_distance?: string | null
          oepnv_duration?: string | null
          origin: string
        }
        Update: {
          auto_distance?: string | null
          auto_duration?: string | null
          calculated_at?: string
          destination?: string
          expires_at?: string
          id?: string
          oepnv_distance?: string | null
          oepnv_duration?: string | null
          origin?: string
        }
        Relationships: []
      }
      contact_persons: {
        Row: {
          client_id: string
          created_at: string | null
          email: string | null
          id: string
          is_primary: boolean | null
          mobile: string | null
          name: string
          notes: string | null
          phone: string | null
          position: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          client_id: string
          created_at?: string | null
          email?: string | null
          id?: string
          is_primary?: boolean | null
          mobile?: string | null
          name: string
          notes?: string | null
          phone?: string | null
          position?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          client_id?: string
          created_at?: string | null
          email?: string | null
          id?: string
          is_primary?: boolean | null
          mobile?: string | null
          name?: string
          notes?: string | null
          phone?: string | null
          position?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_persons_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      dismissed_suggestions: {
        Row: {
          candidate_id: string
          created_at: string
          id: string
          job_id: string
          user_id: string
        }
        Insert: {
          candidate_id: string
          created_at?: string
          id?: string
          job_id: string
          user_id: string
        }
        Update: {
          candidate_id?: string
          created_at?: string
          id?: string
          job_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dismissed_suggestions_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dismissed_suggestions_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      external_search_jobs: {
        Row: {
          candidate_id: string
          created_at: string
          error: string | null
          id: string
          progress_message: string | null
          results: Json | null
          search_params: Json | null
          stats: Json | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          candidate_id: string
          created_at?: string
          error?: string | null
          id?: string
          progress_message?: string | null
          results?: Json | null
          search_params?: Json | null
          stats?: Json | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          candidate_id?: string
          created_at?: string
          error?: string | null
          id?: string
          progress_message?: string | null
          results?: Json | null
          search_params?: Json | null
          stats?: Json | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "external_search_jobs_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
        ]
      }
      industries: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      interview_prep_documents: {
        Row: {
          content: Json | null
          created_at: string
          created_by: string
          custom_instructions: string | null
          file_name: string
          file_url: string
          focus_areas: string[] | null
          id: string
          language: string | null
          phase: string | null
          placement_id: string
        }
        Insert: {
          content?: Json | null
          created_at?: string
          created_by: string
          custom_instructions?: string | null
          file_name: string
          file_url: string
          focus_areas?: string[] | null
          id?: string
          language?: string | null
          phase?: string | null
          placement_id: string
        }
        Update: {
          content?: Json | null
          created_at?: string
          created_by?: string
          custom_instructions?: string | null
          file_name?: string
          file_url?: string
          focus_areas?: string[] | null
          id?: string
          language?: string | null
          phase?: string | null
          placement_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "interview_prep_documents_placement_id_fkey"
            columns: ["placement_id"]
            isOneToOne: false
            referencedRelation: "placements"
            referencedColumns: ["id"]
          },
        ]
      }
      invitations: {
        Row: {
          accepted_at: string | null
          created_at: string | null
          email: string
          expires_at: string | null
          id: string
          invited_by: string
          status: string | null
          token: string | null
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string | null
          email: string
          expires_at?: string | null
          id?: string
          invited_by: string
          status?: string | null
          token?: string | null
        }
        Update: {
          accepted_at?: string | null
          created_at?: string | null
          email?: string
          expires_at?: string | null
          id?: string
          invited_by?: string
          status?: string | null
          token?: string | null
        }
        Relationships: []
      }
      job_analytics: {
        Row: {
          created_at: string
          device_type: string | null
          event_type: string
          id: string
          job_id: string
          variant_shown: string
        }
        Insert: {
          created_at?: string
          device_type?: string | null
          event_type: string
          id?: string
          job_id: string
          variant_shown: string
        }
        Update: {
          created_at?: string
          device_type?: string | null
          event_type?: string
          id?: string
          job_id?: string
          variant_shown?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_analytics_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          active_title_variant: string
          active_variant: string
          anonymization_level: string
          anonymized_at: string | null
          assigned_to: string | null
          auto_optimize: boolean
          benefits: string | null
          client_id: string | null
          created_at: string
          description: string | null
          embedding: string | null
          employment_type: string | null
          experience_level: string | null
          external_job_id: string | null
          framework_a: string | null
          framework_b: string | null
          id: string
          is_published: boolean
          location: string | null
          location_lat: number | null
          location_lng: number | null
          meta_description: string | null
          public_benefits: string | null
          public_benefits_b: string | null
          public_description: string | null
          public_description_b: string | null
          public_id: string | null
          public_requirements: string | null
          public_requirements_b: string | null
          public_responsibilities: string | null
          public_responsibilities_b: string | null
          public_summary_a: string | null
          public_summary_b: string | null
          public_title: string | null
          public_title_a: string | null
          public_title_b: string | null
          public_title_variant_b: string | null
          publication_expires_at: string | null
          publication_language: string
          publication_status: string
          published_at: string | null
          requirements: string | null
          responsibilities: string | null
          salary_range: string | null
          seo_keywords: string[]
          seo_meta_description: string | null
          seo_meta_title: string | null
          seo_slug: string | null
          skills: string[] | null
          source_document_url: string | null
          source_url: string | null
          source_url_checked_at: string | null
          source_url_reason: string | null
          source_url_status: string | null
          status: string | null
          structured_notes: Json | null
          title: string
          updated_at: string
          user_id: string
          winner_variant: string | null
        }
        Insert: {
          active_title_variant?: string
          active_variant?: string
          anonymization_level?: string
          anonymized_at?: string | null
          assigned_to?: string | null
          auto_optimize?: boolean
          benefits?: string | null
          client_id?: string | null
          created_at?: string
          description?: string | null
          embedding?: string | null
          employment_type?: string | null
          experience_level?: string | null
          external_job_id?: string | null
          framework_a?: string | null
          framework_b?: string | null
          id?: string
          is_published?: boolean
          location?: string | null
          location_lat?: number | null
          location_lng?: number | null
          meta_description?: string | null
          public_benefits?: string | null
          public_benefits_b?: string | null
          public_description?: string | null
          public_description_b?: string | null
          public_id?: string | null
          public_requirements?: string | null
          public_requirements_b?: string | null
          public_responsibilities?: string | null
          public_responsibilities_b?: string | null
          public_summary_a?: string | null
          public_summary_b?: string | null
          public_title?: string | null
          public_title_a?: string | null
          public_title_b?: string | null
          public_title_variant_b?: string | null
          publication_expires_at?: string | null
          publication_language?: string
          publication_status?: string
          published_at?: string | null
          requirements?: string | null
          responsibilities?: string | null
          salary_range?: string | null
          seo_keywords?: string[]
          seo_meta_description?: string | null
          seo_meta_title?: string | null
          seo_slug?: string | null
          skills?: string[] | null
          source_document_url?: string | null
          source_url?: string | null
          source_url_checked_at?: string | null
          source_url_reason?: string | null
          source_url_status?: string | null
          status?: string | null
          structured_notes?: Json | null
          title: string
          updated_at?: string
          user_id: string
          winner_variant?: string | null
        }
        Update: {
          active_title_variant?: string
          active_variant?: string
          anonymization_level?: string
          anonymized_at?: string | null
          assigned_to?: string | null
          auto_optimize?: boolean
          benefits?: string | null
          client_id?: string | null
          created_at?: string
          description?: string | null
          embedding?: string | null
          employment_type?: string | null
          experience_level?: string | null
          external_job_id?: string | null
          framework_a?: string | null
          framework_b?: string | null
          id?: string
          is_published?: boolean
          location?: string | null
          location_lat?: number | null
          location_lng?: number | null
          meta_description?: string | null
          public_benefits?: string | null
          public_benefits_b?: string | null
          public_description?: string | null
          public_description_b?: string | null
          public_id?: string | null
          public_requirements?: string | null
          public_requirements_b?: string | null
          public_responsibilities?: string | null
          public_responsibilities_b?: string | null
          public_summary_a?: string | null
          public_summary_b?: string | null
          public_title?: string | null
          public_title_a?: string | null
          public_title_b?: string | null
          public_title_variant_b?: string | null
          publication_expires_at?: string | null
          publication_language?: string
          publication_status?: string
          published_at?: string | null
          requirements?: string | null
          responsibilities?: string | null
          salary_range?: string | null
          seo_keywords?: string[]
          seo_meta_description?: string | null
          seo_meta_title?: string | null
          seo_slug?: string | null
          skills?: string[] | null
          source_document_url?: string | null
          source_url?: string | null
          source_url_checked_at?: string | null
          source_url_reason?: string | null
          source_url_status?: string | null
          status?: string | null
          structured_notes?: Json | null
          title?: string
          updated_at?: string
          user_id?: string
          winner_variant?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "jobs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      languages: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      market_radar_profiles: {
        Row: {
          auto_synonyms: boolean
          created_at: string
          id: string
          language: string
          location: string | null
          max_pages: number
          name: string
          pensum_max: number
          pensum_min: number
          queries: string[]
          radius_km: number
          time_filter: string
          updated_at: string
          user_id: string
          work_model: string
        }
        Insert: {
          auto_synonyms?: boolean
          created_at?: string
          id?: string
          language?: string
          location?: string | null
          max_pages?: number
          name: string
          pensum_max?: number
          pensum_min?: number
          queries?: string[]
          radius_km?: number
          time_filter?: string
          updated_at?: string
          user_id: string
          work_model?: string
        }
        Update: {
          auto_synonyms?: boolean
          created_at?: string
          id?: string
          language?: string
          location?: string | null
          max_pages?: number
          name?: string
          pensum_max?: number
          pensum_min?: number
          queries?: string[]
          radius_km?: number
          time_filter?: string
          updated_at?: string
          user_id?: string
          work_model?: string
        }
        Relationships: []
      }
      market_radar_scans: {
        Row: {
          created_at: string
          duration_ms: number
          id: string
          imported_job_ids: Json | null
          location: string | null
          profile_id: string | null
          queries_used: string[]
          status: string
          total_existing: number
          total_filtered: number
          total_new: number
          total_scraped: number
          user_id: string
        }
        Insert: {
          created_at?: string
          duration_ms?: number
          id?: string
          imported_job_ids?: Json | null
          location?: string | null
          profile_id?: string | null
          queries_used?: string[]
          status?: string
          total_existing?: number
          total_filtered?: number
          total_new?: number
          total_scraped?: number
          user_id: string
        }
        Update: {
          created_at?: string
          duration_ms?: number
          id?: string
          imported_job_ids?: Json | null
          location?: string | null
          profile_id?: string | null
          queries_used?: string[]
          status?: string
          total_existing?: number
          total_filtered?: number
          total_new?: number
          total_scraped?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "market_radar_scans_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "market_radar_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      placements: {
        Row: {
          analysis_completed_at: string | null
          candidate_id: string
          commute_auto_distance: string | null
          commute_auto_duration: string | null
          commute_calculated_at: string | null
          commute_oepnv_distance: string | null
          commute_oepnv_duration: string | null
          created_at: string
          experience_score: number | null
          follow_up: boolean | null
          from_ai_match: boolean | null
          id: string
          job_id: string
          manual_honorar: number | null
          match_gaps: Json | null
          match_reasons: Json | null
          match_risks: Json | null
          match_score: number | null
          match_strengths: Json | null
          match_summary: string | null
          notes: Json | null
          salary_score: number | null
          sentiment_analyzed_at: string | null
          sentiment_confidence: number | null
          sentiment_key_signals: Json | null
          sentiment_probability: number | null
          sentiment_summary: string | null
          sentiment_trend: string | null
          shared_at: string | null
          skills_score: number | null
          stage: string
          updated_at: string
          user_id: string
        }
        Insert: {
          analysis_completed_at?: string | null
          candidate_id: string
          commute_auto_distance?: string | null
          commute_auto_duration?: string | null
          commute_calculated_at?: string | null
          commute_oepnv_distance?: string | null
          commute_oepnv_duration?: string | null
          created_at?: string
          experience_score?: number | null
          follow_up?: boolean | null
          from_ai_match?: boolean | null
          id?: string
          job_id: string
          manual_honorar?: number | null
          match_gaps?: Json | null
          match_reasons?: Json | null
          match_risks?: Json | null
          match_score?: number | null
          match_strengths?: Json | null
          match_summary?: string | null
          notes?: Json | null
          salary_score?: number | null
          sentiment_analyzed_at?: string | null
          sentiment_confidence?: number | null
          sentiment_key_signals?: Json | null
          sentiment_probability?: number | null
          sentiment_summary?: string | null
          sentiment_trend?: string | null
          shared_at?: string | null
          skills_score?: number | null
          stage?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          analysis_completed_at?: string | null
          candidate_id?: string
          commute_auto_distance?: string | null
          commute_auto_duration?: string | null
          commute_calculated_at?: string | null
          commute_oepnv_distance?: string | null
          commute_oepnv_duration?: string | null
          created_at?: string
          experience_score?: number | null
          follow_up?: boolean | null
          from_ai_match?: boolean | null
          id?: string
          job_id?: string
          manual_honorar?: number | null
          match_gaps?: Json | null
          match_reasons?: Json | null
          match_risks?: Json | null
          match_score?: number | null
          match_strengths?: Json | null
          match_summary?: string | null
          notes?: Json | null
          salary_score?: number | null
          sentiment_analyzed_at?: string | null
          sentiment_confidence?: number | null
          sentiment_key_signals?: Json | null
          sentiment_probability?: number | null
          sentiment_summary?: string | null
          sentiment_trend?: string | null
          shared_at?: string | null
          skills_score?: number | null
          stage?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "placements_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "placements_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          email: string | null
          first_name: string | null
          full_name: string | null
          id: string
          last_name: string | null
          phone: string | null
          position: string | null
          user_type: Database["public"]["Enums"]["user_type"]
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          email?: string | null
          first_name?: string | null
          full_name?: string | null
          id: string
          last_name?: string | null
          phone?: string | null
          position?: string | null
          user_type?: Database["public"]["Enums"]["user_type"]
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          email?: string | null
          first_name?: string | null
          full_name?: string | null
          id?: string
          last_name?: string | null
          phone?: string | null
          position?: string | null
          user_type?: Database["public"]["Enums"]["user_type"]
        }
        Relationships: []
      }
      publication_analytics: {
        Row: {
          clicks: number
          created_at: string
          date: string
          id: string
          job_id: string
          variant: string | null
          views: number
        }
        Insert: {
          clicks?: number
          created_at?: string
          date?: string
          id?: string
          job_id: string
          variant?: string | null
          views?: number
        }
        Update: {
          clicks?: number
          created_at?: string
          date?: string
          id?: string
          job_id?: string
          variant?: string | null
          views?: number
        }
        Relationships: [
          {
            foreignKeyName: "publication_analytics_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      publication_audit_log: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          id: string
          job_id: string
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          id?: string
          job_id: string
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          id?: string
          job_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "publication_audit_log_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      publication_blacklist: {
        Row: {
          client_id: string
          created_at: string
          id: string
          reason: string | null
          user_id: string
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          reason?: string | null
          user_id: string
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          reason?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "publication_blacklist_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      publication_rules: {
        Row: {
          anonymization_level: string | null
          auto_publish: boolean | null
          conditions: Json
          created_at: string
          id: string
          is_active: boolean
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          anonymization_level?: string | null
          auto_publish?: boolean | null
          conditions?: Json
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          anonymization_level?: string | null
          auto_publish?: boolean | null
          conditions?: Json
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      rejection_reasons: {
        Row: {
          created_at: string
          id: string
          reason: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          reason: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          reason?: string
          updated_at?: string
        }
        Relationships: []
      }
      saved_filters: {
        Row: {
          color: string
          created_at: string
          filter_criteria: Json
          id: string
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          filter_criteria?: Json
          id?: string
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          color?: string
          created_at?: string
          filter_criteria?: Json
          id?: string
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      skills: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      status_configurations: {
        Row: {
          config_type: Database["public"]["Enums"]["config_type"]
          config_value: Json
          created_at: string | null
          id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          config_type: Database["public"]["Enums"]["config_type"]
          config_value?: Json
          created_at?: string | null
          id?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          config_type?: Database["public"]["Enums"]["config_type"]
          config_value?: Json
          created_at?: string | null
          id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      task_folders: {
        Row: {
          color: string
          created_at: string
          id: string
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      tasks: {
        Row: {
          assigned_to: string | null
          candidate_id: string | null
          completed: boolean
          created_at: string
          deadline: string | null
          description: string | null
          folder_id: string | null
          id: string
          job_id: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          assigned_to?: string | null
          candidate_id?: string | null
          completed?: boolean
          created_at?: string
          deadline?: string | null
          description?: string | null
          folder_id?: string | null
          id?: string
          job_id?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          assigned_to?: string | null
          candidate_id?: string | null
          completed?: boolean
          created_at?: string
          deadline?: string | null
          description?: string | null
          folder_id?: string | null
          id?: string
          job_id?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "task_folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_dashboard_stats: {
        Args: { _filter_date: string; _user_id: string }
        Returns: Json
      }
      has_manager_or_admin_role: {
        Args: { _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_team_member: { Args: { _user_id: string }; Returns: boolean }
      match_candidates_by_embedding: {
        Args: {
          filter_industry?: string
          job_embedding: string
          match_limit?: number
          similarity_threshold?: number
        }
        Returns: {
          id: string
          similarity: number
        }[]
      }
      match_jobs_by_embedding: {
        Args: {
          candidate_embedding: string
          match_limit?: number
          similarity_threshold?: number
        }
        Returns: {
          id: string
          similarity: number
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "user" | "manager" | "viewer" | "candidate"
      config_type:
        | "candidate_status"
        | "client_status"
        | "job_status"
        | "recruiting_stage"
        | "match_stage"
        | "honorar_structure"
        | "keyboard_shortcuts"
        | "source_contacts"
        | "workflow_rules"
        | "company_settings"
      user_type: "internal" | "candidate"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user", "manager", "viewer", "candidate"],
      config_type: [
        "candidate_status",
        "client_status",
        "job_status",
        "recruiting_stage",
        "match_stage",
        "honorar_structure",
        "keyboard_shortcuts",
        "source_contacts",
        "workflow_rules",
        "company_settings",
      ],
      user_type: ["internal", "candidate"],
    },
  },
} as const
