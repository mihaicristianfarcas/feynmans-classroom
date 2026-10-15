/* Test fixtures: tiny PDFs built by hand, so tests need no binary files. */

/** A small text PDF (Helvetica, one line per entry), enough for pdf.js and pdf-inspector. */
export function makePdf(pages: string[][]): Buffer {
  return build(
    pages.map((lines) => ({
      size: [612, 792],
      content: `BT /F1 12 Tf 72 720 Td 18 TL ${lines.map((l) => `(${pdfString(l)}) Tj T*`).join(" ")} ET`,
    })),
  );
}

/**
 * A two-up PDF: each landscape sheet holds a left and a right page, written row by row across both
 * (left line, then the right line beside it), the order that breaks reading a sheet as one page.
 */
export function makeSpreadPdf(sheets: [string[], string[]][], { turned = false } = {}): Buffer {
  return build(
    sheets.map(([left, right]) => {
      const rows: string[] = [];
      // turned: stored as a portrait page shown at /Rotate 90, as scanners often do, with the text
      // running up the page so that it reads across once turned
      const at = (x: number, y: number) => (turned ? `0 1 -1 0 ${792 - y} ${x} Tm` : `1 0 0 1 ${x} ${y} Tm`);
      for (let i = 0; i < Math.max(left.length, right.length); i++) {
        const y = 720 - i * 18;
        if (left[i]) rows.push(`${at(72, y)} (${pdfString(left[i])}) Tj`);
        if (right[i]) rows.push(`${at(684, y)} (${pdfString(right[i])}) Tj`);
      }
      return {
        size: turned ? [792, 1224] : [1224, 792],
        rotate: turned ? 90 : 0,
        content: `BT /F1 12 Tf ${rows.join(" ")} ET`,
      };
    }),
  );
}

const pdfString = (text: string) => text.replace(/[()\\]/g, "\\$&");

function build(pages: { size: number[]; rotate?: number; content: string }[]): Buffer {
  const objs: string[] = [];
  objs[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objs[2] = `<< /Type /Pages /Kids [${pages.map((_, i) => `${4 + i * 2} 0 R`).join(" ")}] /Count ${pages.length} >>`;
  objs[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  pages.forEach(({ size, rotate = 0, content }, i) => {
    objs[4 + i * 2] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${size.join(" ")}] /Rotate ${rotate} /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + i * 2} 0 R >>`;
    objs[5 + i * 2] = `<< /Length ${content.length} >>\nstream\n${content}\nendstream`;
  });
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (let k = 1; k < objs.length; k++) {
    offsets[k] = out.length;
    out += `${k} 0 obj\n${objs[k]}\nendobj\n`;
  }
  const xref = out.length;
  out += `xref\n0 ${objs.length}\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((o) => `${String(o).padStart(10, "0")} 00000 n \n`)
    .join("")}trailer\n<< /Size ${objs.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}
