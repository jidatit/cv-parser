import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Button } from '@/components/ui/button';
import { List, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCallback, useRef } from 'react';
import { trimTrailingEmptyRichText } from '@/lib/richTextCleanup';

interface DescriptionEditorProps {
  content: string;
  onChange: (content: string) => void;
  placeholder?: string;
  className?: string;
}

// Convert plain text with line breaks to HTML paragraphs (for legacy data)
const ensureHtml = (text: string): string => {
  if (!text) return '<p></p>';
  
  // Already HTML - return as is
  if (text.includes('<ul>') || text.includes('<li>') || text.includes('<p>')) {
    return text;
  }
  
  // Convert plain text lines to paragraphs
  const lines = text.split('\n');
  return lines.map(line => `<p>${line}</p>`).join('');
};

export function DescriptionEditor({ content, onChange, placeholder = "Beschreibung...", className }: DescriptionEditorProps) {
  // Track if we're currently updating from external content change
  const isExternalUpdate = useRef(false);
  
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        bulletList: {
          keepMarks: true,
          keepAttributes: false,
          HTMLAttributes: {
            class: 'list-disc ml-4',
          },
        },
        paragraph: {
          HTMLAttributes: {
            class: 'text-sm',
          },
        },
      }),
    ],
    content: ensureHtml(content),
    onUpdate: ({ editor }) => {
      // Don't trigger onChange during external updates
      if (isExternalUpdate.current) return;
      
      // Store HTML directly to preserve formatting, clean trailing empty paragraphs
      const html = editor.getHTML();
      const cleanedHtml = trimTrailingEmptyRichText(html);
      onChange(cleanedHtml);
    },
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none focus:outline-none min-h-[80px] p-2 text-sm [&_ul]:list-disc [&_ul]:ml-4 [&_li]:ml-2 [&_p]:text-sm [&_p]:leading-relaxed',
      },
    },
  });

  const deleteCurrentBullet = useCallback(() => {
    if (!editor) return;
    
    // Get current position
    const { from } = editor.state.selection;
    const $pos = editor.state.doc.resolve(from);
    
    // Find the list item node
    for (let depth = $pos.depth; depth > 0; depth--) {
      const node = $pos.node(depth);
      if (node.type.name === 'listItem') {
        // Delete the entire list item
        const start = $pos.before(depth);
        const end = $pos.after(depth);
        editor.chain().focus().deleteRange({ from: start, to: end }).run();
        return;
      }
    }
    
    // Fallback: delete current paragraph
    editor.chain().focus().deleteNode('paragraph').run();
  }, [editor]);

  if (!editor) {
    return null;
  }

  return (
    <div className={cn("border rounded-md bg-background", className)}>
      <div className="flex items-center gap-1 p-1 border-b bg-muted/30">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={cn(
            "h-7 w-7 p-0",
            editor.isActive('bulletList') && "bg-muted"
          )}
          title="Aufzählung"
        >
          <List className="h-3.5 w-3.5" />
        </Button>
        <div className="w-px h-5 bg-border" />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={deleteCurrentBullet}
          className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
          title="Aktuellen Punkt löschen"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
