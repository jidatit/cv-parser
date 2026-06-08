import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import { Button } from '@/components/ui/button';
import { Bold, Italic, UnderlineIcon, List } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useEffect, useRef } from 'react';

// URL regex pattern
const urlRegex = /(https?:\/\/[^\s<>"{}|\\^`[\]]+)/g;

// Convert URLs in text to anchor tags
const linkifyText = (text: string): string => {
  return text.replace(urlRegex, (url) => {
    return `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`;
  });
};

// Convert pasted plain text with bullet points to proper HTML
const convertPastedText = (text: string): string => {
  const lines = text.split(/\r\n|\n/);
  const result: string[] = [];
  let inList = false;
  
  for (const line of lines) {
    const trimmedLine = line.trim();
    
    // Check if line starts with bullet point markers
    const bulletMatch = trimmedLine.match(/^(?:[•·●◦▪▫‣⁃]|\-|\*)\s*(.*)$/);
    
    if (bulletMatch) {
      if (!inList) {
        result.push('<ul>');
        inList = true;
      }
      // Linkify the content
      result.push(`<li><p>${linkifyText(bulletMatch[1])}</p></li>`);
    } else {
      if (inList) {
        result.push('</ul>');
        inList = false;
      }
      if (trimmedLine) {
        // Linkify the content
        result.push(`<p>${linkifyText(trimmedLine)}</p>`);
      } else if (result.length > 0) {
        // Preserve empty lines
        result.push('<p></p>');
      }
    }
  }
  
  if (inList) {
    result.push('</ul>');
  }
  
  return result.join('');
};

interface RichTextEditorProps {
  content: string;
  onChange: (content: string) => void;
  placeholder?: string;
  toolbarExtra?: React.ReactNode;
}

export function RichTextEditor({ content, onChange, placeholder, toolbarExtra }: RichTextEditorProps) {
  const isUpdatingFromProp = useRef(false);
  
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        bulletList: {
          keepMarks: true,
          keepAttributes: false,
        },
        orderedList: {
          keepMarks: true,
          keepAttributes: false,
        },
      }),
      Underline,
      Link.configure({
        openOnClick: true,
        autolink: true,
        linkOnPaste: true,
        HTMLAttributes: {
          class: 'text-primary underline cursor-pointer hover:text-primary/80',
          target: '_blank',
          rel: 'noopener noreferrer',
        },
      }),
    ],
    content,
    onUpdate: ({ editor }) => {
      if (!isUpdatingFromProp.current) {
        onChange(editor.getHTML());
      }
    },
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none focus:outline-none min-h-[120px] p-3 text-sm [&_ul]:list-disc [&_ul]:ml-4 [&_ol]:list-decimal [&_ol]:ml-4 [&_li]:ml-2 [&_p]:text-sm [&_p]:leading-relaxed',
      },
      handlePaste: (view, event) => {
        const text = event.clipboardData?.getData('text/plain');
        if (text && ((text.includes('\n') || text.includes('\r')) || /(^|\r?\n)\s*(?:[•·●◦▪▫‣⁃]|\-|\*)\s+/m.test(text))) {
          // Convert pasted text with line breaks or bullets to proper HTML
          const html = convertPastedText(text);
          editor?.commands.insertContent(html);
          return true; // Prevent default paste
        }
        return false; // Let default paste handle it
      },
    },
  });

  // Sync external content changes to the editor
  useEffect(() => {
    if (!editor) return;
    
    const currentContent = editor.getHTML();
    // Only update if content actually changed and isn't just empty variations
    const isEmpty = (html: string) => !html || html === '<p></p>' || html === '<p><br></p>';
    
    if (content !== currentContent && !(isEmpty(content) && isEmpty(currentContent))) {
      isUpdatingFromProp.current = true;
      editor.commands.setContent(content || '');
      isUpdatingFromProp.current = false;
    }
  }, [content, editor]);

  if (!editor) {
    return null;
  }

  return (
    <div className="border rounded-md bg-background">
      <div className="flex items-center gap-1 p-2 border-b">
        <div className="flex items-center gap-1 flex-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={cn(
            "h-8 w-8 p-0",
            editor.isActive('bold') && "bg-muted"
          )}
        >
          <Bold className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={cn(
            "h-8 w-8 p-0",
            editor.isActive('italic') && "bg-muted"
          )}
        >
          <Italic className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          className={cn(
            "h-8 w-8 p-0",
            editor.isActive('underline') && "bg-muted"
          )}
        >
          <UnderlineIcon className="h-4 w-4" />
        </Button>
        <div className="w-px h-6 bg-border mx-1" />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            // Custom bullet list toggle that skips empty paragraphs but preserves spacing
            if (editor.isActive('bulletList')) {
              editor.chain().focus().toggleBulletList().run();
            } else {
              // Get current content
              const { from, to } = editor.state.selection;
              const selectedText = editor.state.doc.textBetween(from, to, '\n');
              
              // If there's a selection with empty lines, handle specially
              if (selectedText.includes('\n')) {
                const lines = selectedText.split('\n');
                const htmlParts: string[] = [];
                let inList = false;
                
                for (const line of lines) {
                  const trimmed = line.trim();
                  if (trimmed === '') {
                    // Empty line - close list if open and add spacing
                    if (inList) {
                      htmlParts.push('</ul>');
                      inList = false;
                    }
                    htmlParts.push('<p>&nbsp;</p>');
                  } else {
                    // Non-empty line - add to list
                    if (!inList) {
                      htmlParts.push('<ul>');
                      inList = true;
                    }
                    htmlParts.push(`<li><p>${trimmed}</p></li>`);
                  }
                }
                
                if (inList) {
                  htmlParts.push('</ul>');
                }
                
                if (htmlParts.length > 0) {
                  editor.chain()
                    .focus()
                    .deleteSelection()
                    .insertContent(htmlParts.join(''))
                    .run();
                }
              } else {
                editor.chain().focus().toggleBulletList().run();
              }
            }
          }}
          className={cn(
            "h-8 w-8 p-0",
            editor.isActive('bulletList') && "bg-muted"
          )}
        >
          <List className="h-4 w-4" />
        </Button>
        </div>
        {toolbarExtra}
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
