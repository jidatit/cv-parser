import { useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useShortcuts } from '@/contexts/ShortcutsContext';

export interface KeyboardShortcut {
  id: string;
  label: string;
  path: string;
  firstKey: string;
  secondKey: string;
}

export const DEFAULT_SHORTCUTS: KeyboardShortcut[] = [
  { id: 'dashboard', label: 'Dashboard', path: '/', firstKey: 'Alt', secondKey: 'd' },
  { id: 'candidates', label: 'Kandidaten', path: '/candidates', firstKey: 'Alt', secondKey: 'k' },
  { id: 'clients', label: 'Kunden', path: '/clients', firstKey: 'Alt', secondKey: 'u' },
  { id: 'jobs', label: 'Stellen', path: '/jobs', firstKey: 'Alt', secondKey: 's' },
  { id: 'pipeline', label: 'Pipeline', path: '/pipeline', firstKey: 'Alt', secondKey: 'p' },
  { id: 'recruiting', label: 'Recruiting', path: '/recruiting', firstKey: 'Alt', secondKey: 'r' },
  { id: 'analytics', label: 'Analytics', path: '/analytics', firstKey: 'Alt', secondKey: 'a' },
  { id: 'aiMatches', label: 'KI-Matches', path: '/ai-matches', firstKey: 'Alt', secondKey: 'm' },
  { id: 'tasks', label: 'Aufgaben', path: '/tasks', firstKey: 'Alt', secondKey: 't' },
  { id: 'settings', label: 'Einstellungen', path: '/settings', firstKey: 'Alt', secondKey: 'e' },
];

const STORAGE_KEY = 'keyboard_shortcuts';
const CONFIG_TYPE = 'keyboard_shortcuts';

export const MODIFIER_KEYS = ['Alt', 'Ctrl', 'Shift', 'Meta'] as const;
export type ModifierKey = typeof MODIFIER_KEYS[number];

export const AVAILABLE_KEYS = [
  'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm',
  'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z',
  '1', '2', '3', '4', '5', '6', '7', '8', '9', '0',
  'space', 'enter', 'escape', 'tab', 'backspace'
];

// Special keys mapping for display and normalization
export const SPECIAL_KEYS: Record<string, string> = {
  ' ': 'space',
  'Enter': 'enter',
  'Escape': 'escape',
  'Tab': 'tab',
  'Backspace': 'backspace',
};

export function normalizeKey(key: string): string {
  if (SPECIAL_KEYS[key]) return SPECIAL_KEYS[key];
  if (key.length === 1) return key.toLowerCase();
  return key;
}

export function formatKeyForDisplay(key: string): string {
  const displayNames: Record<string, string> = {
    'space': '␣',
    'enter': '↵',
    'escape': 'Esc',
    'tab': 'Tab',
    'backspace': '⌫',
  };
  if (displayNames[key.toLowerCase()]) return displayNames[key.toLowerCase()];
  if (isModifierKey(key)) return key;
  return key.toUpperCase();
}

// All possible first keys (modifiers + regular keys)
export const ALL_FIRST_KEYS = [...MODIFIER_KEYS, ...AVAILABLE_KEYS];

export function isModifierKey(key: string): boolean {
  return MODIFIER_KEYS.includes(key as ModifierKey);
}

// Local storage functions (fallback for non-authenticated users)
export function getShortcutsFromStorage(): KeyboardShortcut[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed[0]?.modifierKey) {
        const migrated = parsed.map((s: any) => ({
          ...s,
          firstKey: s.modifierKey,
          secondKey: s.key,
        }));
        saveShortcutsToStorage(migrated);
        return migrated;
      }
      return parsed;
    }
  } catch (error) {
    console.error('Error loading shortcuts:', error);
  }
  return DEFAULT_SHORTCUTS;
}

export function saveShortcutsToStorage(shortcuts: KeyboardShortcut[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(shortcuts));
  } catch (error) {
    console.error('Error saving shortcuts:', error);
  }
}

export function resetShortcutsInStorage(): KeyboardShortcut[] {
  localStorage.removeItem(STORAGE_KEY);
  return DEFAULT_SHORTCUTS;
}

// Database functions for authenticated users
export async function getShortcutsFromDB(userId: string): Promise<KeyboardShortcut[] | null> {
  try {
    const { data, error } = await supabase
      .from('status_configurations')
      .select('config_value')
      .eq('user_id', userId)
      .eq('config_type', CONFIG_TYPE as any)
      .maybeSingle();
    
    if (error) throw error;
    if (data?.config_value) {
      return data.config_value as unknown as KeyboardShortcut[];
    }
    return null;
  } catch (error) {
    console.error('Error loading shortcuts from DB:', error);
    return null;
  }
}

export async function saveShortcutsToDB(userId: string, shortcuts: KeyboardShortcut[]): Promise<boolean> {
  try {
    // First check if entry exists
    const { data: existing } = await supabase
      .from('status_configurations')
      .select('id')
      .eq('user_id', userId)
      .eq('config_type', CONFIG_TYPE as any)
      .maybeSingle();
    
    if (existing) {
      // Update existing
      const { error } = await supabase
        .from('status_configurations')
        .update({
          config_value: shortcuts as any,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId)
        .eq('config_type', CONFIG_TYPE as any);
      
      if (error) throw error;
    } else {
      // Insert new
      const { error } = await supabase
        .from('status_configurations')
        .insert({
          user_id: userId,
          config_type: CONFIG_TYPE,
          config_value: shortcuts,
        } as any);
      
      if (error) throw error;
    }
    return true;
  } catch (error) {
    console.error('Error saving shortcuts to DB:', error);
    return false;
  }
}

export async function resetShortcutsInDB(userId: string): Promise<KeyboardShortcut[]> {
  await saveShortcutsToDB(userId, DEFAULT_SHORTCUTS);
  return DEFAULT_SHORTCUTS;
}

// Legacy exports for backward compatibility
export const getShortcuts = getShortcutsFromStorage;
export const saveShortcuts = saveShortcutsToStorage;
export const resetShortcuts = resetShortcutsInStorage;

export function useKeyboardShortcuts() {
  const navigate = useNavigate();
  const { shortcuts } = useShortcuts();
  const heldKeys = useRef<Set<string>>(new Set());

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    // Don't trigger shortcuts when typing in inputs
    const target = event.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
      return;
    }

    const pressedKey = normalizeKey(event.key);

    // Track held keys for non-modifier first keys
    if (!isModifierKey(pressedKey)) {
      heldKeys.current.add(pressedKey);
    }

    // Check for modifier-based shortcuts (modifier held + key pressed)
    const activeModifier = event.altKey ? 'Alt' 
      : event.ctrlKey ? 'Ctrl' 
      : event.shiftKey ? 'Shift' 
      : event.metaKey ? 'Meta' 
      : null;

    if (activeModifier) {
      const matchedShortcut = shortcuts.find(
        shortcut => 
          shortcut.firstKey === activeModifier && 
          shortcut.secondKey.toLowerCase() === pressedKey.toLowerCase()
      );

      if (matchedShortcut) {
        event.preventDefault();
        // Blur any focused element to remove focus ring
        (document.activeElement as HTMLElement)?.blur();
        navigate(matchedShortcut.path);
        return;
      }
    }

    // Check for hold-based shortcuts (first key held + second key pressed)
    // Only for non-modifier first keys
    const nonModifierShortcuts = shortcuts.filter(s => !isModifierKey(s.firstKey));
    
    if (nonModifierShortcuts.length === 0) return;

    // Check if any first key is being held and current key matches second key
    for (const shortcut of nonModifierShortcuts) {
      const firstKeyHeld = heldKeys.current.has(shortcut.firstKey.toLowerCase());
      const secondKeyMatches = shortcut.secondKey.toLowerCase() === pressedKey.toLowerCase();
      
      if (firstKeyHeld && secondKeyMatches && shortcut.firstKey.toLowerCase() !== pressedKey.toLowerCase()) {
        event.preventDefault();
        // Blur any focused element to remove focus ring
        (document.activeElement as HTMLElement)?.blur();
        navigate(shortcut.path);
        return;
      }
    }
  }, [navigate, shortcuts]);

  const handleKeyUp = useCallback((event: KeyboardEvent) => {
    const releasedKey = normalizeKey(event.key);
    heldKeys.current.delete(releasedKey);
  }, []);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    
    // Clear held keys when window loses focus
    const handleBlur = () => {
      heldKeys.current.clear();
    };
    window.addEventListener('blur', handleBlur);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, [handleKeyDown, handleKeyUp]);

  return { shortcuts };
}

export function useShortcutManager() {
  const { shortcuts, updateShortcut, resetShortcuts } = useShortcuts();

  return {
    shortcuts,
    updateShortcut,
    resetShortcuts,
  };
}
