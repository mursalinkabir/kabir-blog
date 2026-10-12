import * as migration_20261011_143100_initial from './20261011_143100_initial';
import * as migration_20261011_143538_uses_localized_optional from './20261011_143538_uses_localized_optional';
import * as migration_20261011_211139_locale_bn_to_ja from './20261011_211139_locale_bn_to_ja';
import * as migration_20261012_034744_agent_publishing from './20261012_034744_agent_publishing';

export const migrations = [
  {
    up: migration_20261011_143100_initial.up,
    down: migration_20261011_143100_initial.down,
    name: '20261011_143100_initial',
  },
  {
    up: migration_20261011_143538_uses_localized_optional.up,
    down: migration_20261011_143538_uses_localized_optional.down,
    name: '20261011_143538_uses_localized_optional',
  },
  {
    up: migration_20261011_211139_locale_bn_to_ja.up,
    down: migration_20261011_211139_locale_bn_to_ja.down,
    name: '20261011_211139_locale_bn_to_ja',
  },
  {
    up: migration_20261012_034744_agent_publishing.up,
    down: migration_20261012_034744_agent_publishing.down,
    name: '20261012_034744_agent_publishing',
  },
];
