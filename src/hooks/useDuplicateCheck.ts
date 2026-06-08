import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface DuplicateCandidate {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  matchType: 'email' | 'name' | 'phone';
}

export function useDuplicateCheck() {
  const [duplicates, setDuplicates] = useState<DuplicateCandidate[]>([]);
  const [checking, setChecking] = useState(false);

  const checkForDuplicates = useCallback(async (email: string, name: string, phone?: string) => {
    if (!email && !name) {
      setDuplicates([]);
      return [];
    }

    setChecking(true);
    try {
      const foundDuplicates: DuplicateCandidate[] = [];

      // Check by email (exact match)
      if (email && email.trim()) {
        const { data: emailMatches } = await supabase
          .from('candidates')
          .select('id, name, email, phone')
          .ilike('email', email.trim())
          .limit(5);

        emailMatches?.forEach(match => {
          if (!foundDuplicates.find(d => d.id === match.id)) {
            foundDuplicates.push({
              id: match.id,
              name: match.name,
              email: match.email,
              phone: match.phone,
              matchType: 'email'
            });
          }
        });
      }

      // Check by name (fuzzy - contains)
      if (name && name.trim().length >= 3) {
        const nameParts = name.trim().split(' ').filter(p => p.length >= 2);
        
        for (const part of nameParts.slice(0, 2)) {
          const { data: nameMatches } = await supabase
            .from('candidates')
            .select('id, name, email, phone')
            .ilike('name', `%${part}%`)
            .limit(5);

          nameMatches?.forEach(match => {
            if (!foundDuplicates.find(d => d.id === match.id)) {
              foundDuplicates.push({
                id: match.id,
                name: match.name,
                email: match.email,
                phone: match.phone,
                matchType: 'name'
              });
            }
          });
        }
      }

      // Check by phone (if provided)
      if (phone && phone.trim().length >= 6) {
        const cleanPhone = phone.replace(/\D/g, '');
        if (cleanPhone.length >= 6) {
          const { data: phoneMatches } = await supabase
            .from('candidates')
            .select('id, name, email, phone')
            .not('phone', 'is', null)
            .limit(20);

          phoneMatches?.forEach(match => {
            if (match.phone) {
              const matchCleanPhone = match.phone.replace(/\D/g, '');
              if (matchCleanPhone.includes(cleanPhone) || cleanPhone.includes(matchCleanPhone)) {
                if (!foundDuplicates.find(d => d.id === match.id)) {
                  foundDuplicates.push({
                    id: match.id,
                    name: match.name,
                    email: match.email,
                    phone: match.phone,
                    matchType: 'phone'
                  });
                }
              }
            }
          });
        }
      }

      setDuplicates(foundDuplicates);
      return foundDuplicates;
    } catch (error) {
      console.error('Error checking for duplicates:', error);
      return [];
    } finally {
      setChecking(false);
    }
  }, []);

  const clearDuplicates = useCallback(() => {
    setDuplicates([]);
  }, []);

  return {
    duplicates,
    checking,
    checkForDuplicates,
    clearDuplicates
  };
}
