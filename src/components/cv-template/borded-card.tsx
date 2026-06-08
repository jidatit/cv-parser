import React from "react";

/** Only lines starting with "•" start a new bullet; others merge into previous. Strip "•" and use single bullet per item. */
function descriptionToBulletPoints(description: string): string[] {
  const BULLET = "\u2022"; // •
  const trimmed = (description || "").trim();
  if (!trimmed) return [];
  const lines = trimmed
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const points: string[] = [];
  let current = "";
  for (const line of lines) {
    if (line.startsWith(BULLET + " ") || line.startsWith(BULLET)) {
      if (current) points.push(current);
      current = line.replace(new RegExp(`^${BULLET}\\s*`), "").trim();
    } else {
      if (current) current += "\n" + line;
      else current = line;
    }
  }
  if (current) points.push(current);
  return points;
}

/** Strip leading "•" and replace \n with space so only template bullet shows and text wraps by width */
function toDisplayText(text: string): string {
  if (!text || typeof text !== "string") return text;
  const t = text.trim();
  const bullet = "\u2022";
  const stripped =
    t.startsWith(bullet + " ") || t.startsWith(bullet)
      ? t.replace(new RegExp(`^${bullet}\\s*`), "").trim()
      : t;
  return stripped.replace(/&nbsp;/g, " ").replace(/\u00A0/g, " ").replace(/\n+/g, " ").trim();
}

type BorderedCardProps = {
  title: string;
  subtitle: string;
  description: string;
  validations?: string[];
  titleStyle?: string;
  subtitleStyle?: string;
  descriptionStyle?: string;
  /** When true, no box/background/border/shadow – content only */
  noBackground?: boolean;
};

export const BorderedCard = ({
  title,
  subtitle,
  titleStyle,
  subtitleStyle,
  descriptionStyle,
  description,
  validations = [],
  noBackground = false,
}: BorderedCardProps) => {
  const bulletPoints = descriptionToBulletPoints(description);
  const hasBulletPrefix = (description || "")
    .split("\n")
    .some((l) => /^\s*\u2022(\s|$)/.test(l.trim()));
  const showAsList = hasBulletPrefix && bulletPoints.length > 0;

  return (
    <div
      className={
        noBackground
          ? "p-0"
          : "relative rounded-xl border-b-2 border-[#] p-4 shadow-lg bg-gradient-to-b from-[#1D282A] via-[#090C0C] to-[#090C0C]"
      }
    >
      <h3
        className={`text-lg font-semibold uppercase tracking-widest ${titleStyle}`}
      >
        {title}
      </h3>

      <h2 className={`mt-1 text-lg font-bold ${subtitleStyle}`}>{subtitle}</h2>

      {showAsList ? (
        <ul
          className={`mt-2 space-y-0.5 text-[14px] leading-relaxed ${descriptionStyle}`}
        >
          {bulletPoints.map((point, idx) => (
            <li
              key={idx}
              className={`relative pl-3 py-0.5 ${descriptionStyle}`}
            >
              <span className="absolute left-0 top-[0.7rem] h-1 w-1 rounded-full bg-[#58C594]" />
              {toDisplayText(point)}
            </li>
          ))}
        </ul>
      ) : (
        <p className={`mt-2 text-xs leading-relaxed ${descriptionStyle}`}>
          {toDisplayText(description)}
        </p>
      )}

      {validations.length > 0 && (
        <div className="mt-2">
          <p className={`text-[10px] font-medium ${descriptionStyle}`}>
            Optional validations:
          </p>
          <p className={`mt-0.5 text-[11px] ${descriptionStyle}`}>
            {validations.join(" · ")}
          </p>
        </div>
      )}
    </div>
  );
};
