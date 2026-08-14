export type ExtractedPolicySection={section_number:string|null;section_title:string;content:string;page_start:number;page_end:number;chunk_order:number};
export type ExtractedPolicy={pageCount:number;sections:ExtractedPolicySection[];characterCount:number};

type TextItem={str:string;hasEOL?:boolean;transform?:number[]};
const headingPattern=/^(\d+(?:\.\d+)*)\.?\s+(.{2,120})$/;
const maxChunkLength=11000;
const titleConnectors=new Set(['and','or','of','the','to','with','for','in','on','a','an']);

function titleLike(value:string){
  return !/[.!?]$/.test(value)&&value.split(/\s+/).every(word=>titleConnectors.has(word.toLowerCase())||/^[A-Z0-9(&/\-]/.test(word));
}

function linesFromItems(items:TextItem[]){
  const lines:string[]=[]; let current=''; let lastY:number|undefined;
  for(const item of items){
    const value=item.str.replace(/\s+/g,' ').trim(); if(!value)continue;
    const y=item.transform?.[5];
    if(current&&lastY!==undefined&&y!==undefined&&Math.abs(y-lastY)>2){lines.push(current.trim());current='';}
    current+=`${current?' ':''}${value}`; lastY=y;
    if(item.hasEOL){lines.push(current.trim());current='';lastY=undefined;}
  }
  if(current.trim())lines.push(current.trim());
  return lines.filter(Boolean);
}

function splitLongSection(section:Omit<ExtractedPolicySection,'chunk_order'>){
  if(section.content.length<=maxChunkLength)return [section];
  const paragraphs=section.content.split(/\n+/); const output:typeof section[]=[]; let content='';
  for(const paragraph of paragraphs){
    if(content&&content.length+paragraph.length+1>maxChunkLength){output.push({...section,content});content='';}
    content+=`${content?'\n':''}${paragraph}`;
  }
  if(content)output.push({...section,content});
  return output;
}

export async function extractPolicyPdf(bytes:Uint8Array):Promise<ExtractedPolicy>{
  if(bytes.length<5||String.fromCharCode(...bytes.slice(0,5))!=='%PDF-')throw new Error('The uploaded file is not a valid PDF.');
  const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');
  const document=await pdfjs.getDocument({data:bytes,useWorkerFetch:false,useSystemFonts:true}).promise;
  const sections:Array<Omit<ExtractedPolicySection,'chunk_order'>>=[]; let active:Omit<ExtractedPolicySection,'chunk_order'>|null=null; let characters=0;
  for(let pageNumber=1;pageNumber<=document.numPages;pageNumber++){
    const page=await document.getPage(pageNumber); const text=await page.getTextContent(); const lines=linesFromItems(text.items as TextItem[]);
    characters+=lines.join(' ').length;
    for(const line of lines){
      const match=line.match(headingPattern);
      if(match&&(/^[A-Z][A-Z &/\-()]+$/.test(match[2])||match[1].includes('.')||titleLike(match[2]))){
        if(active)sections.push(active);
        active={section_number:match[1],section_title:match[2].trim(),content:line,page_start:pageNumber,page_end:pageNumber};
      }else if(active){active.content+=`\n${line}`;active.page_end=pageNumber;}
      else{
        const overview=sections.find(section=>section.section_title==='Document Overview');
        if(overview){overview.content+=`\n${line}`;overview.page_end=pageNumber;}
        else sections.push({section_number:null,section_title:'Document Overview',content:line,page_start:pageNumber,page_end:pageNumber});
      }
    }
  }
  if(active)sections.push(active);
  const normalized=sections.flatMap(splitLongSection).map((section,index)=>({...section,content:section.content.trim(),chunk_order:index})).filter(section=>section.content.length>=20);
  if(characters<100||normalized.length<2)throw new Error('PDF extraction produced insufficient policy text. Review the file before publishing.');
  return {pageCount:document.numPages,sections:normalized,characterCount:characters};
}
