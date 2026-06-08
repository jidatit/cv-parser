import React, { useEffect } from "react";
const Background = "/Element%202.png";
const Logo = "/bs-logo-white.png";
const BottomLogo = "/hdtry.png";

export interface IntroContactInfo {
  label: string;
  name: string;
  email: string;
  phone?: string;
  website?: string;
}

export interface IntroPageProps {
  year: string;
  title: string;
  subtitle: string;
  presentedBy: IntroContactInfo;
  company: IntroContactInfo;
}

const PAGE_SPACING = 56; // equal x and y spacing (px)

const IntroPage: React.FC<IntroPageProps> = ({
  year,
  title,
  subtitle,
  presentedBy,
  company,
}) => {
  useEffect(() => {
    const img = new Image();
    img.src = Background;
  }, []);

  return (
    <div
      className="relative w-[793px] h-[1122px] overflow-hidden mx-auto"
      style={{
        backgroundImage: `url(${Background})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        padding: `${PAGE_SPACING}px`,
      }}
    >
      <div className="relative flex w-full justify-between items-start">
        <div className="z-10 ">
          <img
            src={Logo}
            alt="Logo"
            className="w-[184px] h-[124px] object-contain -ml-0.5"
          />
        </div>{" "}
        {/* Right side: presenter (Vorgelegt von) + company (Unternehmen) */}
        <div className="text-right text-gray-500 text-sm z-10">
          <p className="font-inter font-[300] text-[14px] mb-0.5">
            Vorbereitet von
          </p>
          <p className="text-gray-200 font-inter text-[14px] mb-0.5">
            {presentedBy.name}
          </p>
          {presentedBy.email && (
            <p className="font-inter font-[300] text-[14px] mb-0.5">
              {presentedBy.email}
            </p>
          )}
          {presentedBy.phone && (
            <p className="text-[14px] font-[300] font-inter mb-2">
              {presentedBy.phone}
            </p>
          )}
          <div className="mt-4 flex justify-end">
            <div className="w-[26px] min-h-0.5 bg-[#00d992]"></div>
          </div>
          {/* <p className="mt-4 text-[14px] font-[300] font-inter mb-0.5">
            Unternehmen
          </p> */}
          <p className="text-gray-200 font-inter text-[14px] mt-3.5 mb-0.5">
            {company.name}
          </p>
          {company.email && (
            <p className="text-[14px] font-[300] font-inter mb-0.5">
              {company.email}
            </p>
          )}
          {company.phone && (
            <p className="text-[14px] font-[300] font-inter mb-0.5">
              {company.phone}
            </p>
          )}
        </div>
      </div>

      <div className="absolute h-[152px] top-1/3 mt-32 z-10 flex ">
        {/* Vertical line */}
        <div className="w-[2px] bg-gray-300 flex-shrink-0" />

        {/* Text block: full height so year=top, title=middle, subtitle=bottom */}
        <div className="flex flex-col h-full pl-2 flex-1 min-w-0">
          <p className="text-gray-300 text-[12px] -mt-[4.5px] text-sm font-inter font-[400] tracking-wide flex-shrink-0">
            {year}
          </p>

          <div className="flex-1 flex items-center min-h-0">
            <h1 className="text-white text-[66px] font-inter font-[700] tracking-tight">
              {title}
            </h1>
          </div>

          <p className="text-gray-200 text-[16px] font-inter font-[400] tracking-wide flex-shrink-0 relative top-[5.5px]">
            Für {subtitle}
          </p>
        </div>
      </div>

      <div
        className="absolute bottom-0 left-[55px] right-[55px] flex items-end justify-between "
        style={{ marginBottom: PAGE_SPACING }}
      >
        <img
          src={BottomLogo}
          alt={company.name}
          className=" object-cover w-[388px] relative -bottom-[15px] -ml-[7px] "
        />

        {company.website && (
          <p className="text-gray-300 text-[14px] font-inter -mb-[4px]">
            {company.website}
          </p>
        )}
      </div>
    </div>
  );
};

export default IntroPage;
