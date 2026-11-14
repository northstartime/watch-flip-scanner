// Exact configured URL fragments. These labels are intended business targets;
// offline validation cannot authenticate the live group's identity or membership.
export const FACEBOOK_ASK_TARGETS = Object.freeze([
  Object.freeze({ key: 'watch-trader-community', name: 'Watch Trader Community', fragment: 'watchtradercommunity' }),
  Object.freeze({ key: 'moda-watch-club', name: 'Moda Watch Club', fragment: 'Watchtrading' }),
]);
export const ASK_GROUPS = Object.freeze(FACEBOOK_ASK_TARGETS.map(target => target.fragment));

export function validateGroupFragments(groups) {
  if (!Array.isArray(groups) || !groups.length || groups.some(group => typeof group !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(group) || group.toLowerCase() === 'feed')) {
    throw new Error('Group configuration requires exact nonempty group IDs or slugs.');
  }
  if (new Set(groups.map(group => group.toLowerCase())).size !== groups.length) throw new Error('Group configuration contains duplicate identities.');
  return [...groups];
}

export function createTwoGroupPlan({ groupFragments = ASK_GROUPS } = {}) {
  const fragments = validateGroupFragments(groupFragments);
  if (fragments.length !== 2) throw new Error('Controlled test requires exactly two distinct groups.');
  return {
    targets: FACEBOOK_ASK_TARGETS.map((target, index) => ({ ...target, fragment: fragments[index] })),
    maxCandidatesPerGroup: 5, maxListingsPerGroup: 5, maxDiscoveryPasses: 2, groupBudgetMs: 30000,
    liveGroupIdentityVerified: false, uploadsEnabled: false, feedWritesEnabled: false, chromeLaunchEnabled: false,
  };
}
export const MODA_UNDER_10K_TARGET = Object.freeze({
  key: 'moda-10k-and-under', name: 'Moda 10k & Under', fragment: '558871041349029',
});

// Explicit controlled-test scope only. Normal daily/V1 ASK_GROUPS remain unchanged.
export function createThreeGroupPlan({ groupFragments = [...ASK_GROUPS, MODA_UNDER_10K_TARGET.fragment] } = {}) {
  const fragments = validateGroupFragments(groupFragments);
  if (fragments.length !== 3) throw new Error('Controlled test requires exactly three distinct groups.');
  return { ...createTwoGroupPlan({ groupFragments: fragments.slice(0, 2) }),
    targets: [...FACEBOOK_ASK_TARGETS, MODA_UNDER_10K_TARGET].map((target, index) => ({ ...target, fragment: fragments[index] })),
  };
}
