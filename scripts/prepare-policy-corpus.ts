import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { extractPolicyPdf } from '../src/lib/policy-pdf';
import { initialPolicyManifest } from '../src/lib/policy-corpus';

async function main(){
  const files=process.argv.slice(2).filter(file=>file!=='--');
  if(!files.length)throw new Error('Pass one or more source PDF paths. This command reads files only and does not publish them.');
  for(const file of files){
    const extracted=await extractPolicyPdf(new Uint8Array(await readFile(file)));
    const manifest=initialPolicyManifest.find(item=>item.fileName.toLowerCase()===basename(file).toLowerCase());
    console.log(JSON.stringify({file:basename(file),manifest:manifest||null,pageCount:extracted.pageCount,characterCount:extracted.characterCount,sectionCount:extracted.sections.length,sections:extracted.sections.map(section=>({number:section.section_number,title:section.section_title,pages:[section.page_start,section.page_end]}))},null,2));
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
