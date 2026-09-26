export const BETA_ROLLOUT_NOTICE =
  'This service is currently available only in Atlas preview and beta. It is not included in the public version.';

export function getRolloutNotice(agency: { betaOnly?: boolean; rolloutNotice?: string }): string | undefined {
  return agency.betaOnly ? BETA_ROLLOUT_NOTICE : agency.rolloutNotice;
}
