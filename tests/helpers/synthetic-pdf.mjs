/** Minimal inert PDF fixture built without external content, fonts, scripts or network. */
export function syntheticPdf(pageCount = 8) {
  if (!Number.isSafeInteger(pageCount) || pageCount < 1 || pageCount > 1001) throw new RangeError('Invalid synthetic page count');
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>',`<< /Type /Pages /Count ${pageCount} /Kids [${Array.from({length:pageCount},(_,i)=>`${4+i*2} 0 R`).join(' ')}] >>`,'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  for (let i=0;i<pageCount;i++) {
    const text=`BT /F1 16 Tf 40 740 Td (SYNTHETIC ORIGINAL PAGE ${i+1}) Tj ET`;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5+i*2} 0 R >>`,`<< /Length ${Buffer.byteLength(text)} >>\nstream\n${text}\nendstream`);
  }
  let output='%PDF-1.4\n',offsets=[0];
  objects.forEach((object,i)=>{offsets.push(Buffer.byteLength(output));output+=`${i+1} 0 obj\n${object}\nendobj\n`;});
  const xref=Buffer.byteLength(output);
  output+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`+offsets.slice(1).map(offset=>`${String(offset).padStart(10,'0')} 00000 n \n`).join('')+`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(output);
}
