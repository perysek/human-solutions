import { toCanvas, toPng } from 'html-to-image';
import { jsPDF } from 'jspdf';
import type { OrgChartRevision } from '@/lib/api/orgChart';

/**
 * TASK2 — PNG/PDF export of the org chart, wired into OrgChartPage's
 * header actions. Client-side rasterization only (html-to-image + jsPDF),
 * no backend involvement: the same DOM node OrgChartTree already renders
 * IS the export, so there's nothing to keep in sync between "what the user
 * sees" and "what gets downloaded".
 *
 * `html-to-image` over `html2canvas` (the other common choice) — better SVG/
 * web-font fidelity for a DOM tree that's mostly plain boxes and text, no
 * canvas/video/iframe content to worry about either library's edge cases on.
 *
 * Both exports capture the CALLER-SUPPLIED node directly rather than the
 * scrollable wrapper around it — see OrgChartTree.tsx's own comment on why
 * the scrollable outer container isn't the right capture target (its
 * on-screen width is clipped to the viewport; the inner `width: max-content`
 * node is the full, unclipped chart).
 */

/** Resolves the current theme's page background so the export isn't
 * transparent-background PNG (the gaps between NodeBox cards have no
 * background of their own) — read live at click-time so it's correct for
 * whichever theme (light/dark) is active, not a hardcoded light-mode color. */
function currentPageBackground(): string {
  return getComputedStyle(document.body).backgroundColor || '#ffffff';
}

function triggerDownload(href: string, filename: string) {
  const link = document.createElement('a');
  link.href = href;
  link.download = filename;
  // Not appended to the DOM — Chromium/Firefox/Safari all trigger the
  // download from a detached anchor's synthetic click, and skipping the
  // append/remove pair avoids a visible reflow for a link that's never seen.
  link.click();
}

export async function exportOrgChartPng(node: HTMLElement, filename: string): Promise<void> {
  const dataUrl = await toPng(node, { pixelRatio: 2, backgroundColor: currentPageBackground() });
  triggerDownload(dataUrl, filename);
}

/**
 * One landscape A4 page, the chart scaled to fit within it, footer band
 * reserved at the bottom for "Rev. N · revised_at" — the explicit TASK2
 * requirement. Deliberately kept to plain ASCII/Latin-1 punctuation in the
 * footer text (a formatted date is digits/dots/commas only) — jsPDF's
 * built-in Helvetica has no glyphs for Polish diacritics (ą/ć/ę/ł/ń/ó/ś/ź/ż)
 * outside a custom embedded font, which this one short, diacritic-free
 * footer line lets us skip entirely. The chart's own Polish labels
 * (department names, job titles, …) need no such care — they're pixels
 * inside the embedded PNG, not vector PDF text.
 */
export async function exportOrgChartPdf(
  node: HTMLElement, revision: OrgChartRevision | null, filename: string,
): Promise<void> {
  const canvas = await toCanvas(node, { pixelRatio: 2, backgroundColor: currentPageBackground() });

  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  const margin = 10;
  const footerBand = 12;
  const maxWidth = pageWidth - margin * 2;
  const maxHeight = pageHeight - margin * 2 - footerBand;

  const imageRatio = canvas.width / canvas.height;
  let drawWidth = maxWidth;
  let drawHeight = drawWidth / imageRatio;
  if (drawHeight > maxHeight) {
    drawHeight = maxHeight;
    drawWidth = drawHeight * imageRatio;
  }
  const x = (pageWidth - drawWidth) / 2;

  pdf.addImage(canvas, 'PNG', x, margin, drawWidth, drawHeight);

  pdf.setFontSize(9);
  pdf.setTextColor(110);
  const footerText = revision
    ? `Rev. ${revision.id} · ${new Date(revision.revised_at).toLocaleString('pl-PL')}`
    : 'Brak danych o rewizji';
  pdf.text(footerText, margin, pageHeight - footerBand / 2 + 2);

  pdf.save(filename);
}
