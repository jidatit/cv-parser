import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useLanguage } from '@/hooks/useLanguage';
import { RotateCcw, Keyboard, Loader2 } from 'lucide-react';
import { useShortcuts } from '@/contexts/ShortcutsContext';
import { 
  KeyboardShortcut, 
  AVAILABLE_KEYS,
  isModifierKey,
  normalizeKey,
  formatKeyForDisplay
} from '@/hooks/useKeyboardShortcuts';

type RecordingState = {
  shortcutId: string;
  keyType: 'first' | 'second';
} | null;

export function ShortcutSettings() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const { shortcuts, loading, updateShortcut, resetShortcuts } = useShortcuts();
  const [recording, setRecording] = useState<RecordingState>(null);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!recording) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    let key = e.key;
    
    // Normalize modifier keys
    if (key === 'Control') key = 'Ctrl';
    if (key === 'Meta') key = 'Meta';
    if (key === 'Alt') key = 'Alt';
    if (key === 'Shift') key = 'Shift';
    
    // Normalize special keys and regular keys
    if (!isModifierKey(key)) {
      key = normalizeKey(key);
    }
    
    // Validate key
    const isValidModifier = ['Alt', 'Ctrl', 'Shift', 'Meta'].includes(key);
    const isValidRegular = AVAILABLE_KEYS.includes(key.toLowerCase());
    
    if (recording.keyType === 'first') {
      if (!isValidModifier && !isValidRegular) {
        toast({
          title: t('settings.invalidKey'),
          description: t('settings.invalidKeyDesc'),
          variant: 'destructive',
        });
        setRecording(null);
        return;
      }
      handleFirstKeyChange(recording.shortcutId, isValidModifier ? key : key.toLowerCase());
    } else {
      if (!isValidRegular) {
        toast({
          title: t('settings.invalidKey'),
          description: t('settings.invalidKeyDesc'),
          variant: 'destructive',
        });
        setRecording(null);
        return;
      }
      handleSecondKeyChange(recording.shortcutId, key.toLowerCase());
    }
    
    setRecording(null);
  }, [recording, shortcuts]);

  useEffect(() => {
    if (recording) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [recording, handleKeyDown]);

  const handleFirstKeyChange = async (id: string, firstKey: string) => {
    const currentShortcut = shortcuts.find(s => s.id === id);
    if (!currentShortcut) return;

    // Check for duplicate
    const existingShortcut = shortcuts.find(
      s => s.id !== id && 
           s.firstKey.toLowerCase() === firstKey.toLowerCase() && 
           s.secondKey.toLowerCase() === currentShortcut.secondKey.toLowerCase()
    );
    
    if (existingShortcut) {
      toast({
        title: t('settings.shortcutConflict'),
        description: t('settings.shortcutConflictDesc'),
        variant: 'destructive',
      });
      return;
    }

    await updateShortcut(id, firstKey, currentShortcut.secondKey);
    
    toast({
      title: t('settings.shortcutUpdated'),
      description: t('settings.shortcutUpdatedDesc'),
    });
  };

  const handleSecondKeyChange = async (id: string, secondKey: string) => {
    const currentShortcut = shortcuts.find(s => s.id === id);
    if (!currentShortcut) return;

    // Check for duplicate
    const existingShortcut = shortcuts.find(
      s => s.id !== id && 
           s.firstKey.toLowerCase() === currentShortcut.firstKey.toLowerCase() && 
           s.secondKey.toLowerCase() === secondKey.toLowerCase()
    );
    
    if (existingShortcut) {
      toast({
        title: t('settings.shortcutConflict'),
        description: t('settings.shortcutConflictDesc'),
        variant: 'destructive',
      });
      return;
    }

    await updateShortcut(id, currentShortcut.firstKey, secondKey);
    
    toast({
      title: t('settings.shortcutUpdated'),
      description: t('settings.shortcutUpdatedDesc'),
    });
  };

  const handleReset = async () => {
    await resetShortcuts();
    toast({
      title: t('settings.shortcutsReset'),
      description: t('settings.shortcutsResetDesc'),
    });
  };

  const getTranslatedLabel = (id: string): string => {
    const key = `nav.${id}`;
    const translated = t(key);
    return translated !== key ? translated : shortcuts.find(s => s.id === id)?.label || id;
  };

  const formatKeyDisplay = (key: string): string => {
    return formatKeyForDisplay(key);
  };

  const getShortcutSeparator = (firstKey: string): string => {
    return isModifierKey(firstKey) ? ' + ' : ' → ';
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Keyboard className="h-5 w-5" />
            {t('settings.keyboardShortcuts')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Keyboard className="h-5 w-5" />
              {t('settings.keyboardShortcuts')}
            </CardTitle>
            <CardDescription>
              {t('settings.keyboardShortcutsDesc')}
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={handleReset}>
            <RotateCcw className="h-4 w-4 mr-2" />
            {t('settings.resetShortcuts')}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {t('settings.shortcutInstructions')}
          </p>
          <div className="text-xs text-muted-foreground bg-muted/50 p-3 rounded-md">
            <strong>{t('settings.shortcutHint')}:</strong> {t('settings.shortcutHintDesc')}
          </div>
          <div className="grid gap-3">
            {shortcuts.map((shortcut) => (
              <div 
                key={shortcut.id}
                className="flex items-center justify-between p-3 rounded-lg border bg-card"
              >
                <span className="font-medium">{getTranslatedLabel(shortcut.id)}</span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    className={`w-24 font-mono ${recording?.shortcutId === shortcut.id && recording?.keyType === 'first' ? 'ring-2 ring-primary animate-pulse' : ''}`}
                    onClick={() => setRecording({ shortcutId: shortcut.id, keyType: 'first' })}
                  >
                    {recording?.shortcutId === shortcut.id && recording?.keyType === 'first' 
                      ? '...' 
                      : formatKeyDisplay(shortcut.firstKey)}
                  </Button>
                  <span className="text-muted-foreground w-4 text-center">
                    {isModifierKey(shortcut.firstKey) ? '+' : '→'}
                  </span>
                  <Button
                    variant="outline"
                    className={`w-20 font-mono ${recording?.shortcutId === shortcut.id && recording?.keyType === 'second' ? 'ring-2 ring-primary animate-pulse' : ''}`}
                    onClick={() => setRecording({ shortcutId: shortcut.id, keyType: 'second' })}
                  >
                    {recording?.shortcutId === shortcut.id && recording?.keyType === 'second' 
                      ? '...' 
                      : formatKeyDisplay(shortcut.secondKey)}
                  </Button>
                  <Badge variant="secondary" className="ml-2 font-mono min-w-[80px] justify-center">
                    {formatKeyDisplay(shortcut.firstKey)}
                    {getShortcutSeparator(shortcut.firstKey)}
                    {formatKeyDisplay(shortcut.secondKey)}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
