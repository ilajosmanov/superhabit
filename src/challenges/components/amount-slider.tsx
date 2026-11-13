import { Host, Slider } from '@expo/ui/jetpack-compose';
import { semantics } from '@expo/ui/jetpack-compose/modifiers';

import { useColors } from '@/components/colors';

/** The M3 slider on `step` stops from `min` to `max`, under the builder's numeral; the iOS file holds iOS's. */
export function AmountSlider({
  name,
  value,
  min,
  max,
  step,
  onValueChange,
  onValueChangeFinished,
}: {
  /** What TalkBack calls the slider. */
  name: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onValueChange: (next: number) => void;
  onValueChangeFinished: () => void;
}) {
  const colors = useColors();
  return (
    <Host matchContents={{ vertical: true }}>
      <Slider
        modifiers={[semantics({ contentDescription: name })]}
        value={value}
        min={min}
        max={max}
        // Compose counts the stops between the ends.
        steps={Math.max(0, (max - min) / step - 1)}
        colors={{
          thumbColor: colors.accent,
          activeTrackColor: colors.accent,
          inactiveTrackColor: colors.line,
          activeTickColor: 'transparent',
          inactiveTickColor: 'transparent',
        }}
        onValueChange={onValueChange}
        onValueChangeFinished={onValueChangeFinished}
      />
    </Host>
  );
}
