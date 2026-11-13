import { FilterChip, FlowRow, Host, RNHostView, Text } from '@expo/ui/jetpack-compose';
import { fillMaxWidth } from '@expo/ui/jetpack-compose/modifiers';

import { COMPOSE_LABEL } from '@/theme';

import { useColors } from './colors';
import { Icon } from './icon';

/** Material's filter chips, wrapping, one of them picked (or none yet); the iOS file holds iOS's. */
export function ChoiceChips({
  answers,
  value,
  onChange,
}: {
  /** Each chip's value and its label. */
  answers: readonly (readonly [string, string])[];
  value: string | null;
  onChange: (value: string) => void;
}) {
  const colors = useColors();
  return (
    <Host matchContents={{ vertical: true }}>
      <FlowRow
        horizontalArrangement={{ spacedBy: 8 }}
        verticalArrangement={{ spacedBy: 0 }}
        modifiers={[fillMaxWidth()]}
      >
        {answers.map(([answer, label]) => (
          <FilterChip
            key={answer}
            selected={value === answer}
            onClick={() => onChange(answer)}
            border={{ color: value === answer ? colors.line : colors.edge }}
            colors={{
              containerColor: 'transparent',
              labelColor: colors.soft,
              selectedContainerColor: colors.line,
              selectedLabelColor: colors.chalk,
            }}
          >
            <FilterChip.Label>
              <Text style={COMPOSE_LABEL}>{label}</Text>
            </FilterChip.Label>
            {value === answer && (
              <FilterChip.LeadingIcon>
                <RNHostView matchContents>
                  <Icon name="check" size={18} color={colors.mark} />
                </RNHostView>
              </FilterChip.LeadingIcon>
            )}
          </FilterChip>
        ))}
      </FlowRow>
    </Host>
  );
}
