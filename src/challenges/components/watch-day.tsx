import {
  AlertDialog,
  Host,
  Text as ComposeText,
  TextButton as ComposeTextButton,
} from '@expo/ui/jetpack-compose';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { SwipeRow } from './swipe-row';
import { capitalise, type detail } from '@/challenges/challenges';
import { IconButton } from '@/components/icon-button';
import { ExerciseFigure } from '@/components/illustrations';
import { EXERCISES } from '@/exercises/registry';
import { colors } from '@/theme';

const CARD = 152;

type Step = ReturnType<typeof detail>['sets'][number];

// shortcut: kept videos sit in one folder with nothing tying them to a challenge day, so the cards show
// each set's result and a tap says videos are coming; play the set in full screen once sessions are
// stored with their videos.
/**
 * Under a day you tried: a frame per set you did, in session order, to swipe through like a reel. `done`
 * is what each set got (`setAmounts`); sets left at nothing were never filmed, so they are left out.
 */
export function WatchDay({
  label,
  sets,
  done,
}: {
  label: string;
  sets: readonly Step[];
  done: readonly number[];
}) {
  const [open, setOpen] = useState(false);
  const filmed = sets.flatMap((set, i) => (done[i] > 0 ? [{ set, got: done[i], n: i + 1 }] : []));
  if (filmed.length === 0) return null;
  return (
    <View className="gap-3">
      <View className="flex-row justify-between">
        <Text className="font-mono text-xs tracking-widest text-muted">{label}</Text>
        <Text className="font-mono text-xs tracking-widest text-muted">COMING SOON</Text>
      </View>
      <SwipeRow itemWidth={CARD}>
        {filmed.map(({ set, got, n }) => (
          <Frame key={n} set={set} got={got} n={n} onPress={() => setOpen(true)} />
        ))}
      </SwipeRow>
      {open && (
        // Out of the page's flow: the dialog draws in its own window, but its host would take a slot.
        <Host matchContents style={{ position: 'absolute' }}>
          <AlertDialog
            onDismissRequest={() => setOpen(false)}
            colors={{
              containerColor: colors.surface,
              titleContentColor: colors.chalk,
              textContentColor: colors.soft,
            }}
          >
            <AlertDialog.Title>
              <ComposeText style={{ fontFamily: 'Geist', fontSize: 22 }}>
                Watching sets is coming
              </ComposeText>
            </AlertDialog.Title>
            <AlertDialog.Text>
              <ComposeText style={{ fontFamily: 'Geist', fontSize: 15 }}>
                Your sets are filmed and kept on this phone. Soon each one plays back here, full
                screen.
              </ComposeText>
            </AlertDialog.Text>
            <AlertDialog.ConfirmButton>
              <ComposeTextButton onClick={() => setOpen(false)}>
                <ComposeText
                  color={colors.chalk}
                  style={{ fontFamily: 'Geist', fontWeight: '500', fontSize: 15 }}
                >
                  OK
                </ComposeText>
              </ComposeTextButton>
            </AlertDialog.ConfirmButton>
          </AlertDialog>
        </Host>
      )}
    </View>
  );
}

/** One set as a video frame: the figure where the picture will be, a play disc, and what it got. */
function Frame({
  set,
  got,
  n,
  onPress,
}: {
  set: Step;
  got: number;
  n: number;
  onPress: () => void;
}) {
  const { name, kind } = EXERCISES[set.exercise];
  // Held seconds are kept exact; the frame shows whole ones.
  const amount = `${Math.floor(got)} ${kind === 'hold' ? 'S' : got === 1 ? 'REP' : 'REPS'}`;
  const round = set.rounds > 1 ? ` · ROUND ${set.round}` : '';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Set ${n}, ${name}${round.toLowerCase()}, ${amount.toLowerCase()}. Video coming soon`}
      onPress={onPress}
      style={{ width: CARD }}
      className="gap-2.5"
    >
      <View className="h-48 items-center justify-center overflow-hidden rounded-2xl border border-line bg-surface">
        <ExerciseFigure exercise={set.exercise} size={112} weight={0.9} color={colors.faint} />
        <Text className="absolute left-3 top-3 font-mono text-xs tracking-widest text-muted">
          {`SET ${n}`}
        </Text>
        {/* Material's filled icon button: it centres the symbol in its disc. 48dp target, 36dp disc.
            Hidden from TalkBack: the card is the same button, with the full label. */}
        <View
          importantForAccessibility="no-hide-descendants"
          style={{ position: 'absolute', right: 6, bottom: 6 }}
        >
          <IconButton
            icon="play_arrow"
            label={`Play set ${n}`}
            size={18}
            fill={colors.ground}
            diameter={36}
            onPress={onPress}
          />
        </View>
      </View>
      <View className="gap-1 px-1">
        <Text numberOfLines={1} className="font-sans text-base text-chalk">
          {capitalise(name)}
        </Text>
        <Text className="font-mono text-xs tracking-widest text-muted">{`${amount}${round}`}</Text>
      </View>
    </Pressable>
  );
}
