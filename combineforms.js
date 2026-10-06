/* v1.68 — several Word forms in ONE document.
   Plan a bunkering › Export can produce the Bunker/Internal Transfer Plan form and the Lube Oil Replenishment form together.
   The two forms use different page margins, so each one keeps its own Word SECTION (a section break replaces the page break
   between them): a part is { body: <w:body> content of that form, sectPr: its <w:sectPr> }.
   Pure functions (no DOM) — tested by test-combineforms.mjs. */
export const W_DOC_OPEN='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>';
/* A one-point paragraph that closes a section (the section break starts the next form on a new page). Kept as small as possible so it
   can never push a full-page form onto an extra page. */
export function sectionBreakPara(sectPr){
  return `<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="20" w:lineRule="exact"/><w:rPr><w:sz w:val="2"/></w:rPr>${sectPr}</w:pPr></w:p>`;
}
export function combineFormsDocumentXml(parts){
  const list=(parts||[]).filter(p=>p&&p.body);
  if(!list.length)throw new Error('combineFormsDocumentXml: nothing to combine');
  const last=list.length-1;
  const body=list.map((p,i)=>i<last?p.body+sectionBreakPara(p.sectPr):p.body).join('');
  return `${W_DOC_OPEN}${body}${list[last].sectPr}</w:body></w:document>`;
}
