// Placeholder export — repository interfaces and localStorage implementations land in Story 1.4.
// The @gol/domain value import is Story 1.1's workspace-graph proof: it fails the build if the
// declared "@gol/domain": "*" edge stops resolving to that package's TS source. Story 1.3 moved
// it off the removed GOL_DOMAIN placeholder onto BattleSchema — the schema Story 1.4 will
// actually parse with at the load boundary.
import { BattleSchema } from '@gol/domain';

export const GOL_PERSISTENCE = '@gol/persistence' as const;
export const PERSISTENCE_DEPENDS_ON = BattleSchema;
