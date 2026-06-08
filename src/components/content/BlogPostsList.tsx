import { useState } from "react";
import { format } from "date-fns";
import { de, enUS } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Search, MoreHorizontal, Eye, Edit, Trash2, Archive, Globe } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";

interface BlogPost {
  id: string;
  title: string;
  slug: string | null;
  status: string;
  target_audience: string | null;
  category: string | null;
  published_at: string | null;
  created_at: string;
  word_count: number | null;
  ai_generated: boolean | null;
}

interface BlogPostsListProps {
  posts: BlogPost[];
  onEdit: (post: BlogPost) => void;
  onDelete: (id: string) => void;
  onStatusChange: (id: string, status: string) => void;
}

const statusBadgeVariant = (status: string) => {
  switch (status) {
    case 'published': return 'default';
    case 'scheduled': return 'secondary';
    case 'archived': return 'outline';
    default: return 'secondary';
  }
};

export function BlogPostsList({ posts, onEdit, onDelete, onStatusChange }: BlogPostsListProps) {
  const { t, currentLanguage } = useLanguage();
  const [search, setSearch] = useState('');
  const dateLocale = currentLanguage === 'de' ? de : enUS;

  const filtered = posts.filter(p => 
    p.title.toLowerCase().includes(search.toLowerCase()) ||
    (p.category || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder={t("common.search")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("common.title")}</TableHead>
              <TableHead>{t("common.status")}</TableHead>
              <TableHead>{t("content.targetAudience")}</TableHead>
              <TableHead>{t("content.category")}</TableHead>
              <TableHead>{t("common.date")}</TableHead>
              <TableHead className="text-right">{t("content.words")}</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                  {t("common.noResults")}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((post) => (
                <TableRow key={post.id} className="cursor-pointer hover:bg-muted/50" onClick={() => onEdit(post)}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      {post.title}
                      {post.ai_generated && (
                        <Badge variant="outline" className="text-xs">KI</Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusBadgeVariant(post.status)}>
                      {t(`content.status${post.status.charAt(0).toUpperCase() + post.status.slice(1)}`)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {post.target_audience ? t(`content.audience${post.target_audience.charAt(0).toUpperCase() + post.target_audience.slice(1)}`) : '-'}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{post.category || '-'}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {format(new Date(post.published_at || post.created_at), 'dd.MM.yyyy', { locale: dateLocale })}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">{post.word_count || 0}</TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit(post); }}>
                          <Edit className="h-4 w-4 mr-2" />{t("common.edit")}
                        </DropdownMenuItem>
                        {post.status !== 'published' && (
                          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onStatusChange(post.id, 'published'); }}>
                            <Globe className="h-4 w-4 mr-2" />{t("content.publish")}
                          </DropdownMenuItem>
                        )}
                        {post.status !== 'archived' && (
                          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onStatusChange(post.id, 'archived'); }}>
                            <Archive className="h-4 w-4 mr-2" />{t("common.archive")}
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem className="text-destructive" onClick={(e) => { e.stopPropagation(); onDelete(post.id); }}>
                          <Trash2 className="h-4 w-4 mr-2" />{t("common.delete")}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
