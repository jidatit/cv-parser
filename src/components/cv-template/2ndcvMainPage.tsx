import React, { useEffect } from "react";
import { hyphenateGerman } from "@/lib/germanHyphenation";
const HeaderImage = "/Element%201.png";
const Blacklogo = "/bs-logo-black.png";
const Whitelogo = "/bs-logo-white.png";
const BottomLogo = "/hdtry.png";
const Asset3 = "/Element%204.png";
const Asset5 = "/Element%203.png";

interface PersonalInfo {
  name: string;
  surname: string;
  position: string;
  date: string;
}

interface CompanyInfo {
  name: string;
  location: string;
  logoUrl?: string | null;
  description?: string;
}

interface ImportantInfo {
  location: string;
  employment: string;
  capacity: string;
}

interface ProfileSection {
  title: string;
  paragraphs: string[];
}

export interface CVData {
  personal: PersonalInfo;
  company: CompanyInfo;
  importantInfo: ImportantInfo;
  profile: ProfileSection;
  responsibilities: {
    title: string;
    items: { text: string }[];
  };
  benefits: {
    title: string;
    items: { text: string }[];
  };
}

interface CvTemplateProps {
  data: CVData;
}
const cleanBulletText = (text: string): string => {
  return text.replace(/^[•\-*]\s*/, "").trim();
};
const CvTemplate: React.FC<CvTemplateProps> = ({ data }) => {
  useEffect(() => {
    [Asset3, Asset5].forEach((src) => {
      const img = new Image();
      img.src = src;
    });
  }, []);

  console.log("data", data);
  return (
    <div className="mx-auto w-[793px] min-w-[793px] max-w-[793px] min-h-[1122px] font-sans relative  box-border bg-none">
      {/* Header - Increased bleed to fully cover edges */}
      <header
        className="relative h-[320px] w-full"
        style={{
          width: "793px",
          overflow: "hidden",
        }}
      >
        <img
          src={HeaderImage}
          alt="Header"
          className="block h-full w-full"
          style={{
            objectFit: "cover",
            objectPosition: "center top",
            width: "100%",
            height: "100%",
          }}
        />

        <div
          className="absolute inset-0 flex justify-between items-start ml-[11px]"
          style={{ padding: "56px" }}
        >
          <img
            src={BottomLogo}
            alt={data.company.name}
            style={{
              objectFit: "cover",
              width: "311px",
              height: "35px",
              marginLeft: "-16px", // -ml-4 equivalent
              marginTop: "-12px", // -mt-3 equivalent
            }}
          />

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-end",
              justifyContent: "space-between",
              height: "100%",
            }}
          >
            <img
              src={Whitelogo}
              alt="Logo"
              style={{
                height: "91px",
                objectFit: "contain",
                width: "135px",
                marginTop: "-12px", // -mt-3 equivalent
              }}
            />
            <h2
              style={{
                color: "white",
                fontSize: "16px",
                position: "relative",
                top: "20px", // top-5 equivalent
                lineHeight: "19px",
                fontFamily: "Inter, sans-serif",
                fontWeight: 400,
                letterSpacing: "0.025em",
                marginTop: "auto",
                maxWidth: "140px",
                textAlign: "right",
                wordBreak: "break-word",
              }}
            >
              Bei {hyphenateGerman(data.company.name)}
            </h2>
          </div>
        </div>
      </header>
      {/* Main content area with full width background */}
      <div className="bg-white w-[99.4%] ml-[0.3%] ">
        {/* Personal Card - positioned below header, grows downward */}
        <div className="px-[56px] relative" style={{ marginTop: "-154px" }}>
          <div className="w-[488px] bg-[#E6E7E5] shadow-lg p-5 rounded-[7px] min-h-[217px]">
            <p className="text-[12px] text-black font-inter font-semibold mb-1 break-words">
              {data.personal.date}
            </p>
            <div className="h-0.5 w-10 bg-black font-semibold mb-1 break-words" />
            <h1 className="text-[40px] text-[#020407] font-inter font-[600] leading-tight" style={{ hyphens: 'manual', WebkitHyphens: 'manual', overflowWrap: 'break-word', wordBreak: 'normal' }}>
              {hyphenateGerman(data.personal.position)}
            </h1>
          </div>
        </div>

        {/* Content */}
        <main className="pl-[56px] pr-[56px] pb-10 pt-6 min-h-[714px] flex w-full">
          <div className="grid grid-cols-[315px_1fr] gap-[54px] min-h-[714px] w-full">
            {/* Left column */}
            <section className="flex flex-col gap-6 min-w-0">
              {/* Profile */}
              <div className="mt-4 border-t-2 border-neutral-700 overflow-hidden min-w-0 w-[311px] ">
                <h3 className="text-[16px] font-[700] font-inter text-black mb-2 uppercase leading-[16px] break-words mt-4">
                  {data.profile.title}
                </h3>
                <div className="w-12 h-0.5 bg-[#00d992] mb-3"></div>
                <div className="overflow-hidden min-w-0 w-[311px]">
                  {(data.company.description || (data.profile.paragraphs && data.profile.paragraphs.length > 0 && data.profile.paragraphs[0] !== "Keine Unternehmensbeschreibung verfügbar.")) ? (
                    (data.company.description
                      ? [data.company.description]
                      : data.profile.paragraphs
                    ).map((paragraph, idx) => (
                      <p key={idx} className="text-[12px] text-black leading-relaxed mb-2 break-words font-inter overflow-hidden">
                        {paragraph}
                      </p>
                    ))
                  ) : (
                    <p className="text-[12px] text-black leading-relaxed mb-2 break-words font-inter overflow-hidden">
                      {""}
                    </p>
                  )}
                </div>
              </div>

              {/* Responsibilities box */}
              <div
                className="text-white rounded-lg mt-auto p-4 w-[311px] "
                style={{
                  backgroundImage: `url(${Asset3})`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                }}
              >
                <h3 className="text-[16px] font-inter font-bold mb-2 uppercase break-words">
                  VERANTWORTLICHKEITEN
                </h3>
                <div className="w-12 h-0.5 bg-[#00d992] mb-3"></div>
                {/* Limit inner list height so vertical scrollbar appears when content is long */}
                <ul className="space-y-1 overflow-y-auto overflow-x-hidden min-w-0 pr-1">
                  {data.responsibilities.items.map((item, i) => (
                    <li
                      key={i}
                      className="flex items-baseline gap-2 leading-relaxed font-inter"
                    >
                      <span className="text-[12px] leading-none">•</span>
                      <span className="break-words flex-1 text-[12px] ">
                        {item.text}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </section>

            {/* Right column */}
            <section className="flex flex-col min-w-0 w-[311px] h-full">
              {/* TOP — WICHTIGE INFOS */}
              <div className="flex justify-end mt-[15px]">
                <div
                  className="w-[311px] text-white rounded-lg shadow-lg p-5"
                  style={{
                    backgroundImage: `url(${Asset5})`,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                  }}
                >
                  <h3 className="text-[16px] font-inter font-bold tracking-wider mb-3 uppercase">
                    WICHTIGE INFOS
                  </h3>
                  <div className="text-[13px] leading-6 font-inter">
                    <p>{data.importantInfo.location}</p>
                    <p>{data.importantInfo.employment}</p>
                    {data.importantInfo.capacity && (
                      <p>{data.importantInfo.capacity}</p>
                    )}
                  </div>
                </div>
              </div>

              {/* SPACER */}
              <div className="flex-1" />

              {/* CENTER — LOGO */}
              <div className="flex justify-center items-center py-4 pointer-events-none">
                <img
                  src={data.company.logoUrl || Blacklogo}
                  alt={data.company.name || "Company Logo"}
                  className="w-[237px] h-[160px] object-contain"
                  onError={(e) => {
                    e.currentTarget.src = Blacklogo;
                  }}
                />
              </div>

              {/* SPACER */}
              <div className="flex-1" />

              {/* BOTTOM — BENEFITS */}
              {data.benefits.items && data.benefits.items.length > 0 && (
                <div className="flex justify-end">
                  <div className="pr-4 w-[311px]">
                    <h3 className="text-[16px] font-bold mb-2 uppercase text-black font-inter">
                      {data.benefits.title}
                    </h3>
                    <div className="w-12 h-0.5 bg-[#00d992] mb-3"></div>
                    {/* Changed from <ul> with list-disc to manual bullets for consistency */}
                    <div className="space-y-1">
                      {data.benefits.items.map((item, i) => (
                        <div
                          key={i}
                          className="flex items-baseline gap-2 text-[12px] leading-relaxed text-black font-inter"
                        >
                          <span className="flex-shrink-0">•</span>
                          <span className="break-words flex-1">
                            {cleanBulletText(item.text)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </section>
          </div>
        </main>
      </div>
    </div>
  );
};

export default CvTemplate;
