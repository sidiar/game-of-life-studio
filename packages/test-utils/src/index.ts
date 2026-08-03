// Placeholder export — fake repositories implementing the Story 1.4 interfaces land in Story 1.6.
// The @gol/domain value import is Story 1.1's workspace-graph proof: it fails the build if the
// declared "@gol/domain": "*" edge stops resolving to that package's TS source. Story 1.3 moved
// it off the removed GOL_DOMAIN placeholder onto OrganismSchema — the shape Story 1.6's canonical
// fixtures will be built against.
import { OrganismSchema } from '@gol/domain';
import { GOL_PERSISTENCE } from '@gol/persistence';

export const GOL_TEST_UTILS = '@gol/test-utils' as const;
export const TEST_UTILS_DEPENDS_ON = [OrganismSchema, GOL_PERSISTENCE] as const;
