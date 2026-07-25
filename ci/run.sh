#!/usr/bin/env sh
set -eu
cd "$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
stage=${1:-all}
profile=${CI:+github-actions}; profile=${profile:-local}
record() {
  node - "$1" "$2" "$profile" <<'JS'
const fs=require('fs'), crypto=require('crypto'), cp=require('child_process');
const [name,outcome,profile]=process.argv.slice(2), allowed=['ci.validate','ci.test','ci.security','ci.package','ci.evidence'];
if(!allowed.includes(name)||!['passed','failed'].includes(outcome)) process.exit(2);
fs.mkdirSync('.ci/evidence',{recursive:true}); let sha='unknown',dirty=true;
try { sha=cp.execFileSync('git',['-c','safe.directory=.','rev-parse','HEAD'],{encoding:'utf8'}).trim(); dirty=Boolean(cp.execFileSync('git',['-c','safe.directory=.','status','--porcelain'],{encoding:'utf8'}).trim()); } catch (_) {}
const report=`.ci/evidence/${name.replace('.','-')}.json`; fs.writeFileSync(report,JSON.stringify({check:name,outcome})+'\n');
const manifestPath='.ci/evidence/manifest.json'; let prior={checks:[]}; if(fs.existsSync(manifestPath)) prior=JSON.parse(fs.readFileSync(manifestPath));
const checks=new Map(prior.checks.map(x=>[x.name,x])); checks.set(name,{name,outcome,report,sha256:crypto.createHash('sha256').update(fs.readFileSync(report)).digest('hex')});
fs.writeFileSync(manifestPath,JSON.stringify({schemaVersion:'llm-council.ci-evidence/v1',contractVersion:'llm-council.ci-contract/v1',repository:'llm-council-ui',source:{commit:sha,workingTree:dirty?'dirty':'clean'},profile,checks:[...checks.values()].sort((a,b)=>a.name.localeCompare(b.name))},null,2)+'\n');
JS
}
run() { check=$1; shift; if "$@"; then record "$check" passed; else record "$check" failed; exit 1; fi; }
one() { case "$1" in
  validate) run ci.validate sh -c 'npm ci && npm run i18n-check' ;;
  test) run ci.test npm run build -- --configuration development ;;
  security) run ci.security sh -c 'npm run audit:prod && npm run license-check' ;;
  package) run ci.package sh -c 'CI=true npm run build -- --output-path .ci/build' ;;
  evidence) record ci.evidence passed ;;
  *) exit 2;; esac; }
if [ "$stage" = all ]; then for item in validate test security package evidence; do one "$item"; done; else one "$stage"; fi
