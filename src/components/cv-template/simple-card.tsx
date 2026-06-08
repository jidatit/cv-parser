import React from "react";

/** Strip leading "• " or "•" from backend text so only the template bullet is shown */
function stripLeadingBullet(text: string): string {
  if (!text || typeof text !== "string") return text;
  const t = text.trim();
  const bullet = "\u2022"; // •
  if (t.startsWith(bullet + " ") || t.startsWith(bullet)) {
    return t.replace(new RegExp(`^${bullet}\\s*`), "").trim();
  }
  return text;
}

/** For CV display: strip bullet and replace Gemini's \n with space so text wraps naturally by width (no awkward single-word lines) */
function toDisplayText(text: string): string {
  const stripped = stripLeadingBullet(text);
  return stripped.replace(/&nbsp;/g, " ").replace(/\u00A0/g, " ").replace(/\n+/g, " ").trim();
}

/** Level 0 = main bullet (•), 1 = sub (::), 2 = sub-sub (Ο/○) */
export type NestedPoint = { level: number; text: string };

export type SimpleCardItem = {
  heading: string;
  subheading?: string;
  meta?: string;
  points?: string[];
  /** When set, rendered as nested bullets (•, ::, Ο) instead of flat points */
  nestedPoints?: NestedPoint[];
  pointsStyle?: "list" | "pills";
  subtitle?: string;
  description?: string;
  salary?: string;
  titleStyle?: string;
  subtitleStyle?: string;
  descriptionStyle?: string;
  /** Optional location line under meta (for CV cards that include city) */
  location?: string;
};

export type SimpleCardProps = {
  title?: string;
  items?: SimpleCardItem[];
  titleStyle?: string;
  subtitleStyle?: string;
  descriptionStyle?: string;
  /** Optional Tailwind classes for item heading (e.g. make position heading green in SimpleCardPlain) */
  itemHeadingClassName?: string;
  /** Public path to background image (e.g. "/languages.png"); replaces gradient when set */
  backgroundImage?: string;
  /** When true, hide the green bottom border and per-item divider lines */
  hideItemDivider?: boolean;
};

// Fancy bordered card (emerald gradient or bg image), used for sections that should match Beckett Stone style
export const SimpleCard = ({
  title,
  items,
  titleStyle,
  subtitleStyle,
  descriptionStyle,
  backgroundImage,
  hideItemDivider,
}: SimpleCardProps) => {
  return (
    <div
      className={`relative rounded-xl p-4 overflow-hidden`}
      style={
        backgroundImage
          ? {
            backgroundImage: `url("${backgroundImage}")`,
            backgroundSize: "104% 104%", 
            backgroundPosition: "center",
            backgroundRepeat: "no-repeat",
            // This creates the green bottom border that follows the CSS curve
            boxShadow: "inset 0 -2px 0 0 #00d992", 
          }
          : {
            background:
              "linear-gradient(to right, #1C2D2C 10%, #090C0C 50%, #090C0C 50%, #1C2D2C 100%)",
          }
      }
    >
      {/* <div className="absolute inset-0 -z-10 rounded-xl bg-[#00d992]/10 blur-xl" /> */}

      <h3
        className={`text-lg font-semibold uppercase text-[#4ebe9d] tracking-widest min-h-[2.75rem] leading-snug ${titleStyle}`}
      >
        {title}
      </h3>

      <div className="mt-2 space-y-4">
        {items.map((item, idx) => (
          <div key={idx} className="relative pb-5">
            {/* content - only show heading when present to avoid double N/A */}
            <div className="flex flex-col flex-wrap items-baseline justify-between gap-x-3">
              {item.heading && (
                <h4 className="text-sm font-semibold text-white">
                  {item.heading}
                </h4>
              )}

              {item.subtitle && (
                <h4 className="text-xs font-semibold">
                  {item.subtitle || "N/A"}
                </h4>
              )}
            </div>

            {item.subheading && (
              <p className="mt-1 text-xs font-medium text-zinc-200">
                {item.subheading}
              </p>
            )}
            {item.meta && (
              <span className="text-[12px] text-white">
                {item.meta || "N/A"}
              </span>
            )}
            {item.location && (
              <p className="text-[12px] text-white">
                {item.location}
              </p>
            )}
            {(() => {
              const rawPoints = item.points || [];
              const points = rawPoints
                .map((p) => (p ?? "").toString().trim())
                .filter((p) => p.length > 0);

              if (points.length === 0) {
                return (
                  <p className="mt-1.5 text-xs leading-relaxed text-[#838687] italic">

                  </p>
                );
              }

              if (item.pointsStyle === "pills") {
                return (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {points.map((point, i) => (
                      <span
                        key={i}
                        className="rounded-md bg-neutral-900 px-2 py-0.5 text-[12px] text-zinc-300"
                      >
                        {toDisplayText(point)}
                      </span>
                    ))}
                  </div>
                );
              }

              return (
                <ul className="mt-1.5 space-y-0.5 text-[13px] leading-relaxed text-[#838687]">
                  {points.map((point, i) => (
                    <li
                      key={i}
                      className="relative rounded-md pl-3 py-0.5 break-words"
                    >
                      <span className="absolute left-0 top-[0.7rem] h-1 w-1 bg-[#838687]" />
                      {toDisplayText(point)}
                    </li>
                  ))}
                </ul>
              );
            })()}

            {item.salary && (
              <p className="mt-1.5 text-xs font-medium text-zinc-200">
                Salary: {item.salary}
              </p>
            )}
            {!hideItemDivider && (
              <div className="absolute bottom-0 left-0 h-[0.5px] w-1/5 bg-[#00d992]" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

// Plainer card without strong emerald frame, used for skillset, experience, etc.
export const SimpleCardPlain = ({
  title,
  items,
  titleStyle,
  subtitleStyle,
  descriptionStyle,
  backgroundImage,
  hideItemDivider,
}: SimpleCardProps) => {
  return (
    <div
      className="relative rounded-xl w-full overflow-hidden"
      style={
        backgroundImage
          ? {
            backgroundImage: `url("${backgroundImage}")`,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }
          : undefined
      }
    >
      <h3
        className={`text-lg font-semibold uppercase tracking-widest ${titleStyle} text-[#4ebe9d]`}
      >
        {title}
      </h3>

      <div className="mt-3 space-y-3">
        {items.map((item, idx) => (
          <div key={idx} className="relative pb-5">
            {item.heading && (
              <h4
                className={`text-[13px] font-semibold mb-1 ${item.titleStyle ?? "text-white"
                  }`}
              >
                {item.heading}
              </h4>
            )}
            {item.subheading && (
              <p className="mt-0.5 text-xs font-medium text-zinc-300 mb-1">
                {item.subheading}
              </p>
            )}
            {item.meta && (
              <p className="text-[12px] text-white ">{item.meta}</p>
            )}

            {item.location && (
              <p className="text-[12px] text-white mb-1">{item.location}</p>
            )}

            {(() => {
              const nested = item.nestedPoints?.length
                ? item.nestedPoints
                : null;

              if (nested && nested.length > 0) {
                return (
                  <ul className="mt-1.5 space-y-0.5 text-[13px] leading-relaxed text-[#838687] list-none">
                    {nested.map((np, i) => (
                      <li
                        key={i}
                        className="relative py-0.5 flex gap-1.5 list-disc"
                        style={{
                          paddingLeft:
                            np.level === 0
                              ? "0.75rem"
                              : np.level === 1
                                ? "1.5rem"
                                : "2.25rem",
                        }}
                      >
                        {np.level === 0 && (
                          <span className="absolute left-0 top-[0.7rem] h-1 w-1 rounded-full bg-[#838687] shrink-0" />
                        )}
                        {np.level === 1 && (
                          <span className="absolute left-[0.6rem] top-[0.7rem] w-1.5 text-[#4ebe9d]/90 shrink-0">
                            :
                          </span>
                        )}
                        {np.level === 2 && (
                          <span className="absolute left-[1.35rem] top-[0.7rem] h-1.5 w-1.5 rounded-full border border-[#838687]/70 shrink-0" />
                        )}
                        <span className="text-[13px]">
                          {toDisplayText(np.text)}
                        </span>
                      </li>
                    ))}
                  </ul>
                );
              }

              const rawPoints = item.points || [];
              const points = rawPoints
                .map((p) => (p ?? "").toString().trim())
                .filter((p) => p.length > 0);

              if (points.length === 0) {
                return (
                  <p className="mt-1.5 text-xs leading-relaxed text-zinc-500 italic">

                  </p>
                );
              }

              if (item.pointsStyle === "pills") {
                return (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {points.map((point, i) => (
                      <span
                        key={i}
                        className="rounded-md bg-[#1a1818] px-2 py-0.5 text-[15px] font-inter text-white"
                      >
                        {toDisplayText(point)}
                      </span>
                    ))}
                  </div>
                );
              }

              return (
                <ul className="mt-1.5 space-y-0.5 text-[13px] leading-relaxed text-zinc-500">
                  {points.map((point, i) => (
                    <li key={i} className="relative pl-3 py-0.5 break-words">
                      <span className="absolute left-0 top-[0.7rem] h-1 w-1 bg-[#838687]" />
                      {toDisplayText(point)}
                    </li>
                  ))}
                </ul>
              );
            })()}
            {!hideItemDivider && (
              <div className="absolute bottom-0 left-0 h-[0.5px] w-1/5 bg-[#00d992]" />
            )}

            {item.salary && (
              <p className="mt-1.5 text-xs font-medium text-zinc-200">
                Salary: {item.salary}
              </p>
            )}

            {/* Subtle bottom divider after each item */}
          </div>
        ))}
      </div>
    </div>
  );
};
