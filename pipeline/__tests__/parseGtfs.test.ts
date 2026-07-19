import { describe, it, expect } from 'vitest';
import { truncateAtImplausibleJump, deinterleaveDuplicateSequences, detectClusteredJumps, repairClusteredJumps, excludeKnownIsolatedPoints } from '../parseGtfs.js';

describe('truncateAtImplausibleJump', () => {
  it('leaves a well-formed, evenly-spaced shape untouched', () => {
    const points: [number, number][] = [
      [43.65, -79.38], [43.651, -79.381], [43.652, -79.382], [43.653, -79.383], [43.654, -79.384],
    ];
    expect(truncateAtImplausibleJump(points)).toEqual(points);
  });

  it('truncates at a single dramatic jump (Mi Transporte T14B_r2, #219)', () => {
    const points: [number, number][] = [
      [20.60, -103.38], [20.6005, -103.3805], [20.601, -103.381], [20.6015, -103.3815],
      [20.6058, -103.3850], // last good point before the jump
      [20.7541, -103.3591], // ~16.7km away — the corrupted jump
      [20.7545, -103.3595],
    ];
    const result = truncateAtImplausibleJump(points);
    expect(result).toEqual(points.slice(0, 5));
  });

  it('does not fire on naturally sparse shapes with no outlier (e.g. long rural rail segments)', () => {
    // Every segment is a similar, moderately large distance — no single segment
    // dominates relative to the others, so nothing should be truncated.
    const points: [number, number][] = [
      [43.0, -79.0], [43.05, -79.0], [43.10, -79.0], [43.15, -79.0], [43.20, -79.0],
    ];
    expect(truncateAtImplausibleJump(points)).toEqual(points);
  });

  it('leaves short shapes (fewer than 4 points) untouched', () => {
    const points: [number, number][] = [[20.0, -103.0], [25.0, -108.0]];
    expect(truncateAtImplausibleJump(points)).toEqual(points);
  });
});

describe('deinterleaveDuplicateSequences', () => {
  it('resolves duplicate sequence numbers by nearest-neighbor continuity (Mi Transporte T14B_r1, #244)', () => {
    // Two physical paths concatenated under one shape_id, each sequence number
    // duplicated once per path. A plain sort-by-sequence would zigzag between
    // them; nearest-neighbor selection should keep only one continuous path.
    const pts = [
      { seq: 0, lat: 20.00, lon: -103.00 },
      { seq: 0, lat: 20.40, lon: -103.00 }, // other path's point at same sequence
      { seq: 1, lat: 20.01, lon: -103.00 },
      { seq: 1, lat: 20.41, lon: -103.00 },
      { seq: 2, lat: 20.02, lon: -103.00 },
      { seq: 2, lat: 20.42, lon: -103.00 },
    ];
    expect(deinterleaveDuplicateSequences(pts)).toEqual([
      [20.00, -103.00],
      [20.01, -103.00],
      [20.02, -103.00],
    ]);
  });

  it('is a no-op (equivalent to a plain sort) when there are no duplicate sequences', () => {
    const pts = [
      { seq: 2, lat: 43.652, lon: -79.382 },
      { seq: 0, lat: 43.650, lon: -79.380 },
      { seq: 1, lat: 43.651, lon: -79.381 },
    ];
    expect(deinterleaveDuplicateSequences(pts)).toEqual([
      [43.650, -79.380],
      [43.651, -79.381],
      [43.652, -79.382],
    ]);
  });
});

describe('detectClusteredJumps', () => {
  it('flags a real repro from Nancy Réseau Stan shape 10757$STAN-56$14: two sub-paths interleaved via unique (non-duplicate) sequence numbers', () => {
    // Leading/trailing filler at the shape's real ~26m median spacing, so the
    // median (computed across the whole shape) isn't skewed by this short
    // excerpt the way it would be with just the 22-point repro alone -- matches
    // how the real 446-point shape behaves (median stays small, jumps stand out).
    const filler: [number, number][] = Array.from({ length: 30 }, (_, i) => [48.678 + i * 0.00023, 6.160 + i * 0.00023]);
    // Points 283-296 exactly as published (sorted by their real, distinct shape_pt_sequence
    // values) -- no duplicates to key off of, but the path still zigzags: north (283-285),
    // snaps back ~250m south then east (286-294), snaps back north again (295-296).
    const points: [number, number][] = [
      ...filler,
      [48.68177032470703, 6.16294002532959],
      [48.681907653808594, 6.163816928863525],
      [48.68208694458008, 6.165071964263916],
      [48.68211364746094, 6.165280818939209],
      [48.68215560913086, 6.165363788604736],
      [48.68218231201172, 6.165460109710693],
      [48.682220458984375, 6.1656951904296875],
      [48.68230438232422, 6.166211128234863],
      [48.682273864746094, 6.166215896606445],
      [48.68454360961914, 6.168026924133301], // jump north
      [48.686790466308594, 6.168015956878662], // jump further north
      [48.68354797363281, 6.168540954589844], // snaps back south
      [48.68381118774414, 6.17014217376709],
      [48.683937072753906, 6.170985221862793],
      [48.6840934753418, 6.171936988830566],
      [48.68427276611328, 6.172421932220459],
      [48.68458557128906, 6.173192977905273],
      [48.68466567993164, 6.173373222351074],
      [48.684730529785156, 6.173602104187012],
      [48.68476867675781, 6.1738200187683105],
      [48.6883544921875, 6.173195838928223], // jumps north again
      [48.69043731689453, 6.175655841827393],
    ];
    expect(detectClusteredJumps(points)).toBe(true);
  });

  it('does not flag a well-formed shape with consistent spacing', () => {
    const points: [number, number][] = Array.from({ length: 20 }, (_, i) => [43.65 + i * 0.0003, -79.38 + i * 0.0003]);
    expect(detectClusteredJumps(points)).toBe(false);
  });

  it('does not flag a single isolated long segment (a real long block or highway stretch)', () => {
    // A genuine long gap that continues in the same direction afterward -- unlike
    // an interleaved/misplaced point, the bearing barely changes, so this isn't a
    // reversal at all regardless of the isolated-point bridge-savings check below.
    const points: [number, number][] = Array.from({ length: 8 }, (_, i) => [43.65 + i * 0.0003, -79.38 + i * 0.0003]);
    points.push([43.6521 + 0.01, -79.3779 + 0.01]);
    for (let i = 1; i <= 6; i++) {
      points.push([43.6521 + 0.01 + i * 0.0003, -79.3779 + 0.01 + i * 0.0003]);
    }
    expect(detectClusteredJumps(points)).toBe(false);
  });

  it('does not flag an isolated reversal where bridging saves little distance (real street-corner turn or terminus loop, TTC/WMATA false-positive regression)', () => {
    // Real TTC shape 1120145: the path turns ~105 degrees over a ~115m segment at
    // what is a genuine street corner, not a misplaced point. Bridging directly
    // only saves ~10% of the through-distance (113m vs 126m) -- far short of the
    // 25%+ savings seen in confirmed real corruption (Nancy: 33-88%). An earlier
    // version of the isolated-reversal check only required bridging to be
    // *any* amount shorter, which by the triangle inequality is true of nearly
    // every reversal -- this flagged 43 shapes across TTC/WMATA/TransLink alone,
    // all already rendering correctly in production.
    const points: [number, number][] = [
      ...Array.from({ length: 15 }, (_, i) => [43.787255 - i * 0.00002, -79.352947 + i * 0.00002] as [number, number]),
      [43.787255, -79.352947],
      [43.787338, -79.353018],
      [43.787642, -79.351645],
      ...Array.from({ length: 15 }, (_, i) => [43.787642 + i * 0.00002, -79.351645 - i * 0.00002] as [number, number]),
    ];
    expect(detectClusteredJumps(points)).toBe(false);
  });

  it('does not flag a densely-sampled real shape with a few long-but-straight segments (Rennes false-positive regression)', () => {
    // A real repro from STAR (Rennes) shape 0002-B-1071-2131: most points ~11m apart
    // (much denser than Nancy's ~26m), so several genuinely straight segments crossing
    // a bridge/open area are 8x+ that tiny median without being corrupt at all. Verified
    // against the real feed: these points' bearing barely changes (max ~34 degrees turn)
    // versus the ~174 degree reversal in the real Nancy corruption above -- an earlier,
    // distance-only version of this check flagged shapes like this one at up to 88%,
    // when visually every route rendered correctly on the street grid.
    const points: [number, number][] = [
      [48.1014595, -1.65963399], [48.10173035, -1.65992403], [48.10200119, -1.66015697],
      [48.1024704, -1.66088402], [48.1035614, -1.66271806], [48.10365295, -1.66275203],
      [48.10531235, -1.66542399], // long straight segment (bridge/open area), same bearing
      [48.10538101, -1.66554999], [48.10543823, -1.66567504], [48.1056633, -1.66604495],
      [48.10554123, -1.666116], [48.10486603, -1.66618395], [48.10477829, -1.66615605],
      [48.10476303, -1.66635001], [48.10457611, -1.66796803], [48.10414886, -1.67151499],
      [48.1041069, -1.67158699], [48.10427856, -1.67239499], [48.10426331, -1.67252803],
      [48.10438156, -1.67257094], [48.10469437, -1.67265999], [48.10577011, -1.67292404],
      [48.10702515, -1.67326796], [48.10748672, -1.673401], [48.10754776, -1.67335403],
      [48.10773849, -1.67340696], [48.10790253, -1.673473], [48.10886765, -1.67373896],
      [48.10978317, -1.67398703], [48.10987473, -1.673949],
    ];
    expect(detectClusteredJumps(points)).toBe(false);
  });

  it('does not flag a real isolated single-point reversal from Nancy shape 10757$STAN-68$70 (index 12) -- deliberately left to the scoped known-shape fix, not the general detector', () => {
    // Real points 0-39 as published (self-contained slice reproducing the shape's
    // own local median -- a shorter slice understates the median and misses the
    // flag, same lesson as the STAN-56 repro above). Point 12 sits ~239m from its
    // neighbors with a ~100 degree reversal and nothing else nearby is anomalous,
    // so MIN_CLUSTER=2 correctly leaves it alone -- a general isolated-reversal
    // heuristic was tried and rejected (see findClusteredJumpRanges doc comment);
    // this exact case is instead handled by excludeKnownIsolatedPoints below.
    const points: [number, number][] = [
      [48.69089126586914, 6.12836217880249], [48.69093322753906, 6.1283159255981445],
      [48.69112014770508, 6.128424167633057], [48.691463470458984, 6.128377914428711],
      [48.69178009033203, 6.128335952758789], [48.69282913208008, 6.12818717956543],
      [48.69326400756836, 6.128158092498779], [48.694061279296875, 6.128070831298828],
      [48.694297790527344, 6.12808084487915], [48.694435119628906, 6.128068923950195],
      [48.694496154785156, 6.1280999183654785], [48.696083068847656, 6.125679016113281],
      [48.69601821899414, 6.123730182647705], // point 12 -- isolated misplaced outlier
      [48.69815444946289, 6.124143123626709], [48.699005126953125, 6.127620220184326],
      [48.7009391784668, 6.130112171173096], [48.7009391784668, 6.130109786987305],
      [48.701358795166016, 6.130214214324951], [48.70174789428711, 6.130317211151123],
      [48.70216369628906, 6.13042688369751], [48.70231246948242, 6.130483150482178],
      [48.702388763427734, 6.130557060241699], [48.702449798583984, 6.130702972412109],
      [48.70254898071289, 6.131021022796631], [48.702552795410156, 6.131042003631592],
      [48.70269012451172, 6.131475925445557], [48.70293426513672, 6.132115840911865],
      [48.70298385620117, 6.132338047027588], [48.70295715332031, 6.132547855377197],
      [48.70283508300781, 6.132954120635986], [48.70267105102539, 6.1335039138793945],
      [48.70258712768555, 6.133635997772217], [48.702491760253906, 6.133755207061768],
      [48.70238494873047, 6.133823871612549], [48.70231246948242, 6.133840084075928],
      [48.702239990234375, 6.133823871612549], [48.702178955078125, 6.133800983428955],
      [48.702056884765625, 6.133726119995117], [48.701881408691406, 6.133551120758057],
      [48.70161819458008, 6.133306980133057],
    ];
    expect(detectClusteredJumps(points)).toBe(false);
  });
});

describe('repairClusteredJumps', () => {
  it('repairs the real Nancy Réseau Stan repro by excising the interleaved detour and bridging directly', () => {
    // Real points 250-299 of shape 10757$STAN-56$14 (not synthetic filler -- a shorter
    // synthetic lead-in doesn't reproduce the real shape's local point density closely
    // enough, and skews which range gets flagged). Real points 283/285 each source an
    // anomalous jump; the interleaved detour is points 284-285, which should be excised
    // so point 283 connects directly to point 286.
    const points: [number, number][] = [
      [48.677207946777344, 6.156075954437256], [48.6772346496582, 6.156259059906006],
      [48.677310943603516, 6.156632900238037], [48.677398681640625, 6.157092094421387],
      [48.67747116088867, 6.1573591232299805], [48.67755889892578, 6.157773017883301],
      [48.6776123046875, 6.158036231994629], [48.67770004272461, 6.158350944519043],
      [48.67781448364258, 6.158731937408447], [48.67784881591797, 6.158837795257568],
      [48.67788314819336, 6.15882682800293], [48.677886962890625, 6.158839225769043],
      [48.678104400634766, 6.159524917602539], [48.67823791503906, 6.159409046173096],
      [48.68003463745117, 6.157853126525879], [48.6808967590332, 6.157077789306641],
      [48.68093490600586, 6.157388210296631], [48.680999755859375, 6.157711029052734],
      [48.6810188293457, 6.157822132110596], [48.68098068237305, 6.157826900482178],
      [48.68107986450195, 6.158420085906982], [48.68123245239258, 6.159379005432129],
      [48.6813850402832, 6.160378932952881], [48.68147277832031, 6.160921096801758],
      [48.68167495727539, 6.16230583190918], [48.68177032470703, 6.16294002532959],
      [48.681907653808594, 6.163816928863525], [48.68208694458008, 6.165071964263916],
      [48.68211364746094, 6.165280818939209], [48.68215560913086, 6.165363788604736],
      [48.68218231201172, 6.165460109710693], [48.682220458984375, 6.1656951904296875],
      [48.68230438232422, 6.166211128234863],
      [48.682273864746094, 6.166215896606445], // point 283
      [48.68454360961914, 6.168026924133301], // point 284 -- detour, should be excised
      [48.686790466308594, 6.168015956878662], // point 285 -- detour, should be excised
      [48.68354797363281, 6.168540954589844], // point 286 -- should connect directly after repair
      [48.68381118774414, 6.17014217376709], [48.683937072753906, 6.170985221862793],
      [48.6840934753418, 6.171936988830566], [48.68427276611328, 6.172421932220459],
      [48.68458557128906, 6.173192977905273], [48.68466567993164, 6.173373222351074],
      [48.684730529785156, 6.173602104187012], [48.68476867675781, 6.1738200187683105],
      [48.6883544921875, 6.173195838928223], [48.69043731689453, 6.175655841827393],
      [48.6904296875, 6.17564582824707], [48.690582275390625, 6.175548076629639],
      [48.69109344482422, 6.175191879272461],
    ];
    const result = repairClusteredJumps(points);
    expect(result.repaired).toBe(true);
    expect(result.points).not.toContainEqual([48.68454360961914, 6.168026924133301]);
    expect(result.points).not.toContainEqual([48.686790466308594, 6.168015956878662]);
    expect(result.points).toContainEqual([48.682273864746094, 6.166215896606445]);
    expect(result.points).toContainEqual([48.68354797363281, 6.168540954589844]);
    expect(detectClusteredJumps(result.points)).toBe(false);
    // Small, localized excision -- not a wholesale truncation of the shape.
    expect(points.length - result.points.length).toBeLessThan(5);
  });

  it('is a no-op on a well-formed shape with nothing to repair', () => {
    const points: [number, number][] = Array.from({ length: 20 }, (_, i) => [43.65 + i * 0.0003, -79.38 + i * 0.0003]);
    const result = repairClusteredJumps(points);
    expect(result.repaired).toBe(true);
    expect(result.points).toEqual(points);
  });

});

describe('excludeKnownIsolatedPoints', () => {
  // These are the two real isolated-single-point corruption cases the general
  // findClusteredJumpRanges deliberately doesn't catch (see its doc comment) --
  // confirmed real by visual inspection of the rendered map (Nancy Réseau Stan
  // routes T2 and Corol). Handled here by exact shape_id + coordinate match
  // instead of a general heuristic, since a general one was tried and found to
  // sit too close to real terminus-loop geometry on live agencies (TTC).
  it('excises the known misplaced point for Nancy shape 10757$STAN-68$70', () => {
    const points: [number, number][] = [
      [48.696083068847656, 6.125679016113281],
      [48.69601821899414, 6.123730182647705], // the known misplaced point
      [48.69815444946289, 6.124143123626709],
    ];
    const result = excludeKnownIsolatedPoints('10757$STAN-68$70', points);
    expect(result.removed).toBe(true);
    expect(result.points).toEqual([
      [48.696083068847656, 6.125679016113281],
      [48.69815444946289, 6.124143123626709],
    ]);
  });

  it('excises all four known misplaced points for Nancy shape 10757$STAN-75$53', () => {
    const points: [number, number][] = [
      [48.70254898071289, 6.131021022796631],
      [48.702552795410156, 6.131019115447998], // known misplaced point (idx 43)
      [48.70269012451172, 6.131475925445557],
      [48.65890884399414, 6.177466869354248], // known misplaced point (idx 405)
      [48.67235565185547, 6.160637855529785], // known misplaced point (idx 456)
      [48.67512512207031, 6.1585187911987305], // known misplaced point (idx 482)
    ];
    const result = excludeKnownIsolatedPoints('10757$STAN-75$53', points);
    expect(result.removed).toBe(true);
    expect(result.points).toEqual([
      [48.70254898071289, 6.131021022796631],
      [48.70269012451172, 6.131475925445557],
    ]);
  });

  // Found via a full sweep of every Nancy shape after the two cases above were
  // fixed but route T2's other direction (STAN-67$16) still showed a visible
  // break on the map. Confirmed real (33-90% bridge-savings, matching the
  // established range) vs. four other sweep candidates at 1.7-3.1% savings
  // that were left alone as noise.
  it('excises both known misplaced points for Nancy shape 10757$STAN-67$16 (a two-point cluster, not a single isolated point)', () => {
    // Visual re-inspection after the single-point fix showed the line still
    // cutting through blocks -- the adjacent point at 6.122347 also needed
    // removing (neither shows a sharp reversal on its own, tracked in #247).
    const points: [number, number][] = [
      [48.69923400878906, 6.127908229827881],
      [48.69816589355469, 6.122346878051758], // known misplaced point
      [48.69740676879883, 6.119966983795166], // known misplaced point
      [48.69609451293945, 6.122805118560791],
    ];
    const result = excludeKnownIsolatedPoints('10757$STAN-67$16', points);
    expect(result.removed).toBe(true);
    expect(result.points).toEqual([
      [48.69923400878906, 6.127908229827881],
      [48.69609451293945, 6.122805118560791],
    ]);
  });

  it('excises the known misplaced point for Nancy shape 10757$STAN-76$100', () => {
    const points: [number, number][] = [
      [48.673855, 6.157254],
      [48.67463302612305, 6.1587138175964355], // the known misplaced point
      [48.674972, 6.157852],
    ];
    const result = excludeKnownIsolatedPoints('10757$STAN-76$100', points);
    expect(result.removed).toBe(true);
    expect(result.points).toEqual([
      [48.673855, 6.157254],
      [48.674972, 6.157852],
    ]);
  });

  it('excises the known misplaced point for Nancy shape 10757$STAN-19$23', () => {
    const points: [number, number][] = [
      [48.71567153930664, 6.222369194030762],
      [48.717010498046875, 6.221489906311035], // the known misplaced point
      [48.71556854248047, 6.221330165863037],
    ];
    const result = excludeKnownIsolatedPoints('10757$STAN-19$23', points);
    expect(result.removed).toBe(true);
    expect(result.points).toEqual([
      [48.71567153930664, 6.222369194030762],
      [48.71556854248047, 6.221330165863037],
    ]);
  });

  it('is a no-op for any other shape_id, even one with a similarly-shaped anomaly', () => {
    const points: [number, number][] = [
      [48.696083068847656, 6.125679016113281],
      [48.69601821899414, 6.123730182647705],
      [48.69815444946289, 6.124143123626709],
    ];
    const result = excludeKnownIsolatedPoints('some-other-shape-id', points);
    expect(result.removed).toBe(false);
    expect(result.points).toEqual(points);
  });
});
