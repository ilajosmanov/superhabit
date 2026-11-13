import { Host, Slider } from '@expo/ui/swift-ui';
import { accessibilityLabel, tint } from '@expo/ui/swift-ui/modifiers';

import { useColors } from '@/components/colors';

/** iOS's slider on `step` stops from `min` to `max`, under the builder's numeral. */
export function AmountSlider({
  name,
  value,
  min,
  max,
  step,
  onValueChange,
  onValueChangeFinished,
}: {
  /** What VoiceOver calls the slider. */
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
        value={value}
        min={min}
        max={max}
        step={step}
        onValueChange={onValueChange}
        onEditingChanged={(editing) => {
          if (!editing) onValueChangeFinished();
        }}
        modifiers={[accessibilityLabel(name), tint(colors.accent)]}
      />
    </Host>
  );
}
