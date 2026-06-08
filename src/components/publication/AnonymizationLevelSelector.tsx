import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLanguage } from "@/hooks/useLanguage";

interface Props {
  value: string;
  onChange: (value: string) => void;
}

export function AnonymizationLevelSelector({ value, onChange }: Props) {
  const { t } = useLanguage();

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-[130px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="light">
          <span className="flex flex-col">
            <span>{t("publicationManager.anonymization.light")}</span>
          </span>
        </SelectItem>
        <SelectItem value="medium">
          <span className="flex flex-col">
            <span>{t("publicationManager.anonymization.medium")}</span>
          </span>
        </SelectItem>
        <SelectItem value="strong">
          <span className="flex flex-col">
            <span>{t("publicationManager.anonymization.strong")}</span>
          </span>
        </SelectItem>
      </SelectContent>
    </Select>
  );
}
