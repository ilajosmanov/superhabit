import { FilterChip, Row, Text } from '@expo/ui/jetpack-compose';

import { COMPOSE_LABEL } from '@/theme';

import { useColors } from './colors';

/**
 * Material's filter chip in house colours: outlined until picked, then the line fill. No check mark: it
 * widens the chip and reflows the row, and the fill already says it. A Compose node: put it in a `Row`
 * or `FlowRow` inside a `Host`.
 */
export function Chip({
  label,
  count,
  selected,
  enabled = true,
  onPress,
}: {
  label: string;
  /** A mono number after the label: how many the chip holds. */
  count?: number;
  selected: boolean;
  enabled?: boolean;
  onPress: () => void;
}) {
  const colors = useColors();
  return (
    <FilterChip
      selected={selected}
      enabled={enabled}
      onClick={onPress}
      border={{ color: selected ? colors.line : colors.edge }}
      colors={{
        containerColor: 'transparent',
        labelColor: colors.soft,
        selectedContainerColor: colors.line,
        selectedLabelColor: colors.chalk,
      }}
    >
      <FilterChip.Label>
        <Row horizontalArrangement={{ spacedBy: 6 }} verticalAlignment="center">
          <Text style={COMPOSE_LABEL}>{label}</Text>
          {count !== undefined && (
            <Text color={colors.muted} style={{ fontFamily: 'Geist Mono', fontSize: 12 }}>
              {String(count)}
            </Text>
          )}
        </Row>
      </FilterChip.Label>
    </FilterChip>
  );
}
