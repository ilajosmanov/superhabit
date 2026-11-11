import type { AndroidSymbol } from 'expo-symbols';
import { Text, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { Icon } from '@/components/icon';
import { ABOVE, BELOW, type Board } from '@/leaderboard/leaderboard';
import { colors } from '@/theme';

type Row = Board['rows'][number];

type Part = { label: string; icon: AndroidSymbol; lit: boolean; rows: Row[] };

/** The board's parts: who moves up, who stays, who drops, each headed by what it means. */
function zones({ rows, league, up, down }: Board): Part[] {
  const above = ABOVE[league];
  const below = BELOW[league];
  const stay: Part = {
    label: `STAY IN ${league}`,
    icon: 'remove',
    lit: false,
    rows: rows.slice(up, rows.length - down),
  };
  // Nobody moves yet: one list, no heading.
  if (up === 0 && down === 0) return [{ ...stay, label: '' }];
  return [
    ...(above && up > 0
      ? [
          {
            label: `MOVE UP TO ${above}`,
            icon: 'arrow_upward',
            lit: true,
            rows: rows.slice(0, up),
          } satisfies Part,
        ]
      : []),
    stay,
    ...(below && down > 0
      ? [
          {
            label: `DROP TO ${below}`,
            icon: 'arrow_downward',
            lit: false,
            rows: rows.slice(rows.length - down),
          } satisfies Part,
        ]
      : []),
  ];
}

function Place({ row, top, hidden }: { row: Row; top: number; hidden: boolean }) {
  const { rank, you, name, image, points } = row;
  // Ties at 0 are ordered by id: a place there means nothing.
  const place = points > 0 ? String(rank) : '–';
  return (
    <View
      accessible
      accessibilityLabel={`${points > 0 ? `${rank}. ` : ''}${you ? (hidden ? 'You, hidden from others' : 'You') : (name ?? 'Hidden athlete')}, ${points} points`}
      className={`h-13 flex-row items-center gap-3.5 ${you ? '-mx-3 rounded-xl bg-surface px-3' : ''}`}
    >
      <Text
        className={`w-7 font-sans text-xl font-extralight ${you ? 'text-accent' : 'text-soft'}`}
      >
        {place}
      </Text>
      {name ? (
        <Avatar name={name} image={image} small lit={you} />
      ) : (
        <View className="size-8 items-center justify-center rounded-full border border-line">
          <Icon name="visibility_off" size={16} color={colors.faint} />
        </View>
      )}
      <View className="flex-1 gap-1.5">
        <View className="flex-row items-center gap-1.5">
          <Text
            numberOfLines={1}
            className={`shrink font-sans text-base ${name ? 'text-chalk' : 'text-muted'}`}
          >
            {name ?? 'Hidden athlete'}
          </Text>
          {/* You see your own name; the crossed eye says the others don't. */}
          {you && hidden && <Icon name="visibility_off" size={14} color={colors.faint} />}
        </View>
        {points > 0 && (
          // Sized by points against first place: the board's shape at a glance.
          <View
            className="h-0.5 rounded-full"
            style={{
              width: `${Math.max(2, Math.round((points / top) * 100))}%`,
              backgroundColor: you ? colors.accent : colors.edge,
            }}
          />
        )}
      </View>
      <Text className={`font-mono text-sm ${you ? 'text-chalk' : 'text-soft'}`}>{points}</Text>
    </View>
  );
}

/**
 * Your board by rank in its parts (move up, stay, drop), each headed by what it means; your place lit, a
 * hairline under each name sized by points. `hidden`: others see you as Hidden athlete.
 */
export function Standings({ board, hidden }: { board: Board; hidden: boolean }) {
  const top = board.rows[0]?.points ?? 0;
  return (
    <View>
      {zones(board).map(({ label, icon, lit, rows }) => (
        <View key={icon} className="mb-4">
          {label !== '' && (
            <View className="h-11 flex-row items-center justify-between border-b border-line">
              <Text
                accessibilityRole="header"
                className={`font-mono text-xs tracking-widest ${lit ? 'text-chalk' : 'text-muted'}`}
              >
                {label.toUpperCase()}
              </Text>
              <Icon name={icon} size={18} color={lit ? colors.chalk : colors.muted} />
            </View>
          )}
          <View className={label !== '' ? 'pt-1' : 'border-t border-line pt-1'}>
            {rows.map((row) => (
              <Place key={row.rank} row={row} top={top} hidden={hidden} />
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}
