import React from "react";

const formatSalary = (value: string): string => {
  if (!value || value === "N/A") return "N/A";
  if (value.toUpperCase().includes("CHF")) return value;
  const formatted = value.replace(/\d+/g, (num) =>
    Number(num).toLocaleString("de-CH")
  );
  return `${formatted} CHF`;
};

const PersonalInfoCard = ({ candidate }) => {
  return (
    <div className="relative w-full max-w-md font-inter">
      <div
        className="relative rounded-xl p-4 shadow-lg overflow-hidden"
        style={{
          backgroundImage: 'url("/Element 3C.png")',
          backgroundSize: "104% 104%", 
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
          // This creates the green bottom border that follows the CSS curve
          boxShadow: "inset 0 -2px 0 0 #00d992", 
        }}
      >
        {/* Card content - always show all rows; display value or N/A */}
        <div className="relative z-10 p-2  space-y-4">
          <div className="space-y-3">
            <div className="flex gap-3">
              <span className="text-white text-sm font-[300] ">Adresse:</span>
              <span className="text-neutral-400 text-sm font-[300]">
                {candidate.location}
              </span>
            </div>

            <div className="flex items-start gap-3">
              <span className="text-white text-sm font-[300] ">
                Umzugsbereitschaft:
              </span>
              <span className="text-neutral-400 text-sm font-[300]">
                {candidate.willing_to_relocate}
              </span>
            </div>

            <div className="flex items-start gap-3">
              <span className="text-white text-sm font-[300] ">
                Bevorzugter Arbeitsweg:
              </span>
              <span className="text-neutral-400 text-sm font-[300]">
{candidate.max_commute === "N/A"
                  ? "N/A"
                  : candidate.max_commute.toString().toLowerCase().includes("min")
                    ? candidate.max_commute
                    : `${candidate.max_commute} min`}
              </span>
            </div>

            <div className="flex items-start gap-3">
              <span className="text-white text-sm font-[300] ">
                Geburtsdatum:
              </span>
              <span className="text-neutral-400 text-sm font-[300]">
                {candidate.birthdate}
              </span>
            </div>
          </div>

          {/* Salary Section - only show when salary data exists */}
          {(candidate.desired_salary !== "N/A" || candidate.current_salary !== "N/A") && (
            <>
              <div className="border-t border-neutral-700 my-4" />
              <div className="space-y-1">
                <div className="text-white text-xs font-[300] uppercase tracking-wider">
                  Salär
                </div>
                <div className="text-neutral-200 text-base font-semibold">
                  {candidate.desired_salary !== "N/A"
                    ? formatSalary(candidate.desired_salary)
                    : formatSalary(candidate.current_salary)}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Bottom emerald accent line */}
      </div>
    </div>
  );
};
export default PersonalInfoCard;
