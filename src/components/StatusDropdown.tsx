import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatusDropdownProps {
  currentStatus: string;
  currentColor: string;
  availableStatuses: Array<{
    id?: string;
    title: string;
    color: string;
  }>;
  onStatusChange: (newStatus: string) => void;
  disabled?: boolean;
}

export function StatusDropdown({
  currentStatus,
  currentColor,
  availableStatuses,
  onStatusChange,
  disabled = false,
}: StatusDropdownProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled}>
        <button
          className={cn(
            "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors hover:opacity-80 cursor-pointer whitespace-nowrap",
            currentColor
          )}
        >
          {currentStatus}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="z-50 bg-popover">
        {availableStatuses.map((status) => (
          <DropdownMenuItem
            key={status.id || status.title}
            onClick={() => onStatusChange(status.id || status.title)}
            className="cursor-pointer"
          >
            <Badge className={`${status.color} mr-2`} variant="outline">
              {status.title}
            </Badge>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}