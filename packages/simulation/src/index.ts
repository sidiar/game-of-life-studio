// Placeholder export — the rules engine and simulation loop land in Epic 3.
// The @gol/domain value import is Story 1.1's workspace-graph proof: it fails the build if the
// declared "@gol/domain": "*" edge stops resolving to that package's TS source. Story 1.3 moved
// it off the removed GOL_DOMAIN placeholder onto SurvivalRulesSchema — consumed by the Story 3.2
// GoL rules layer, not by the generic engine core, which stays domain-agnostic.
import { SurvivalRulesSchema } from '@gol/domain';

export const GOL_SIMULATION = '@gol/simulation' as const;
export const SIMULATION_DEPENDS_ON = SurvivalRulesSchema;
