// #1523: ATLAS_RUN_AT pins the pipeline's clock (shared/runClock.ts). rebuild-release.yml sets it for
// the whole publish job, so without this every test that fakes the date with vi.useFakeTimers would
// read the pinned run time instead (run 43737647894 failed this way). Tests that need the pin set it
// themselves.
delete process.env.ATLAS_RUN_AT;
