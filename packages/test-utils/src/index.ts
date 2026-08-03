// Placeholder export — fake repositories implementing the Story 1.4 interfaces land in Story 1.6.
// Story 1.3 replaced @gol/domain's placeholder export with real schemas; this stub no longer
// cross-imports domain until Story 1.6 actually consumes canonical fixtures.
import { GOL_PERSISTENCE } from '@gol/persistence';

export const GOL_TEST_UTILS = '@gol/test-utils' as const;
export const TEST_UTILS_DEPENDS_ON = [GOL_PERSISTENCE] as const;
