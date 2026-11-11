import { Text, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { Icon } from '@/components/icon';
import { colors } from '@/theme';

import type { Board } from '@/leaderboard/leaderboard';

type Row = Board['rows'][number];

/** Where the places that move start or end: a hairline with its label. */
function Zone({ label }: { label: string }) {
  return (
    <View className="flex-row items-center gap-3 py-2">
      <Text className="font-mono text-xs tracking-widest text-muted">{label}</Text>
      <View className="h-px flex-1 bg-line" />
    </View>
  );
}

function Place({ rank, you, name, image, points }: Row) {
  return (
    <View
      accessible
      accessibilityLabel={`${rank}. ${you ? 'You' : (name ?? 'Hidden athlete')}, ${points} points`}
      className={`h-13 flex-row items-center gap-4 ${you ? '-mx-3 rounded-xl bg-surface px-3' : ''}`}
    >
      <Text
        className={`w-6 font-sans text-xl font-extralight ${you ? 'text-accent' : 'text-soft'}`}
      >
        {rank}
      </Text>
      {name ? (
        <Avatar name={name} image={image} small />
      ) : (
        <View className="size-8 items-center justify-center rounded-full border border-line">
          <Icon name="visibility_off" size={16} color={colors.muted} />
        </View>
      )}
      <Text
        numberOfLines={1}
        className={`flex-1 font-sans text-base ${name ? 'text-chalk' : 'text-muted'}`}
      >
        {name ?? 'Hidden athlete'}
      </Text>
      <Text className="font-mono text-sm text-soft">{points}</Text>
    </View>
  );
}

/** Your board by rank, your place lit, with lines where moving up ends and moving down starts. */
export function Standings({ board }: { board: Board }) {
  const { rows, up, down } = board;
  return (
    <View className="border-t border-line pt-2">
      {rows.map((row, i) => (
        <View key={row.rank}>
          {down > 0 && i === rows.length - down && <Zone label="MOVE DOWN" />}
          <Place {...row} />
          {up > 0 && i === up - 1 && <Zone label="MOVE UP" />}
        </View>
      ))}
    </View>
  );
}
