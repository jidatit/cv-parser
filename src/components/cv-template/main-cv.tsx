import React, { useRef, useLayoutEffect, useState } from "react";
import { Candidate } from "../types/cv-types";
import { SimpleCard, SimpleCardPlain, type NestedPoint } from "./simple-card";
import { BorderedCard } from "./borded-card";
import PersonalInfoCard from "./personalInfoCard";
const Whitelogo = "/bs-logo-white.png";
const HeaderSideBg = "/Element%202C.png";
const Asset8 = "/mountain@2x.png";
/** Convert HTML (from rich-text editor) to plain-text with bullet markers
 *  so the existing descriptionToPoints / parseDescriptionBullets logic works. */
function decodeHtmlEntities(text: string): string {
  const textarea = document.createElement("textarea");
  textarea.innerHTML = text;
  return textarea.value;
}

function stripHtmlToPlainBullets(html: string): string {
  if (!html) return html;
  if (!html.includes("<")) return decodeHtmlEntities(html.replace(/&nbsp;/g, " "));
  const doc = new DOMParser().parseFromString(html, "text/html");
  const lines: string[] = [];
  doc.querySelectorAll("li").forEach((li) => {
    const text = (li.textContent || "").trim();
    if (text) lines.push("\u2022 " + text);
  });
  if (lines.length > 0) return lines.join("\n");
  let plain = html.replace(/<br\s*\/?>/gi, "\n");
  plain = plain.replace(/<[^>]*>/g, "");
  return decodeHtmlEntities(plain.trim());
}

interface MainCVProps {
  candidate: Candidate;
}

/** Parse description with • (main), :: (sub), Ο/○ (sub-sub) into nested points */
function parseDescriptionBullets(description: string): NestedPoint[] {
  const lines = description
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const result: NestedPoint[] = [];
  const BULLET = "\u2022"; // •
  const GREEK_OMICRON = "\u039F"; // Ο
  const WHITE_CIRCLE = "\u25CB"; // ○

  for (const line of lines) {
    let level = 0;
    let text = line;

    if (line.startsWith(":: ") || line.startsWith("::")) {
      level = 1;
      text = line.replace(/^::\s?/, "").trim();
    } else if (
      line.startsWith(GREEK_OMICRON + " ") ||
      line.startsWith(GREEK_OMICRON) ||
      line.startsWith(WHITE_CIRCLE + " ") ||
      line.startsWith(WHITE_CIRCLE) ||
      /^O\s/.test(line) // Latin O + space as sub-sub (e.g. "O Kostenstellen")
    ) {
      level = 2;
      text = line
        .replace(new RegExp(`^${GREEK_OMICRON}\\s?`), "")
        .replace(new RegExp(`^${WHITE_CIRCLE}\\s?`), "")
        .replace(/^O\s/, "")
        .trim();
    } else if (line.startsWith(BULLET + " ") || line.startsWith(BULLET)) {
      level = 0;
      text = line.replace(new RegExp(`^${BULLET}\\s?`), "").trim();
    }
    if (text.length > 0) result.push({ level, text });
  }
  return result;
}

/** Normalize bullet list: only "•" at line start = new bullet; other lines merge into previous. Handles string or array (e.g. when backend split one bullet into multiple lines). */
function normalizeBulletPoints(
  value: string | string[] | null | undefined,
): string[] {
  if (value == null) return [];
  const BULLET = "\u2022"; // •

  if (typeof value === "string") {
    const lines = value
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    const result: string[] = [];
    let current = "";
    for (const line of lines) {
      if (line.startsWith(BULLET + " ") || line.startsWith(BULLET)) {
        if (current) result.push(current);
        current = line.replace(new RegExp(`^${BULLET}\\s*`), "").trim();
      } else {
        if (current) current += "\n" + line;
        else current = line;
      }
    }
    if (current) result.push(current);
    return result;
  }

  if (!Array.isArray(value) || value.length === 0) return [];
  const arr = value.map((v) => (v ?? "").toString().trim()).filter(Boolean);
  const hasBulletStart = arr.some(
    (s) => s.startsWith(BULLET + " ") || s.startsWith(BULLET),
  );
  if (!hasBulletStart) return arr; // already one bullet per item

  // Merge: only lines starting with "•" start new bullet; others continue previous
  const result: string[] = [];
  let current = "";
  for (const s of arr) {
    if (s.startsWith(BULLET + " ") || s.startsWith(BULLET)) {
      if (current) result.push(current);
      current = s.replace(new RegExp(`^${BULLET}\\s*`), "").trim();
    } else {
      if (current) current += "\n" + s;
      else current = s;
    }
  }
  if (current) result.push(current);
  return result;
}

/** If description has :: or Ο/○, use nested points; otherwise flat lines */
function descriptionToPoints(description: string): {
  points?: string[];
  nestedPoints?: NestedPoint[];
} {
  const trimmed = (description || "").trim();
  if (!trimmed) return { points: [] };

  const hasNestedMarkers =
    trimmed.includes("::") ||
    /[\u039F\u25CB]/.test(trimmed) ||
    trimmed.split("\n").some((l) => /^O\s/.test(l.trim()));

  if (hasNestedMarkers) {
    const nested = parseDescriptionBullets(trimmed);
    if (nested.length > 0) return { nestedPoints: nested };
  }

  // Only "•" at line start starts a new bullet; continuation lines merge into previous
  const BULLET = "\u2022"; // •
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
  return { points };
}

/** For bullet lists: if string, parse so only "•" = new bullet; if array, use as-is (one bullet per item) */
function toBulletPoints(value: string | string[] | null | undefined): string[] {
  if (value == null) return [];
  if (Array.isArray(value)) {
    return value
      .map((v) => (v ?? "").toString().trim())
      .filter((v) => v.length > 0 && v !== "[]");
  }
  const str = value.toString().trim();
  if (str === "[]" || !str) return [];
  return descriptionToPoints(str).points ?? [];
}

/** Award/publication item from API: can have name/date/issuer or title/year/publisher/organization/type */
type AwardPublicationRaw = {
  title?: string;
  name?: string;
  type?: "award" | "publication" | "engagement";
  year?: string;
  date?: string;
  publisher?: string;
  organization?: string;
  issuer?: string;
  description?: string;
};

/** Extract sort key (year number) from date/year string for reverse-chronological order (newest first) */
function awardPublicationSortKey(item: AwardPublicationRaw | string): number {
  if (item == null || typeof item === "string") return 0;
  const dateStr = (item.year ?? item.date ?? "").trim();
  if (!dateStr) return 0;
  const years = dateStr.match(/\b(19|20)\d{2}\b/g);
  if (!years || years.length === 0) return 0;
  return Math.max(...years.map((y) => parseInt(y, 10)));
}

/** Format one award/publication object (or string) into a single display line with all data */
function formatAwardPublicationLine(
  item: AwardPublicationRaw | string,
): string {
  if (item == null) return "";
  if (typeof item === "string") return item.trim();
  const title = (item.title ?? item.name ?? "").trim();
  const date = (item.year ?? item.date ?? "").trim();
  const issuer = (
    item.publisher ??
    item.organization ??
    item.issuer ??
    ""
  ).trim();
  const desc = (item.description ?? "").trim().replace(/\n+/g, " ");
  const meta = [date, issuer].filter(Boolean).join(", ");
  const main = meta ? `${title} (${meta})` : title;
  const line = desc ? (main ? `${main}. ${desc}` : desc) : main;
  return line.trim() || "";
}

/** Convert awards_publications (array of objects or strings) into SimpleCardItem[] grouped by type */
function awardsPublicationsToItems(
  raw: unknown,
): { heading: string; points: string[] }[] {
  if (!raw || !Array.isArray(raw) || raw.length === 0) {
    return [{ heading: "Auszeichnungen & Stipendien", points: ["N/A"] }];
  }
  // Sort newest to oldest (reverse chronological) by date/year
  const sorted = [...raw].sort((a, b) => {
    const keyA = awardPublicationSortKey(a as AwardPublicationRaw | string);
    const keyB = awardPublicationSortKey(b as AwardPublicationRaw | string);
    return keyB - keyA;
  });
  const linesByType: {
    publication: string[];
    award: string[];
    engagement: string[];
    other: string[];
  } = { publication: [], award: [], engagement: [], other: [] };
  for (const entry of sorted) {
    const line = formatAwardPublicationLine(
      entry as AwardPublicationRaw | string,
    );
    if (!line) continue;
    const type =
      typeof entry === "object" && entry !== null && "type" in entry
        ? (entry as AwardPublicationRaw).type
        : undefined;
    if (type === "publication") linesByType.publication.push(line);
    else if (type === "award") linesByType.award.push(line);
    else if (type === "engagement") linesByType.engagement.push(line);
    else linesByType.other.push(line);
  }
  const items: { heading: string; points: string[] }[] = [];
  if (linesByType.publication.length > 0) {
    items.push({
      heading: "Publications (Selected)",
      points: linesByType.publication,
    });
  }
  if (linesByType.award.length > 0) {
    items.push({
      heading: "Auszeichnungen & Stipendien",
      points: linesByType.award,
    });
  }
  if (linesByType.engagement.length > 0) {
    items.push({ heading: "Engagement", points: linesByType.engagement });
  }
  if (linesByType.other.length > 0) {
    if (items.length === 0) {
      items.push({
        heading: "Auszeichnungen & Stipendien",
        points: linesByType.other,
      });
    } else {
      items.push({ heading: "Other", points: linesByType.other });
    }
  }
  if (items.length === 0) {
    return [{ heading: "Auszeichnungen & Stipendien", points: ["N/A"] }];
  }
  return items;
}

/** Normalize null, undefined, or string "null" for UI display – show "N/A" instead */
function toDisplayVal(v: unknown): string {
  if (v == null) return "N/A";
  const s = String(v).trim();
  if (s === "" || s.toLowerCase() === "null") return "N/A";
  return s;
}

const BALANCE_THRESHOLD_PX = 150; // Move sections to right when left column is this much taller

const MainCV: React.FC<MainCVProps> = ({ candidate }) => {
  const displayName = toDisplayVal(candidate.name);
  const nameParts =
    displayName !== "N/A" ? displayName.split(/\s+/).filter(Boolean) : ["N/A"];
  const firstName = nameParts[0] ?? "N/A";
  const lastName = nameParts.slice(1).join(" ");
  const firstRef = useRef<HTMLHeadingElement>(null);
  const lastRef = useRef<HTMLHeadingElement>(null);
  // positionRef removed – position now wraps naturally
  const leftColRef = useRef<HTMLDivElement>(null);
  const rightColRef = useRef<HTMLDivElement>(null);
  const movableRef = useRef<HTMLDivElement>(null);
  const [firstFontSize, setFirstFontSize] = useState(80);
  const [lastFontSize, setLastFontSize] = useState(80);
  const [moveLastSectionsToRight, setMoveLastSectionsToRight] = useState(false);

  // Re-evaluate column balance when candidate changes
  React.useEffect(() => {
    setMoveLastSectionsToRight(false);
  }, [candidate.id]);

  const checkBalance = React.useCallback(() => {
    const leftEl = leftColRef.current;
    const rightEl = rightColRef.current;
    if (!leftEl || !rightEl) return;
    // Use scrollHeight (content height); grid may stretch both columns so we compare actual content
    const leftH = leftEl.scrollHeight;
    const rightH = rightEl.scrollHeight;
    if (!moveLastSectionsToRight && leftH - rightH > BALANCE_THRESHOLD_PX) {
      const movableH = movableRef.current?.scrollHeight || 0;
      const diffBefore = leftH - rightH;
      const diffAfter = (rightH + movableH) - (leftH - movableH);
      if (Math.abs(diffAfter) < Math.abs(diffBefore)) {
        setMoveLastSectionsToRight(true);
      }
    }
  }, [moveLastSectionsToRight]);

  useLayoutEffect(() => {
    checkBalance();
  }, [candidate, moveLastSectionsToRight, checkBalance]);

  // Re-check after layout/paint and when left column resizes (e.g. images loaded) so we don't miss imbalance
  React.useEffect(() => {
    const leftEl = leftColRef.current;
    if (!leftEl) return;
    const raf = requestAnimationFrame(() => checkBalance());
    const timeout = window.setTimeout(checkBalance, 150);
    const observer = new ResizeObserver(() => checkBalance());
    observer.observe(leftEl);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(timeout);
      observer.disconnect();
    };
  }, [candidate, checkBalance]);

  useLayoutEffect(() => {
    // Reset font sizes when name changes
    setFirstFontSize(80);
    setLastFontSize(80);
  }, [firstName, lastName]);

  useLayoutEffect(() => {
    if (firstRef.current && firstRef.current.scrollWidth > firstRef.current.clientWidth && firstFontSize > 40) {
      setFirstFontSize(prev => prev - 4);
    }
    if (lastRef.current && lastRef.current.scrollWidth > lastRef.current.clientWidth && lastFontSize > 40) {
      setLastFontSize(prev => prev - 4);
    }
  }, [firstFontSize, lastFontSize, firstName, lastName]);

  const formatDate = (dateStr: string | null) => {
    if (!dateStr || dateStr === "null") return "N/A";
    const date = new Date(dateStr);
    return date
      .toLocaleDateString("de-CH", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      })
      .replace(/\//g, ".");
  };

  const toLines = (value: string | string[] | null | undefined): string[] => {
    if (!value) return [];

    // Handle cases where backend stored an empty JSON array as a literal string "[]"
    if (!Array.isArray(value)) {
      const str = value.toString().trim();
      if (str === "[]" || str === "null") return [];

      return str
        .split("\n")
        .map((v) => v.trim())
        .filter((v) => v.length > 0 && v !== "null");
    }

    return value
      .map((v) => (v ?? "").toString().trim())
      .filter((v) => v.length > 0 && v !== "[]" && v !== "null");
  };

  const toLanguageArray = (
    langs: unknown,
  ): { name: string; level: string }[] => {
    if (!Array.isArray(langs) || langs.length === 0) return [];

    return langs
      .map((lang) => {
        if (!lang) return null;
        if (typeof lang === "string") {
          return { name: lang, level: "" };
        }
        const name = (lang.name ?? "").toString().trim();
        const level = (lang.level ?? "").toString().trim();
        if (!name && !level) return null;
        return { name, level };
      })
      .filter((v): v is { name: string; level: string } => !!v);
  };
  const candidateData = {
    location: toDisplayVal(candidate.location),
    willing_to_relocate: toDisplayVal(candidate.willing_to_relocate),
    max_commute: toDisplayVal(candidate.max_commute),
    birthdate: toDisplayVal(candidate.birthdate),
    driving_license: toDisplayVal(candidate.driving_license),
    license_type: toDisplayVal(
      (candidate as { license_type?: string | null }).license_type,
    ),
    current_salary: toDisplayVal(candidate.current_salary),
    desired_salary: toDisplayVal(
      (candidate as unknown as { desired_salary?: string | number | null })
        .desired_salary,
    ),
  };
  return (
    <div className="flex justify-center w-[794px] min-h-[1123px] bg-[#000000] border-b-[3px] border-[#00d992]">
      <div className="w-[794px] min-h-[1123px] bg-[#000000] text-white overflow-hidden flex flex-col ">
        {/* Header */}
        <div className="  relative flex items-start justify-between overflow-visible h-[280px]">
          {/* Background image - stretched to fill more width while maintaining visual appeal */}
          <img
            src="/new/Element_2.png"
            alt="Header background"
            className="absolute top-0 h-full w-[498px]"
          />
          {/* Dark gradient overlay so HeaderSideBg dissolves into black (works in PDF rendering too) */}
          <div
            className="absolute bottom-0 left-0 w-[498px] h-[140px] pointer-events-none"
            style={{
              background:
                "linear-gradient(to bottom, rgba(0,0,0,0) 0%, #000000 100%)",
              zIndex: 10,
            }}
          />

          <div
            className="relative z-20 ml-[49px] mt-[49px] h-[280px] w-[340px] max-w-[340px] overflow-hidden shrink-0 "
            title={`${toDisplayVal(candidate.name)}${toDisplayVal(candidate.position) !== "N/A" ? ` — ${toDisplayVal(candidate.position)}` : ""}`}
          >
            <h1
              ref={firstRef}
              style={{ fontSize: firstFontSize }}
              className="leading-none font-semibold font-inter min-w-0 whitespace-nowrap overflow-visible"
            >
              {firstName}
            </h1>
            <h1
              ref={lastRef}
              style={{ fontSize: lastFontSize }}
              className="-mt-2 font-semibold font-inter min-w-0 whitespace-nowrap overflow-visible"
            >
              {lastName}
            </h1>
            <p
              className="text-[18px] -mt-2 ml-1 uppercase tracking-wider text-neutral-400 min-w-0 break-words"
            >
              {toDisplayVal(candidate.position)}
            </p>
          </div>
          {/* Profile image on right: rounded top-left cut + teal blob bottom-right */}
          <div className=" z-20 relative left-1 -mt-[17px]">
            <div
              className="relative w-[378px] h-[420px] overflow-visible bg-neutral-800 mt-4"
              style={{
                borderRadius: "135px 0px 0px 138px",
              }}
            >
              <img
                src={candidate.avatar_url}
                alt={toDisplayVal(candidate.name)}
                className="absolute inset-0 w-full h-full object-cover object-center z-[1] "
                style={{
                  borderRadius: "135px 0px 0px 138px",
                }}
              />
              {/* Teal overlay using Asset 8 - higher z-index so it shows above photo and bg */}
              <img
                src={Asset8}
                alt=""
                className="absolute -bottom-12 -right-1 w-[85%] h-[146px] object-contain z-20 pointer-events-none"
              />
            </div>
          </div>
        </div>

        {/* MAIN CONTENT - each column min 309px; balance: move last left sections to right when left is much taller */}
        <div className=" flex-grow mt-10 grid grid-cols-2 gap-12 px-14 py-4">
          {/* LEFT COLUMN */}
          <div
            ref={leftColRef}
            className="space-y-6 overflow-hidden w-[309px] min-w-[309px] "
          >
            {(() => {
              const hasAny =
                (candidateData.location && candidateData.location !== "N/A") ||
                (candidateData.willing_to_relocate &&
                  candidateData.willing_to_relocate !== "N/A") ||
                (candidateData.max_commute &&
                  candidateData.max_commute !== "N/A") ||
                (candidateData.birthdate &&
                  candidateData.birthdate !== "N/A") ||
                candidateData.desired_salary !== "N/A" ||
                candidateData.current_salary !== "N/A";
              if (!hasAny) return null;
              return <PersonalInfoCard candidate={candidateData} />;
            })()}
            {/* Skillset - only show when there are skills */}
            {(() => {
              const list = Array.isArray(candidate.skills)
                ? candidate.skills.filter(
                  (s) =>
                    s != null &&
                    String(s).trim() !== "" &&
                    String(s).trim().toLowerCase() !== "null",
                )
                : [];
              if (list.length === 0) return null;
              return (
                <SimpleCardPlain
                  title="Skillset"
                  hideItemDivider
                  items={[
                    { heading: "", points: list, pointsStyle: "pills" },
                  ]}
                />
              );
            })()}

            {/* Languages – only show when there are languages */}
            {toLanguageArray(candidate.languages).length > 0 && (() => {
              // Levels in increasing order, low to high: A1 < A2 < B1 < B2 < C1 < C2 < M
              const levels = ["A1", "A2", "B1", "B2", "C1", "C2", "M"];
              const getLevelIndex = (level: string) => {
                const upper = (level || "").toUpperCase();
                const idx = levels.indexOf(upper);
                return idx === -1 ? -1 : idx;
              };
              // Sort: highest proficiency first (highest index in the array means "M"), "A1" is lowest.
              const sortedLanguages = [...toLanguageArray(candidate.languages)].sort((a, b) => {
                const aIdx = getLevelIndex(a.level);
                const bIdx = getLevelIndex(b.level);
                // Put unknowns at end
                if (aIdx === -1 && bIdx !== -1) return 1;
                if (aIdx !== -1 && bIdx === -1) return -1;
                if (aIdx === -1 && bIdx === -1) return 0;
                // Sort high-to-low: "M" (6) before "C2" (5) before ..., "A1" (0) last
                return bIdx - aIdx;
              });

              return (
                <div
                  className="relative rounded-xl p-4 shadow-lg overflow-hidden "
                  style={{
                    backgroundImage: 'url("/new/Element_3.png")',
                    backgroundSize: "104% 104%", 
                    backgroundPosition: "center",
                    backgroundRepeat: "no-repeat",
                    // This creates the green bottom border that follows the CSS curve
                    boxShadow: "inset 0 -2px 0 0 #00d992", 
                  }}
                >
                  <h3 className="text-lg font-semibold uppercase tracking-widest text-[#4ebe9d]">
                    Sprachen
                  </h3>

                  <div className="mt-3 space-y-1 mb-3">
                    {sortedLanguages.map((lang) => {
                      const levelUpper = (lang.level || "").toUpperCase();
                      return (
                        <div
                          key={lang.name}
                          className="flex items-center justify-between gap-2"
                        >
                          <span className="text-sm font-medium text-zinc-100 min-w-0 truncate">
                            {lang.name}
                          </span>
                          <div className="flex shrink-0 flex-nowrap gap-1 min-w-[200px] justify-end">
                            {levels.map((lvl) => {
                              const isActive = levelUpper === lvl;
                              return (
                                <span
                                  key={lvl}
                                  className={`inline-flex w-[25px] font-inter items-center justify-center py-[2px] rounded-full text-[9px] font-medium ${isActive
                                    ? "bg-[#58C594] text-black"
                                    : "bg-[#181819] text-zinc-300"
                                    }`}
                                >
                                  {lvl}
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Emerald underline accent, like other cards */}
                  {/* <div className="absolute left-0 mt-5 h-0.5 w-1/5 bg-[#58C594]" /> */}
                </div>
              );
            })()}

            {/* Awards / Publications – only show when there is real data (not just N/A) */}
            {(() => {
              const awardItems = awardsPublicationsToItems(
                candidate.awards_publications as unknown,
              );
              const isOnlyNa =
                awardItems.length === 1 &&
                awardItems[0].points.length === 1 &&
                awardItems[0].points[0] === "N/A";
              if (isOnlyNa) return null;
              return (
                <SimpleCardPlain
                  title="Auszeichnungen,
Publikationen & Engagement"
                  items={awardItems}
                />
              );
            })()}

            {/* Personal information – only show when at least one subsection has data */}
            {(() => {
              const growthPts = toBulletPoints(candidate.growth_potential);
              const proudPts = toBulletPoints(candidate.most_proud_of);
              if (growthPts.length === 0 && proudPts.length === 0) return null;
              return (
                <SimpleCardPlain
                  title="Persönliche Informationen"
                  hideItemDivider
                  items={[
                    ...(growthPts.length > 0
                      ? [
                        {
                          heading: "Wachstumspotenzial",
                          points: growthPts,
                        },
                      ]
                      : []),
                    ...(proudPts.length > 0
                      ? [
                        {
                          heading: "Worauf ich stolz bin",
                          points: proudPts,
                        },
                      ]
                      : []),
                  ]}
                />
              );
            })()}

            {/* Beckett Stone Insight Notes - only show when there are insight notes or values */}
            {(() => {
              const rawNotes = candidate.insights_notes ?? "";
              const notesStr =
                typeof rawNotes === "string"
                  ? rawNotes.replace(/\\n/g, "\n").trim()
                  : "";
              const isNullOrEmpty =
                !notesStr ||
                notesStr.toLowerCase() === "null" ||
                notesStr === "[]";
              const rawPoints = isNullOrEmpty ? [] : toBulletPoints(notesStr);
              const insightPoints = rawPoints.filter(
                (p) =>
                  p.trim() !== "" && p.trim().toLowerCase() !== "null",
              );
              const values = toLines(candidate.candidate_values);
              const hasInsightNotes = insightPoints.length > 0;
              const hasValues = values.length > 0;
              if (!hasInsightNotes && !hasValues) return null;
              return (
                <div
  className="relative rounded-xl py-4 px-5 overflow-hidden"
  style={{
    backgroundImage: 'url("/new/Element_7.png")',
    // We scale it slightly (102%) to push the image's own 
    // rounded corners outside the div's clipping area
    backgroundSize: "104% 104%", 
    backgroundPosition: "center",
    backgroundRepeat: "no-repeat",
    // This creates the green bottom border that follows the CSS curve
    boxShadow: "inset 0 -2px 0 0 #00d992", 

  }}
>
                  <h3 className="text-lg font-semibold uppercase tracking-widest text-[#4ebe9d]">
                    Beckett Stone Insights
                  </h3>

                  <h2 className="mt-1 text-sm  text-white">
                    Unsere Einschätzung des Kandidaten nach Vorauswahl und
                    Gesprächen
                  </h2>

                  <ul className="mt-2 space-y-0.5 text-[14px] leading-relaxed text-gray-400">
                    {(hasInsightNotes ? insightPoints : ["N/A"]).map(
                      (point, i) => (
                        <li
                          key={i}
                          className="relative pl-3 py-0.5 flex gap-2 break-words"
                        >
                          <span className="absolute left-0 top-[0.8rem] w-1 h-1 shrink-0 bg-[#838687]" />
                          <span className="min-w-0 break-words">{point}</span>
                        </li>
                      )
                    )}
                  </ul>

                  {hasValues && (
                    <p className="mt-2 text-xs leading-relaxed text-zinc-200">
                      Grundwerte:{" "}
                      {hasValues ? values.join(", ") : "N/A"}
                    </p>
                  )}
                </div>
              );
            })()}

            {/* Movable block: only on left when not balancing; otherwise rendered in right column */}
            {!moveLastSectionsToRight && (
              <div ref={movableRef}>
                {toBulletPoints(candidate.potential_risks).length > 0 && (
                  <SimpleCardPlain
                    title="Potenzielle Risiken und Annahmen"
                    hideItemDivider
                    items={[
                      {
                        heading: "",
                        points: toBulletPoints(candidate.potential_risks),
                      },
                    ]}
                  />
                )}
                <div
                  className="relative rounded-xl py-4 px-5 shadow-lg overflow-hidden"
                  style={{
                    backgroundImage: 'url("/new/Element_4.png")',

                    backgroundSize: "104% 104%", 
                    backgroundPosition: "center",
                    backgroundRepeat: "no-repeat",
                    // This creates the green bottom border that follows the CSS curve
                    boxShadow: "inset 0 -2px 0 0 #00d992", 
                  }}
                >
                  <h3 className="text-lg font-semibold uppercase tracking-widest text-[#4ebe9d]">
                    Premium Zertifizierung
                  </h3>

                  <h2 className="mt-1 text-sm  text-white">
                    Dieses Profil wurde von Beckett Stone professionell geprüft
                    und validiert.
                  </h2>

                  <p className="mt-2 text-sm leading-relaxed text-zinc-200">
                    Optionale Validierungen:
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                    Sprachbeurteilung - Referenzprüfung
                  </p>
                </div>
              </div>
            )}
            {/* Beckett Stone Seal of Quality */}
            {/* <BorderedCard
              title="Beckett Stone Seal of Quality"
              titleStyle="text-[#68ffbb]"
              subtitle=""
              description="This profile has been professionally screened and validated by Beckett Stone."
              becketDescription="optional validations"
              validations={
                toLines(candidate.candidate_values) || [
                  "Language assessment",
                  "Reference check",
                ]
              }
            /> */}
          </div>

          {/* RIGHT COLUMN - overflow-visible so multi-line titles (e.g. Further Education & Courses) are not clipped */}
          <div
            ref={rightColRef}
            className="space-y-6 overflow-visible mt-44 w-[309px] min-w-[309px] ml-2"
          >
            {toDisplayVal(candidate.summary) !== "N/A" &&
              String(candidate.summary ?? "").trim() !== "" && (
                <BorderedCard
                  title="Zusammenfassung"
                  titleStyle="text-white"
                  subtitleStyle="text-zinc-200"
                  descriptionStyle="text-zinc-400"
                  subtitle=""
                  description={toDisplayVal(candidate.summary)}
                  noBackground
                />
              )}

            {/* Signature Achievements – only show when there is content */}
            {normalizeBulletPoints(candidate.signature_achievements).length >
              0 && (
                <div className="relative top-5">
                  <SimpleCard
                    title="Bedeutende Erfolge"
                    titleStyle="text-white"
                    backgroundImage="/new/Element_9.png"
                    hideItemDivider
                    items={[
                      {
                        heading: "",
                        points: normalizeBulletPoints(
                          candidate.signature_achievements,
                        ),
                      },
                    ]}
                  />
                </div>
              )}
            {(() => {
              const parseDateKey = (d: string): number => {
                if (!d) return 0;
                const mySep = d.match(/^(\d{1,2})[.\/](\d{4})$/);
                if (mySep) return parseInt(mySep[2]) * 100 + parseInt(mySep[1]);
                const y = d.match(/(\d{4})/);
                if (y) return parseInt(y[1]) * 100;
                return 0;
              };
              const workItems = [...(candidate.work_experience || [])]
                .sort((a, b) => {
                  const expA = a as any;
                  const expB = b as any;
                  const endA = expA.endDate || expA.end_date || expA.end || "";
                  const endB = expB.endDate || expB.end_date || expB.end || "";
                  const isCurrentA = !endA || /heute|present|aktuell|today|laufend/i.test(endA);
                  const isCurrentB = !endB || /heute|present|aktuell|today|laufend/i.test(endB);
                  if (isCurrentA && !isCurrentB) return -1;
                  if (!isCurrentA && isCurrentB) return 1;
                  const endDiff = parseDateKey(endB) - parseDateKey(endA);
                  if (endDiff !== 0) return endDiff;
                  const startA = expA.startDate || expA.start_date || expA.start || "";
                  const startB = expB.startDate || expB.start_date || expB.start || "";
                  return parseDateKey(startB) - parseDateKey(startA);
                })
                .map((exp) => {
                  const { points, nestedPoints } = descriptionToPoints(
                    stripHtmlToPlainBullets(exp.description || ""),
                  );
                  const expAny = exp as {
                    startDate?: string;
                    endDate?: string;
                    start_date?: string;
                    end_date?: string;
                    start?: string;
                    end?: string;
                  };
                  const startDate = toDisplayVal(
                    expAny.startDate ?? expAny.start_date ?? expAny.start,
                  );
                  const endDate = toDisplayVal(
                    expAny.endDate ?? expAny.end_date ?? expAny.end,
                  );
                  const meta =
                    startDate !== "N/A" || endDate !== "N/A"
                      ? [startDate, endDate]
                        .filter((x) => x !== "N/A")
                        .join(" – ") || "N/A"
                      : "N/A";
                  return {
                    heading: toDisplayVal(exp.position),
                    titleStyle: "text-[#4ebe9d]",
                    subheading: toDisplayVal(exp.company),
                    meta,
                    location:
                      toDisplayVal(exp.location) !== "N/A"
                        ? toDisplayVal(exp.location)
                        : "",
                    ...(nestedPoints?.length
                      ? { nestedPoints }
                      : { points: points ?? [] }),
                  };
                })
                .filter((item) => {
                  const hasPoints =
                    ("points" in item && (item.points?.length ?? 0) > 0) ||
                    ("nestedPoints" in item &&
                      (item.nestedPoints?.length ?? 0) > 0);
                  return (
                    (item.heading && item.heading !== "N/A") ||
                    (item.subheading && item.subheading !== "N/A") ||
                    (item.meta && item.meta !== "N/A") ||
                    hasPoints
                  );
                });
              if (workItems.length === 0) return null;
              return (
                <div className="relative top-5 ">
                  <SimpleCardPlain
                    title="Berufserfahrung"
                    titleStyle=" text-[#4ebe9d]"
                    subtitleStyle="text-zinc-200"
                    descriptionStyle="text-zinc-400"
                    items={workItems}
                  />
                </div>
              );
            })()}
            {(() => {
              const parseDateKey = (d: string): number => {
                if (!d) return 0;
                const mySep = d.match(/^(\d{1,2})[.\/](\d{4})$/);
                if (mySep) return parseInt(mySep[2]) * 100 + parseInt(mySep[1]);
                const y = d.match(/(\d{4})/);
                if (y) return parseInt(y[1]) * 100;
                return 0;
              };
              const eduItems = (candidate.education || [])
                .map((edu) => {
                  const { points: gradePoints } = descriptionToPoints(
                    stripHtmlToPlainBullets((edu as { grade?: string }).grade || ""),
                  );
                  const eduAny = edu as {
                    startDate?: string;
                    endDate?: string;
                    start_date?: string;
                    end_date?: string;
                    start?: string;
                    end?: string;
                  };
                  const startDate = toDisplayVal(
                    eduAny.startDate ?? eduAny.start_date ?? eduAny.start,
                  );
                  const endDate = toDisplayVal(
                    eduAny.endDate ?? eduAny.end_date ?? eduAny.end,
                  );
                  const meta =
                    startDate !== "N/A" || endDate !== "N/A"
                      ? [startDate, endDate]
                        .filter((x) => x !== "N/A")
                        .join(" – ") || ""
                      : "";
                  return {
                    heading: toDisplayVal(edu.degree),
                    subheading: toDisplayVal(edu.institution),
                    meta,
                    location:
                      toDisplayVal(edu.location) !== "N/A"
                        ? toDisplayVal(edu.location)
                        : "",
                    points:
                      gradePoints && gradePoints.length > 0
                        ? gradePoints
                        : [],
                  };
                })
                .filter(
                  (item) =>
                    (item.heading && item.heading !== "N/A") ||
                    (item.subheading && item.subheading !== "N/A") ||
                    (item.meta && item.meta !== "N/A") ||
                    (item.points?.length ?? 0) > 0,
                )
                .sort((a, b) => {
                  const extractEnd = (meta: string) => {
                    const parts = meta.split("–").map(s => s.trim());
                    return parts.length > 1 ? parts[1] : parts[0];
                  };
                  const endA = extractEnd(a.meta || "");
                  const endB = extractEnd(b.meta || "");
                  const isCurrentA = !endA || /heute|present|aktuell|today|laufend/i.test(endA);
                  const isCurrentB = !endB || /heute|present|aktuell|today|laufend/i.test(endB);
                  if (isCurrentA && !isCurrentB) return -1;
                  if (!isCurrentA && isCurrentB) return 1;
                  return parseDateKey(endB) - parseDateKey(endA);
                });
              if (eduItems.length === 0) return null;
              return (
                <div className="relative top-5 ">
                  <SimpleCard
                    title="Ausbildung"
                    backgroundImage="/new/Element_6.png"
                    items={eduItems}

                  />
                </div>
              );
            })()}
            {/* Further education – only show when there is at least one item with content */}
            {(() => {
              const parseDateKey = (d: string): number => {
                if (!d) return 0;
                const mySep = d.match(/^(\d{1,2})[.\/](\d{4})$/);
                if (mySep) return parseInt(mySep[2]) * 100 + parseInt(mySep[1]);
                const y = d.match(/(\d{4})/);
                if (y) return parseInt(y[1]) * 100;
                return 0;
              };
              const hasItems =
                candidate.further_education &&
                candidate.further_education.length > 0;
              if (!hasItems) return null;
              const items = candidate.further_education!.map((item) => {
                const { points: descPoints } = descriptionToPoints(
                  stripHtmlToPlainBullets(item.description || ""),
                );
                return {
                  heading: toDisplayVal(item.name),
                  subheading: toDisplayVal(item.institution),
                  meta: toDisplayVal(item.date),
                  points:
                    descPoints && descPoints.length > 0
                      ? descPoints
                      : undefined,
                };
              }).sort((a, b) => {
                return parseDateKey(b.meta || "") - parseDateKey(a.meta || "");
              });
              const hasAnyContent = items.some(
                (it) =>
                  (it.heading && it.heading !== "N/A") ||
                  (it.subheading && it.subheading !== "N/A") ||
                  (it.meta && it.meta !== "N/A") ||
                  (it.points && it.points.length > 0),
              );
              if (!hasAnyContent) return null;
              return (
                <div className="relative top-10 ">
                  <SimpleCard
                    title="Weiterbildungen & Zertifikate"
                    backgroundImage="/new/Element_6.png"
                    items={items}
                  />
                </div>
              );
            })()}

            {/* When left column is much taller, show these at bottom of right – same spacing as other right-column sections */}
            {moveLastSectionsToRight && (
              <>
                {toBulletPoints(candidate.potential_risks).length > 0 && (
                  <div className="relative top-12">
                    <SimpleCardPlain
                      title="Potenzielle Risiken und Annahmen"
                      hideItemDivider
                      items={[
                        {
                          heading: "",
                          points: toBulletPoints(candidate.potential_risks),
                        },
                      ]}
                    />
                  </div>
                )}
                <div className="relative top-10">
                  <div
                    className="relative rounded-xl border-b-2 border-[#00d992] p-4 shadow-lg overflow-hidden"
                    style={{
                      backgroundImage: 'url("/new/Element_9.png")',
                      backgroundSize: "cover",
                      backgroundPosition: "center",
                    }}
                  >
                    <h3 className="text-lg font-semibold uppercase tracking-widest text-[#4ebe9d]">
                      Premium Zertifizierung
                    </h3>

                    <h2 className="mt-1 text-sm  text-white">
                      Dieses Profil wurde von Beckett Stone professionell
                      geprüft und validiert.
                    </h2>

                    <p className="mt-2 text-sm leading-relaxed text-zinc-200">
                      Optionale Validierungen:
                    </p>
                    <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                      Sprachbeurteilung - Referenzprüfung
                    </p>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* FOOTER */}
        <div className="mt-auto flex items-end justify-between px-[57px] py-[27px]">
          {/* Logo */}
          <div className="flex items-center  mb-4">
            <img
              src={Whitelogo}
              alt="Company Logo"
              className="h-[124px] w-[184px] object-cover"
            />
          </div>

          {/* Website */}
          <div className="text-right mb-4">
            <p className="text-xs text-zinc-300 font-medium font-inter">
              beckettstone.ch
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MainCV;
