import {
  Host,
  SegmentedButton,
  SingleChoiceSegmentedButtonRow,
  Text,
} from '@expo/ui/jetpack-compose';
import { fillMaxWidth } from '@expo/ui/jetpack-compose/modifiers';

import { COMPOSE_LABEL } from '@/theme';

import { useColors } from './colors';
import { tick } from './tick';

/**
 * Material's segmented row, one choice of a few, as wide as its parent: the inactive fill sits just off
 * the ground. `value` may be none of them (a number typed by hand). A tick on each change.
 */
export function Segments<T extends string | number>({
  choices,
  value,
  onChange,
  label = String,
}: {
  choices: readonly T[];
  value: unknown;
  onChange: (choice: T) => void;
  label?: (choice: T) => string;
}) {
  const colors = useColors();
  return (
    <Host matchContents={{ vertical: true }}>
      <SingleChoiceSegmentedButtonRow modifiers={[fillMaxWidth()]}>
        {choices.map((choice) => (
          <SegmentedButton
            key={choice}
            selected={choice === value}
            onClick={() => {
              if (choice === value) return;
              tick();
              onChange(choice);
            }}
            colors={{
              activeContainerColor: colors.line,
              inactiveContainerColor: colors.ground,
              activeBorderColor: colors.edge,
              inactiveBorderColor: colors.edge,
              activeContentColor: colors.chalk,
              inactiveContentColor: colors.muted,
            }}
          >
            <SegmentedButton.Label>
              <Text style={COMPOSE_LABEL}>{label(choice)}</Text>
            </SegmentedButton.Label>
          </SegmentedButton>
        ))}
      </SingleChoiceSegmentedButtonRow>
    </Host>
  );
}
