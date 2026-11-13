import {
  AssistChip,
  Box,
  FilterChip,
  FlowRow,
  Host,
  RNHostView,
  Row,
  Text,
} from '@expo/ui/jetpack-compose';
import {
  background,
  fillMaxWidth,
  horizontalScroll,
  padding,
  size,
} from '@expo/ui/jetpack-compose/modifiers';
import type { AndroidSymbol } from 'expo-symbols';
import type { ReactNode } from 'react';

import { COMPOSE_LABEL } from '@/theme';

import { useColors } from './colors';
import { Icon } from './icon';

/**
 * Material's filter chip in house colours: outlined until picked, then the line fill. No check mark: it
 * widens the chip and reflows the row, and the fill already says it. Put it in a `ChipRow`.
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

/** Material's assist chip on the line fill, with a leading symbol: an action among filter chips. */
export function ActionChip({
  label,
  icon,
  onPress,
}: {
  label: string;
  icon: AndroidSymbol;
  onPress: () => void;
}) {
  const colors = useColors();
  return (
    <AssistChip
      onClick={onPress}
      border={{ width: 0 }}
      colors={{
        containerColor: colors.line,
        labelColor: colors.chalk,
        leadingIconContentColor: colors.chalk,
      }}
    >
      <AssistChip.LeadingIcon>
        <RNHostView matchContents>
          <Icon name={icon} size={18} />
        </RNHostView>
      </AssistChip.LeadingIcon>
      <AssistChip.Label>
        <Text style={COMPOSE_LABEL}>{label}</Text>
      </AssistChip.Label>
    </AssistChip>
  );
}

/** A thin upright rule between chip groups. */
export function ChipDivider() {
  const colors = useColors();
  return <Box modifiers={[size(1, 20), background(colors.line)]} />;
}

/**
 * Chips in a row: `scroll` sideways in one line (inset by `inset` at both ends), or else wrapping, as wide
 * as the parent. Holds `Chip`, `ActionChip` and `ChipDivider`.
 */
export function ChipRow({
  scroll = false,
  inset = 0,
  children,
}: {
  scroll?: boolean;
  inset?: number;
  children: ReactNode;
}) {
  return (
    <Host matchContents={{ vertical: true }}>
      {scroll ? (
        <Row
          horizontalArrangement={{ spacedBy: 8 }}
          verticalAlignment="center"
          modifiers={[horizontalScroll(), padding(inset, 0, inset, 0)]}
        >
          {children}
        </Row>
      ) : (
        <FlowRow
          horizontalArrangement={{ spacedBy: 8 }}
          verticalArrangement={{ spacedBy: 0 }}
          modifiers={[fillMaxWidth()]}
        >
          {children}
        </FlowRow>
      )}
    </Host>
  );
}
