# Atlas child-fare ledger (2026-10-11)

This ledger covers all 697 agencies in the Atlas registry.

## Research status

- Manually verified (official source documents the policy): 656
- Reviewed, still unresolved: 41

`status: confirmed` means an official source documents the agency's child-fare policy. It does not mean children ride free; use `policy_type`.

## Policy type

- age: 487
- age-conditional: 5
- all-fare-free: 83
- height: 39
- student-program: 26
- no-free-child-fare: 16
- unresolved: 41

- `age`: a general rule that children up to `free_child_age` (inclusive) ride free, sometimes with accompaniment or height conditions (see `conditions`).
- `age-conditional`: free up to `free_child_age` only under a program condition (seasonal, weekend, resident, pass). Do not present as a general "kids under N ride free".
- `all-fare-free`: the whole system is fare-free for everyone.
- `height`: free below a height line, no age rule.
- `student-program`: free or reduced through a student, grade or youth program, not a general child fare.
- `no-free-child-fare`: the official source shows no free child fare.
- `unresolved`: no current official statement found.

The JSON ledger is authoritative.
