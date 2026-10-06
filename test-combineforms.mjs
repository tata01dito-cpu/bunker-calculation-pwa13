import assert from 'node:assert/strict';
import { combineFormsDocumentXml, sectionBreakPara } from './combineforms.js';
import { bfFormsBodyXml, bfFormsDocumentXml, bfPageFromStop, BF_SECT_PR } from './bunkerform.js';
import { lfFormsBodyXml, lfFormsDocumentXml, lfPageFromStop, LF_SECT_PR } from './lubeform.js';
import { calculateVoyage } from './core.js';
const t=(name,fn)=>{fn();console.log('ok -',name);};

/* a small voyage with a fuel + diesel bunker AND a lube-oil replenishment at the same port */
const voy={
  meta:{startUtc:'2026-10-10T00:00'},
  fuels:[{id:'fo',name:'FO',seaRate:20,portRate:2,unit:'MT',reserveDays:2,reserveRate:20},{id:'do',name:'DO',seaRate:1,portRate:.5,unit:'MT',reserveDays:2,reserveRate:1}],
  lubes:[{id:'cyl',name:'Cylinder Oil',seaRate:100,portRate:0,unit:'L',reserveDays:3,reserveRate:100}],
  tanks:[
    {id:'f1',group:'fo',name:'FO Tank 1',capacity:470,capacityM3:500,density:.94,robInput:'mt',rob:50,consumable:true,category:'storage'},
    {id:'f2',group:'fo',name:'FO Tank 2',capacity:513,capacityM3:546,density:.94,robInput:'mt',rob:20,consumable:true,category:'storage'},
    {id:'d1',group:'do',name:'DO Tank 1',capacity:70,capacityM3:84,density:.83,robInput:'mt',rob:35,consumable:true,category:'storage'},
    {id:'c1',group:'cyl',name:'Cyl Tank 1',capacity:15000,rob:5000,consumable:true,category:'storage'}],
  active:{fo:0,do:0},
  route:[{port:'Start',distanceNm:0,speedKn:10,portStayDays:1,utcOffset:8,bunkers:{}},
    {port:'Zhenjiang',distanceNm:240,speedKn:10,portStayDays:1,utcOffset:8,bunkers:{
      fo:{entryMode:'tanks',allocations:[{tankId:'f2',quantity:295}]},do:{entryMode:'tanks',allocations:[{tankId:'d1',quantity:10}]},
      cyl:{entryMode:'tanks',allocations:[{tankId:'c1',quantity:4000}]}}},
    {port:'Busan',distanceNm:600,speedKn:10,portStayDays:1,utcOffset:9,bunkers:{fo:{entryMode:'tanks',allocations:[{tankId:'f1',quantity:100}]}}}]
};
const calc=calculateVoyage(voy);
const bp=calc.results.map(r=>bfPageFromStop(r,{vessel:'MV T',limitPct:85})).filter(Boolean);
const lp=calc.results.map(r=>lfPageFromStop(r,voy.lubes)).filter(Boolean);
const pageBreaks=x=>(x.match(/w:type="page"/g)||[]).length;
const rows=x=>(x.match(/<w:tr>/g)||[]).length;

t('test data gives 2 bunkering pages and 1 lube page',()=>{assert.equal(bp.length,2);assert.equal(lp.length,1);});

t('combined document: one section break between the forms, final sectPr is the last form\'s',()=>{
  const parts=[{body:bfFormsBodyXml(bp),sectPr:BF_SECT_PR},{body:lfFormsBodyXml(lp),sectPr:LF_SECT_PR}];
  const xml=combineFormsDocumentXml(parts);
  assert.ok(xml.startsWith('<?xml'));assert.ok(xml.includes('<w:body>')&&xml.endsWith('</w:body></w:document>'));
  assert.equal((xml.match(/<w:sectPr>/g)||[]).length,2,'one section per form');
  // inner sectPr sits inside a paragraph (a section break), the closing one is a direct child of the body
  const inner=xml.match(/<w:p><w:pPr>[^]*?<w:sectPr>[^]*?<\/w:sectPr><\/w:pPr><\/w:p>/);
  assert.ok(inner,'section break paragraph present');
  assert.ok(inner[0].includes('w:w="16838"')&&inner[0].includes('w:top="300"'),'first section = bunkering form margins');
  assert.ok(xml.endsWith(LF_SECT_PR+'</w:body></w:document>'),'last section = lube form margins');
  assert.ok(xml.indexOf('BUNKER/INTERNAL TRANSFER PLAN')<xml.indexOf('Replenishment Plan and Result Record'),'bunkering pages come first');
  // page breaks only between pages of the same form (2 bunkering pages -> 1 break), none between the forms
  assert.equal(pageBreaks(xml),pageBreaks(bfFormsBodyXml(bp))+pageBreaks(lfFormsBodyXml(lp)));
  assert.equal(pageBreaks(xml),1);
  // nothing lost: every table row of both forms is present
  assert.equal(rows(xml),rows(bfFormsBodyXml(bp))+rows(lfFormsBodyXml(lp)));
});

t('the single-form documents are unchanged by the refactor',()=>{
  assert.equal(bfFormsDocumentXml(bp).includes(bfFormsBodyXml(bp)+BF_SECT_PR+'</w:body>'),true);
  assert.equal(lfFormsDocumentXml(lp).includes(lfFormsBodyXml(lp)+LF_SECT_PR+'</w:body>'),true);
});

t('one part is returned as a plain single-section document; empty input is rejected',()=>{
  const x=combineFormsDocumentXml([{body:'<w:p/>',sectPr:LF_SECT_PR}]);
  assert.equal((x.match(/<w:sectPr>/g)||[]).length,1);
  assert.throws(()=>combineFormsDocumentXml([]));
  assert.throws(()=>combineFormsDocumentXml([null,{}]));
});

t('section-break paragraph is tiny and carries the section properties',()=>{
  const p=sectionBreakPara(BF_SECT_PR);
  assert.ok(p.includes('w:lineRule="exact"')&&p.includes('<w:sz w:val="2"/>')&&p.includes(BF_SECT_PR));
});
console.log('test-combineforms: all passed');
