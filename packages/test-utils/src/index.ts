// Placeholder export — grid builders, fixed seeds, canonical organisms, and the in-memory fake
// repositories implementing the Story 1.4 interfaces all land in Story 1.6.
//
// Both value imports are Story 1.1's workspace-graph proof: the build fails if either declared
// workspace edge stops resolving to that package's TS source. Story 1.3 moved the domain import
// off the removed GOL_DOMAIN placeholder onto OrganismSchema; Story 1.4 moved the persistence one
// off its GOL_PERSISTENCE placeholder onto STORAGE_KEYS. Repointed rather than dropped — deleting
// the import would leave the dependency declared in package.json but never compiled.
import { OrganismSchema } from '@gol/domain';
import { STORAGE_KEYS } from '@gol/persistence';

export const GOL_TEST_UTILS = '@gol/test-utils' as const;
export const TEST_UTILS_DEPENDS_ON = [OrganismSchema, STORAGE_KEYS] as const;
