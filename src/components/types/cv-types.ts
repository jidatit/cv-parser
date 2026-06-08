export type Education = {
  field: string;
  degree: string;
  endDate: string;
  location: string;
  startDate: string;
  institution: string;
};

export type WorkExperience = {
  company: string;
  endDate: string;
  location: string;
  position: string;
  startDate: string;
  description: string;
};

export type FurtherEducation = {
  name: string;
  institution: string;
  date?: string;
  description?: string;
};

export type Candidate = {
  id: string;
  user_id: string;
  name: string;
  email: string;
  phone: string;
  location: string;
  position: string;
  desired_position: string;
  industry: string | null;
  status: string;
  experience: string;
  current_salary: string;
  desired_salary: number | null;
  max_commute: string;
  willing_to_relocate: boolean | null;
  workload: string | null;
  reason_for_change: string | null;
  birthdate: string;
  skills: string[];
  education: Education[];
  work_experience: WorkExperience[];
  further_education?: FurtherEducation[];
  languages: string[];
  // certifications removed - merged into further_education
  notes: string;
  summary: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
  recruiting_status: string | null;
  assigned_to: string;
  notice_period: string | null;
  awards_publications: string[];
  linkedin_url: string | null;
  source_contact: string | null;
  priority: string | null;
  ai_summary: string | null;
  signature_achievements: string | string[] | null;
  growth_potential: string | string[] | null;
  most_proud_of: string | null;
  potential_risks: string | null;
  insights_notes: string | null;
  candidate_values: string | string[] | null;
  driving_license?: string | null;
};

export const candidatesMockData: Candidate[] = [
  {
    id: "db5c974a-5d04-46d0-bfec-9f5d6f7a3a1d",
    user_id: "11087efb-06d8-4d78-a855-951fda975c23",
    name: "Zohaib Haider",
    email: "zebihaider123@gmail.com",
    phone: "+92 310 5904269",
    location: "Wah Cantt, Pakistan",
    position: "Junior Full Stack Developer",
    desired_position: "",
    industry: null,
    status: "Active",
    experience: "",
    current_salary: "",
    desired_salary: null,
    max_commute: "",
    willing_to_relocate: null,
    workload: null,
    reason_for_change: null,
    birthdate: "null",
    skills: [
      "JavaScript (ES6+)",
      "TypeScript",
      "SQL",
      "C++",
      "Java",
      "React.js",
      "Next.js",
      "Redux Toolkit",
      "TanStack Query",
      "Tailwind CSS",
      "shadcn/ui",
      "Material UI",
      "HTML5",
      "CSS3",
      "Node.js",
      "Express.js",
      "NestJS",
      "REST APIs",
      "GraphQL",
      "WebSockets",
      "JWT",
      "PostgreSQL",
      "MongoDB",
      "Supabase",
      "Firebase",
      "Redis",
      "Drizzle ORM",
      "AWS S3",
      "Docker",
      "Git",
      "GitHub",
      "CI/CD Pipelines",
      "Stripe",
      "Cryptomus",
      "Zoho Books",
      "Puppeteer",
      "Jest",
      "Swagger (OpenAPI)",
      "RBAC",
      "Multi-Tenant SaaS",
    ],
    education: [
      {
        field: "Bachelor of Science in Software Engineering",
        degree: "Bachelor of Science in Software Engineering",
        endDate: "Aug 2024",
        location: "",
        startDate: "Sep 2020",
        institution: "International Islamic University, Islamabad Pakistan",
      },
    ],
    work_experience: [
      {
        company: "Jidat IT (Software House)",
        endDate: "Present",
        location: "",
        position: "Junior Full Stack Developer",
        startDate: "Feb 2023",
        description:
          "–Built and maintained multi-tenant SaaS dashboards using React, TypeScript, Next.js, Redux Toolkit, and\nTanStack Query with role-based routing and reusable UI components (Tailwind CSS, shadcn/ui, MUI).\n–Integrated REST and GraphQL APIs with real-time features (WebSockets, subscriptions) supporting chat,\nnotifications, alerts, and complex form workflows.\n–Implemented secure authentication and authorization using JWT access/refresh tokens, Google OAuth, magic\nlinks, RBAC middleware, and React auth contexts.\n–Developed backend services with Node.js, Express, and NestJS using MVC architecture, schema validation,\nmiddleware-based security, logging (Winston), caching (Redis), and optimized queries (PostgreSQL, MongoDB,\nDrizzle ORM).\n–Integrated third-party services including Stripe, Cryptomus, Zoho Books, Puppeteer scraping, AWS S3/Supabase\nstorage, email services, Docker, CI/CD pipelines, Jest testing, and OpenAPI/Swagger.",
      },
      {
        company: "DSP Driving School Platform",
        endDate: "Nov 2023",
        location: "",
        position: "Full Stack Developer",
        startDate: "Jun 2023",
        description:
          "–Built a role-based driving school SaaS with Admin, Instructor, and Student dashboards supporting onboarding,\ndocument verification, and protected routing\n–Implemented instructor availability, tariff-based lesson pricing, booking, rescheduling, student progress tracking,\nreviews, and Stripe payments\n–Developed real-time chat, notifications, analytics dashboards, and live updates using WebSockets, GraphQL\nsubscriptions, and MongoDB",
      },
      {
        company: "Priority Dental Equipment (PDE)",
        endDate: "Present",
        location: "",
        position: "Full Stack Developer",
        startDate: "Dec 2023",
        description:
          "–Built a multi-tenant dental equipment management SaaS with Clinic Owner, Staff, and Admin dashboards for\nequipment, rooms, and task workflows\n–Automated recurring maintenance schedules, compliance scoring, reminders, and audit-ready documentation\naligned with OSHA and EPA standards\n–Integrated Stripe subscriptions, analytics dashboards, ROI calculator, secure file storage, and reporting exports for\nclinic operations",
      },
      {
        company: "RTA Marketing",
        endDate: "May 2023",
        location: "",
        position: "Full Stack Developer",
        startDate: "Feb 2023",
        description:
          "–Built a role-based CRM with Admin, Sales, and Virtual Assistant dashboards to manage leads, targets,\ncommissions, and finance providers\n–Implemented real-time sales analytics, KPI tracking, commission calculations, and live TV dashboards for\norganization-wide visibility\n–Aggregated inventory and third-party leads by scraping multiple external car platforms using Puppeteer, reducing\nmanual effort by 80%",
      },
    ],
    languages: [],
    notes: "[20.01.2026] Candidate created",
    summary: null,
    avatar_url: null,
    created_at: "2026-01-20T06:58:33.316708+00:00",
    updated_at: "2026-01-21T06:19:19.523018+00:00",
    recruiting_status: null,
    assigned_to: "11087efb-06d8-4d78-a855-951fda975c23",
    notice_period: null,
    awards_publications: [],
    linkedin_url: null,
    source_contact: null,
    priority: null,
    ai_summary: null,
    signature_achievements: null,
    growth_potential: null,
    most_proud_of: null,
    potential_risks: null,
    insights_notes: null,
    candidate_values: null,
  },
];
