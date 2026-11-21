#!/bin/zsh
# Re-runs the CIV-845 rejection experiments from the scratchpad (cwd must be the scratchpad dir). One at a time, nice.
cd /private/tmp/claude-501/-Users-ryan/c8d09263-8b14-4eb3-a210-0831beabea38/scratchpad
TSX=~/Developer/Code/Platforms/Atlas/node_modules/.bin/tsx

run(){ name=$1; shift; echo "### $name ($*)" > civ845-evidence/outputs/$name.out; nice -n 15 $TSX "$@" >> civ845-evidence/outputs/$name.out 2>&1; echo "exit $?" >> civ845-evidence/outputs/$name.out; }
run rule rule.ts
run step1run step1run.ts
run step3 step3.ts
run ripple2 ripple2.ts
run s1S_T0_vis s1S.ts T0 vis
run s1runA3 s1runA3.ts
run s1bA3 s1bA3.ts
run s2c_T0 s2c.ts T0
run s4A3 s4A3.ts
run step4 step4.ts
run blip blip.ts
run blip2 blip2.ts
run var var.ts
run s5run s5run.ts
run s6run s6run.ts
run s6w s6w.ts
echo done > civ845-evidence/outputs/ALLDONE
