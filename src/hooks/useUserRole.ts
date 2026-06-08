import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type UserRole = 'admin' | 'manager' | 'user' | 'viewer' | 'candidate' | null;
export type UserType = 'internal' | 'candidate' | null;

export const useUserRole = () => {
  const [role, setRole] = useState<UserRole>(null);
  const [userType, setUserType] = useState<UserType>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUserRole = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setRole(null);
          setUserType(null);
          return;
        }

        // Fetch user_type from profiles
        const { data: profile } = await supabase
          .from('profiles')
          .select('user_type')
          .eq('id', user.id)
          .single();

        const fetchedUserType = (profile?.user_type as UserType) || 'internal';
        setUserType(fetchedUserType);

        // Candidates get no CRM role
        if (fetchedUserType === 'candidate') {
          setRole(null);
          return;
        }

        const { data, error } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id)
          .single();

        if (error) {
          setRole('user');
        } else {
          setRole(data.role as UserRole);
        }
      } catch (error) {
        console.error('Error fetching user role:', error);
        setRole('user');
      } finally {
        setLoading(false);
      }
    };

    fetchUserRole();
  }, []);

  return { 
    role, 
    userType,
    isAdmin: role === 'admin', 
    isManager: role === 'manager',
    isViewer: role === 'viewer',
    isCandidate: userType === 'candidate',
    canManageUsers: role === 'admin',
    canEditData: role === 'admin' || role === 'manager' || role === 'user',
    loading 
  };
};
