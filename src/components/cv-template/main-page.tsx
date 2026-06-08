import React, { useState, useEffect } from "react";

const CompanyName = "/cvFirst.png";
import { Candidate } from "../types/cv-types";
import { supabase } from "@/integrations/supabase/client";
const Logo = "/bs-logo-white.png";
interface MainPageProps {
  candidate: Candidate;
  /** When true, render only the A4 card (no centering wrapper). Use in print/PDF view. */
  forPrint?: boolean;
}

const MainPage: React.FC<MainPageProps> = ({ candidate, forPrint = false }) => {
  const [companyData, setCompanyData] = useState({
    name: "Beckett Stone",
    email: "info@beckettstone.ch",
    phone: "+41 78 801 83 04",
    website: "beckettstone.ch",
  });

  const [recruiterData, setRecruiterData] = useState({
    name: "",
    email: "",
    phone: "",
  });

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadUserAndCompanyData = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          setLoading(false);
          return;
        }

        // Load user profile data (recruiter info)
        const { data: profileData } = await supabase
          .from("profiles")
          .select("first_name, last_name, email, phone")
          .eq("id", user.id)
          .single();

        if (profileData) {
          const fullName =
            `${profileData.first_name || ""} ${profileData.last_name || ""}`.trim();
          const phone = (profileData as { phone?: string }).phone || "";
          setRecruiterData({
            name: fullName || "",
            email: profileData.email || "",
            phone: phone,
          });
        }

        // Load company data from status_configurations
        // If not found, defaults will be used
        try {
          const { data: companyConfig } = await supabase
            .from("status_configurations")
            .select("config_value")
            .eq("user_id", user.id)
            .eq("config_type", "company_settings" as never)
            .maybeSingle();
          console.log("companyConfig", companyConfig);
          if (companyConfig?.config_value) {
            const company = companyConfig.config_value as {
              name?: string;
              email?: string;
              phone?: string;
              website?: string;
              address?: string;
              industry?: string;
            };
            setCompanyData((prev) => ({
              name: company.name || prev.name,
              email: company.email || prev.email,
              phone: company.phone || prev.phone,
              website: company.website
                ? company.website.replace(/^https?:\/\//, "")
                : prev.website,
            }));
          }
        } catch (companyError) {
          // Company settings might not exist yet, use defaults
          console.log("Company settings not found, using defaults");
        }
      } catch (error) {
        console.error("Error loading user and company data:", error);
      } finally {
        setLoading(false);
      }
    };

    loadUserAndCompanyData();
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-neutral-900">
        <div className="text-white">Loading...</div>
      </div>
    );
  }

  const card = (
    <div
      className={`relative w-[793px] p-[56px] h-[1122px] overflow-hidden ${forPrint ? "" : "shadow-2xl"}`}
      style={{
        backgroundImage: `url('/Element%201C.png')`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      <div className="absolute inset-0 " />
      <div className="relative flex w-full justify-between items-center">
        <div className="relative z-10 flex items-start text-white">
          <div className="">
            <p className="text-[16px] opacity-40 ">Vorbereitet von</p>
            <p className="text-[16px] text-white font-semibold">
              {recruiterData.name}
            </p>
            <p className="text-[16px] opacity-40">{recruiterData.email}</p>
            <p className="text-[16px] opacity-40">{recruiterData.phone}</p>
          </div>

          <div className="ml-[31px] mr-[31px] h-[84px] min-w-[2px] w-[2px] shrink-0 bg-[#00d992] relative top-2" />

          <div className="">
            <p className="text-[16px] opacity-40">Unternehmen</p>
            <p className="text-[16px] text-white font-semibold">
              {companyData.name}
            </p>
            <p className="text-[16px] opacity-40">{companyData.email}</p>
            <p className="text-[16px] opacity-40">{companyData.phone}</p>
          </div>
        </div>
        <div className="z-10 ">
          <img
            src={Logo}
            alt="Logo"
            className="w-[120px] h-20 object-contain relative -left-2 -mt-1"
          />
        </div>
      </div>
      <div className="relative z-10 top-5 flex flex-col justify-center h-full">
        <div className="mb-48">
          <div className="border-l-2 flex flex-col justify-between border-white pl-4 h-[191px]">
            <h1 className="text-7xl -mt-[18.5px] font-inter font-[600] text-white leading-tight">
              {/* {candidate.name.split(" ")[0]} */}Neuer
            </h1>
            <h1 className="text-7xl -mt-[8.5px] font-bold text-white leading-tight">
              {/* {candidate.name.split(" ").slice(1).join(" ")} */}Bewerber
            </h1>

            <p className="text-white text-lg -mb-[7px] mt-4 opacity-70">
              {new Date().getFullYear()}
            </p>
            {/* 
            <div className="mt-8 text-white">
              <p className="text-2xl font-light">
                {candidate.desired_position || candidate.position}
              </p>
              <p className="text-lg opacity-80 mt-2">{candidate.location}</p>
            </div> */}
          </div>
        </div>
      </div>
      {/* Website: bottom-left only */}
      <div className="absolute left-[60px] bottom-8 z-10 -translate-y-[19px]">
        <p className="text-white text-[17px] opacity-70">
          {companyData.website}
        </p>
      </div>

      {/* Company logo: right edge, vertical (rotated) */}
      <div className="absolute right-[47px] -translate-y-[449px] z-10">
        <img
          src={CompanyName}
          alt="Beckett Stone"
          className="h-[368px] w-auto object-contain"
        />
      </div>
    </div>
  );

  if (forPrint) {
    return card;
  }

  return (
    <div className="flex justify-center items-center min-h-screen bg-neutral-900">
      {card}
    </div>
  );
};

export default MainPage;
