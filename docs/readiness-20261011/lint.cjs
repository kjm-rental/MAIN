/* eslint-disable @typescript-eslint/no-require-imports */
const fs=require('fs'),path=require('path'),{spawnSync}=require('child_process');
const {ref}=require('../phase10-migration022/connection.cjs');
if(ref!=='uuxjymzrtncrnnkvdpjy')throw Error('Disposable project required');
const args=['db','lint','--linked','--project-ref',ref,'--schema','public,private','--level','error','--fail-on','error','--output','json'];
const p=spawnSync(process.execPath,[path.resolve(__dirname,'../../node_modules/supabase/dist/supabase.js'),...args],{encoding:'utf8',timeout:60000});
const report={project:ref,executedAt:new Date().toISOString(),command:'supabase '+args.join(' '),exitCode:p.status,passed:p.status===0&&/No schema errors found/.test(p.stdout+p.stderr),stdout:p.stdout,stderr:p.stderr};
fs.writeFileSync(path.join(__dirname,'lint-results.json'),JSON.stringify(report,null,2));console.log({project:ref,passed:report.passed,exitCode:p.status});if(!report.passed)process.exitCode=1;
