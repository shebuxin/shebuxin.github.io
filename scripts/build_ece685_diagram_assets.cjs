// Generate the non-JavaScript baseline diagrams from the same renderer as the labs.
'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),model=require(path.join(root,'assets/js/ece685-stage-model.js')),diagrams=require(path.join(root,'assets/js/ece685-stage-diagrams.js'));
const check=process.argv.includes('--check'),sizes={};let changed=false;
function write(file,content){
  const target=path.join(root,file),previous=fs.existsSync(target)?fs.readFileSync(target,'utf8'):null;
  if(previous===content)return;
  changed=true;if(check)console.error('Diagram asset needs regeneration: '+file);else fs.writeFileSync(target,content);
}
for(const kind of Object.keys(model.defaults)){
  const r=model.solve(kind);sizes[kind]=Number(diagrams.render(kind,r).viewBox.split(' ')[3]);
  for(const lang of ['en','zh'])write(`assets/images/teaching/stage-${kind}${lang==='zh'?'.zh':''}.svg`,diagrams.standalone(kind,r,lang));
}
write('_data/ece685_diagram_sizes.json',JSON.stringify(sizes,null,2)+'\n');
for(const lang of ['en','zh'])write(`assets/images/teaching/l05-representations${lang==='zh'?'.zh':''}.svg`,diagrams.representations(lang));
if(check&&changed)process.exitCode=1;
else console.log(check?'Baseline diagram assets are current.':'Baseline diagram assets generated.');
