import { Host, Picker, Text } from '@expo/ui/swift-ui';
import { pickerStyle, tag } from '@expo/ui/swift-ui/modifiers';

import { tick } from './tick';

/**
 * iOS's segmented control, one choice of a few, as wide as its parent. `value` may be none of them (a number
 * typed by hand): then no segment is selected. A tick on each change.
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
  const selected = choices.find((choice) => choice === value) ?? null;
  return (
    <Host matchContents={{ vertical: true }}>
      <Picker<T | null>
        selection={selected}
        onSelectionChange={(choice) => {
          if (choice === null || choice === value) return;
          tick();
          onChange(choice);
        }}
        modifiers={[pickerStyle('segmented')]}
      >
        {choices.map((choice) => (
          <Text key={choice} modifiers={[tag(choice)]}>
            {label(choice)}
          </Text>
        ))}
      </Picker>
    </Host>
  );
}
