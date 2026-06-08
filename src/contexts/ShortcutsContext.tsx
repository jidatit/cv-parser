import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useAuth } from './AuthContext';
import {
  KeyboardShortcut,
  DEFAULT_SHORTCUTS,
  getShortcutsFromStorage,
  getShortcutsFromDB,
  saveShortcutsToDB,
  saveShortcutsToStorage,
  resetShortcutsInDB,
  resetShortcutsInStorage,
} from '@/hooks/useKeyboardShortcuts';

interface ShortcutsContextType {
  shortcuts: KeyboardShortcut[];
  loading: boolean;
  updateShortcut: (id: string, firstKey: string, secondKey: string) => Promise<KeyboardShortcut[]>;
  resetShortcuts: () => Promise<KeyboardShortcut[]>;
  setShortcuts: (shortcuts: KeyboardShortcut[]) => void;
}

const ShortcutsContext = createContext<ShortcutsContextType | null>(null);

export function useShortcuts() {
  const context = useContext(ShortcutsContext);
  if (!context) {
    throw new Error('useShortcuts must be used within a ShortcutsProvider');
  }
  return context;
}

interface ShortcutsProviderProps {
  children: ReactNode;
}

export function ShortcutsProvider({ children }: ShortcutsProviderProps) {
  const { user, loading: authLoading } = useAuth();
  const [shortcuts, setShortcuts] = useState<KeyboardShortcut[]>(DEFAULT_SHORTCUTS);
  const [loading, setLoading] = useState(true);

  // Load shortcuts when user changes
  useEffect(() => {
    async function loadShortcuts() {
      if (authLoading) return;
      
      setLoading(true);
      try {
        if (user) {
          const dbShortcuts = await getShortcutsFromDB(user.id);
          if (dbShortcuts) {
            setShortcuts(dbShortcuts);
          } else {
            // User has no shortcuts in DB, check localStorage and migrate
            const localShortcuts = getShortcutsFromStorage();
            if (JSON.stringify(localShortcuts) !== JSON.stringify(DEFAULT_SHORTCUTS)) {
              // Migrate local shortcuts to DB
              await saveShortcutsToDB(user.id, localShortcuts);
            }
            setShortcuts(localShortcuts);
          }
        } else {
          // Not authenticated, use localStorage
          setShortcuts(getShortcutsFromStorage());
        }
      } catch (error) {
        console.error('Error loading shortcuts:', error);
        setShortcuts(getShortcutsFromStorage());
      } finally {
        setLoading(false);
      }
    }

    loadShortcuts();
  }, [user?.id, authLoading]);

  const updateShortcut = async (id: string, firstKey: string, secondKey: string): Promise<KeyboardShortcut[]> => {
    const updated = shortcuts.map(s =>
      s.id === id ? { ...s, firstKey, secondKey } : s
    );
    setShortcuts(updated);

    if (user) {
      await saveShortcutsToDB(user.id, updated);
    } else {
      saveShortcutsToStorage(updated);
    }

    return updated;
  };

  const resetShortcutsHandler = async (): Promise<KeyboardShortcut[]> => {
    setShortcuts(DEFAULT_SHORTCUTS);

    if (user) {
      await resetShortcutsInDB(user.id);
    } else {
      resetShortcutsInStorage();
    }

    return DEFAULT_SHORTCUTS;
  };

  return (
    <ShortcutsContext.Provider
      value={{
        shortcuts,
        loading,
        updateShortcut,
        resetShortcuts: resetShortcutsHandler,
        setShortcuts,
      }}
    >
      {children}
    </ShortcutsContext.Provider>
  );
}
