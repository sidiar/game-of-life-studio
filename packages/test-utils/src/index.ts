// Placeholder export — fake repositories implementing the Story 1.4 interfaces land in Story 1.6.
import { GOL_DOMAIN } from '@gol/domain';
import { GOL_PERSISTENCE } from '@gol/persistence';

export const GOL_TEST_UTILS = '@gol/test-utils' as const;
export const TEST_UTILS_DEPENDS_ON = [GOL_DOMAIN, GOL_PERSISTENCE] as const;
