# CV & Job Expose – Design Implementation & Alignment

**Document purpose:** Explain how we implemented your CV template and job expose designs, how we reconciled Miro and Illustrator, and what we delivered.  
**Audience:** Client / stakeholder.  
**Companion doc:** See [CLIENT_DELIVERABLES_CV_AND_JOBS.md](./CLIENT_DELIVERABLES_CV_AND_JOBS.md) for technical deliverables (parsing, editing, PDF, etc.).

---

## 1. Design Sources & Constraints

You provided two design references:

| Source          | Format    | Use in implementation                                                     |
| --------------- | --------- | ------------------------------------------------------------------------- |
| **Miro**        | View-only | Primary visual reference; we matched to it as far as possible.            |
| **Illustrator** | Editable  | Source of final assets, sizes, and layout; we built the UI to match this. |

**Why both mattered**

- **Miro** reflected your intended look and feel (layout, hierarchy, tone). We used it as the target for “how it should look.”
- **Miro was not editable**, so we could not extract assets or exact values from it.
- **Illustrator** was editable and contained the production-ready job expose and CV template. We could export images, logos, backgrounds, and measure sizes and spacing there.

**Resulting approach**

- We **matched the implementation fully to the Illustrator files** (assets, widths, spacing, structure).
- We **aligned as closely as possible to the Miro design** by adjusting layout, typography, and colors in code and, where needed, in Illustrator, then re-exporting.

---

## 2. Differences Between Miro and Illustrator

We observed:

- **UI elements and components** looked different between Miro and Illustrator (e.g. card style, borders, section blocks).
- **Colors** differed (e.g. greens, greys, backgrounds).
- **Sizes and proportions** were not identical (e.g. header, columns, card heights).

Because Miro was view-only, we could not copy values from it. We therefore:

1. Took **Illustrator as the single source of truth** for assets and dimensions.
2. **Exported all production assets from Illustrator** and used them in the app as-is (no re-coloring or resizing of those files).
3. **Refined the Illustrator files** where it helped close the gap to Miro (e.g. tweaking elements so that, once exported and implemented, the result was closer to what you had in Miro).

---

## 3. What We Exported from Illustrator and Used in Code

We exported and integrated the following from your Illustrator designs so the app matches the intended look:

- **Logos** – All logo variants used in the CV and job expose (e.g. header, footer, light/dark).
- **Backgrounds** – Page and section backgrounds (e.g. header area, intro page).
- **Box/section backgrounds** – Backgrounds for:
  - Personal/address section
  - Languages (Sprachen)
  - Signature Achievements
  - Education
  - Further Education & Courses
  - Beckett Stone Insight notes
  - Premium Zertifizierung / Seal
- **Decorative assets** – e.g. teal/mountain overlay, side graphics, accents.

These assets are used in the code **exactly as exported** (paths, filenames, and usage in the UI) so that the on-screen result matches the Illustrator layout and styling.

---

## 4. Sizes, Widths, and Layout (from Illustrator)

We did not guess dimensions; we took them from Illustrator:

- **Column widths** – Left and right column min/max widths (e.g. 309px) to match your template.
- **Header** – Height and proportions of the header (name, role, profile area).
- **Cards and sections** – Spacing between sections, padding, and border/underline treatment (e.g. emerald accent) aligned to the Illustrator layout.
- **Profile picture** – Size, position, and crop (e.g. rounded top-left corner) as in the design; we implemented the profile picture section and added it to the template as specified.

This keeps the CV and job expose visually consistent with your delivered designs.

---

## 5. Matching to Miro and Improving the Design

Although we could not edit Miro, we used it as the quality bar:

- **Layout and hierarchy** – We adjusted the on-screen layout (and, where needed, the Illustrator file) so that section order, emphasis, and balance better matched what you had in Miro.
- **Colors** – We tuned colors in code (and in Illustrator where relevant) to get closer to the Miro look (e.g. greens, greys, text contrast).
- **UI and components** – We refined cards, headings, and dividers so that the overall feel matched Miro as much as possible given the Illustrator assets and structure.
- **Your feedback** – When you pointed out mismatches with Miro, we implemented those changes (e.g. profile picture section, spacing, recent Miro-based tweaks).

We did not change the design arbitrarily; every change was aimed at either matching Illustrator exactly or closing the gap to Miro.

---

## 6. Data, Prompts, and Content Quality

So that the templates look good with real data, we improved more than just the layout:

- **Prompts and parsing** – We improved the prompts and extraction logic (e.g. in the Gemini-based CV parsing) so that location, dates, languages, skills, education order, and bullet points are correct and consistent. This reduces “N/A” and wrong or missing content.
- **Data handling in the template** – We added clear rules for missing or null data (e.g. show “N/A” instead of blank or “null”), and we always show section headings so the layout stays consistent.
- **Bullet points** – We standardized bullets from parsing → storage → edit → display so that the CV and job expose show clean, single-level bullets without duplicates or broken lines.

These improvements support the design by making the filled-in template look professional and aligned with your Miro/Illustrator intent.

---

## 7. Summary of What We Did (Design & UX)

| What we did                 | Detail                                                                                                                                                                |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Single source of truth**  | Used Illustrator as the editable source; matched implementation to it.                                                                                                |
| **Asset export**            | Exported all images, logos, and box/section backgrounds from Illustrator and used them as-is in the app.                                                              |
| **Sizes from Illustrator**  | Matched column widths, header, and section spacing to your Illustrator dimensions.                                                                                    |
| **Alignment to Miro**       | Refined layout, colors, and components (in code and in Illustrator) to get as close as possible to the Miro design.                                                   |
| **Profile picture**         | Implemented the profile picture section and placement as in the design.                                                                                               |
| **Your Miro feedback**      | Implemented the recent changes you requested based on Miro (spacing, elements, structure).                                                                            |
| **Colors**                  | Worked to align greens, greys, and backgrounds with Miro while respecting the exported Illustrator assets.                                                            |
| **Box backgrounds**         | Used the exact box/section backgrounds from Illustrator for each CV and job expose section.                                                                           |
| **Data and prompts**        | Improved prompts and data handling so the template is filled correctly and shows “N/A” where needed.                                                                  |
| **Layout balance**          | Added logic so that when the left column is much taller than the right, the last sections can move to the right to reduce empty space and match the intended balance. |
| **Spacing and consistency** | Ensured moved or added sections use the same spacing and styling as the rest of the template.                                                                         |

---

## 8. What You Can Expect

- **CV template** – Built from your Illustrator design; uses exported assets and measured sizes; aligned to Miro where possible; dynamic data and “N/A” handling; profile picture and layout balance as described above.
- **Job expose** – Same approach: Illustrator as source, exported assets and dimensions in code, alignment to Miro, and consistent spacing and styling.

If you have further Miro or Illustrator iterations, we can continue to align the implementation and update this document or the main deliverables doc as needed.

---

_For technical deliverables (parsing, editing, PDF export, database, etc.), see [CLIENT_DELIVERABLES_CV_AND_JOBS.md](./CLIENT_DELIVERABLES_CV_AND_JOBS.md)._
