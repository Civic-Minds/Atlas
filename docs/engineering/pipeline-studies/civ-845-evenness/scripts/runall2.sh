#!/bin/zsh
cd /private/tmp/claude-501/-Users-ryan/c8d09263-8b14-4eb3-a210-0831beabea38/scratchpad
TSX=~/Developer/Code/Platforms/Atlas/node_modules/.bin/tsx
while [ ! -f civ845-evidence/outputs/ALLDONE ]; do sleep 5; done
run(){ name=$1; shift; echo "### $name ($*)" > civ845-evidence/outputs/$name.out; nice -n 15 $TSX "$@" >> civ845-evidence/outputs/$name.out 2>&1; echo "exit $?" >> civ845-evidence/outputs/$name.out; }
run step2_main step2.ts main
run step1b step1b.ts
echo done > civ845-evidence/outputs/ALLDONE2
