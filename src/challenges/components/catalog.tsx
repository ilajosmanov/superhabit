import {
  AssistChip,
  Box,
  Host,
  RNHostView,
  Row,
  Text as ComposeText,
} from '@expo/ui/jetpack-compose';
import { background, horizontalScroll, padding, size } from '@expo/ui/jetpack-compose/modifiers';
import { Link, useRouter } from 'expo-router';
import { useRef, useState, type ReactNode } from 'react';
import { Text, View, type ScrollViewInstance, type ViewStyle } from 'react-native';

import { ExerciseRow } from './exercise-row';
import { Chip } from '@/components/chip';
import { Icon } from '@/components/icon';
import { useColors } from '@/components/colors';
import { GUTTER } from '@/components/screen';
import { tick } from '@/components/tick';
import { filterCatalog, type CatalogEntry, type Kind } from '@/challenges/catalog';
import { COMPOSE_LABEL } from '@/theme';

/**
 * A soft fill, no outline or glow: those mean you joined it. The exercise and its daily goal in its own
 * unit (a circuit: its exercises and rounds), and the length in days.
 */
function ChallengeCard({ entry }: { entry: CatalogEntry }) {
  const single = entry.steps.length === 1 ? entry.steps[0] : null;
  const frequency = entry.days === 1 ? 'in one go' : entry.schedule ? 'on training days' : 'a day';
  const line = single
    ? `${single.goal.toUpperCase()} ${frequency.toUpperCase()}`
    : (entry.schedule ?? entry.note ?? `${entry.steps.length} STEPS`);
  const what = single
    ? `${single.name} ${single.goal} ${frequency}`
    : entry.steps.map((step) => step.name).join(', ');
  return (
    <Link href={{ pathname: '/challenge/[id]', params: { id: entry.id } }} asChild>
      <ExerciseRow
        accessibilityRole="link"
        accessibilityLabel={`${entry.name}: ${what}, ${entry.days} ${entry.days === 1 ? 'day' : 'days'}${entry.schedule ? `, ${entry.schedule}` : ''}`}
        name={entry.name}
        line={line}
        steps={entry.steps}
        amount={entry.workload?.amount ?? entry.days}
        unit={entry.workload?.unit ?? (entry.days === 1 ? 'DAY' : 'DAYS')}
      />
    </Link>
  );
}

/** Bar work we don't count yet: a dashed card, not a link. */
function ComingSoon() {
  const colors = useColors();
  return (
    <View
      accessible
      accessibilityLabel="Pull-ups and dips: coming soon, needs a bar"
      className="flex-row items-center gap-4 rounded-2xl border border-dashed border-line py-4 pl-4 pr-5"
    >
      <View className="size-11 items-center justify-center rounded-xl border border-line">
        <Icon name="schedule" size={24} color={colors.muted} />
      </View>
      <View className="flex-1 gap-1">
        <Text className="font-sans text-lg tracking-tight text-muted">Pull-ups and dips</Text>
        <Text className="font-mono text-xs tracking-wide text-muted">
          COMING SOON · NEEDS A BAR
        </Text>
      </View>
    </View>
  );
}

const LABELS: Record<Kind, string> = {
  all: 'All',
  Training: 'Training',
  'Advanced challenges': 'Advanced',
  'Daily goals': 'Daily goals',
  yours: 'Made by you',
};

type Filter = ReturnType<typeof useCatalogFilter>;

/**
 * The picked chip and the catalog it shows. A pick while the chips are pinned scrolls back to the new
 * list's first card; a short list just ends, and the scroll settles as far down as it reaches. Hand
 * `scroll` to `Screen`.
 */
export function useCatalogFilter(entries: readonly CatalogEntry[]) {
  const [kind, setKind] = useState<Kind>('all');
  const view = filterCatalog(entries, kind);
  // A picked chip that emptied shows All. Forget it, or it would come back with its entries.
  if (view.shown !== kind) setKind(view.shown);
  const ref = useRef<ScrollViewInstance>(null);
  // The scroll offset, the chip row's height and the list's top: read on a tap, never drawn.
  const at = useRef({ y: 0, chips: 0, list: 0 });
  return {
    view,
    scroll: {
      ref,
      onY: (y: number) => {
        at.current.y = y;
      },
    },
    onChipsHeight: (chips: number) => {
      at.current.chips = chips;
    },
    onListTop: (y: number) => {
      at.current.list = y;
    },
    pick: (next: Kind) => {
      if (next === kind) return;
      tick();
      setKind(next);
      // Where the chips pin, with the first card under them.
      const start = at.current.list - at.current.chips - UNDER_CHIPS;
      if (at.current.y > start) ref.current?.scrollTo({ y: start, animated: false });
    },
  };
}

// Screen spaces its sections 32 apart; the list sits 8 under the chip row (16 under the chips).
const UNDER_CHIPS = 8;

/**
 * The filter row's place on the screen: out to both edges, and 8 higher so its padding doesn't widen
 * the gap above. Pass it as `CatalogFilters`' own `style`: a pinned child's style moves to the sticky
 * wrapper, so the row's whole box stays inside it and takes touches at the edges too.
 */
export const FILTERS_STYLE = { marginHorizontal: -GUTTER, marginTop: -8 } as const;

/**
 * The catalog's header: Create, a hairline, then a filter chip per kind with its count. Pass it to
 * `Screen` as the `pin`ned child, with `style={FILTERS_STYLE}`: it stays under the label row.
 */
export function CatalogFilters({ filter, style }: { filter: Filter; style?: ViewStyle }) {
  const colors = useColors();
  const router = useRouter();
  return (
    <View style={style}>
      {/* The opaque ground covers the cards scrolling beneath once it pins. */}
      <View
        onLayout={(event) => filter.onChipsHeight(event.nativeEvent.layout.height)}
        style={{ paddingVertical: 8, backgroundColor: colors.ground }}
      >
        <Host matchContents={{ vertical: true }}>
          <Row
            horizontalArrangement={{ spacedBy: 8 }}
            verticalAlignment="center"
            modifiers={[horizontalScroll(), padding(GUTTER, 0, GUTTER, 0)]}
          >
            <AssistChip
              onClick={() => router.push('/create')}
              border={{ width: 0 }}
              colors={{
                containerColor: colors.line,
                labelColor: colors.chalk,
                leadingIconContentColor: colors.chalk,
              }}
            >
              <AssistChip.LeadingIcon>
                <RNHostView matchContents>
                  <Icon name="add" size={18} />
                </RNHostView>
              </AssistChip.LeadingIcon>
              <AssistChip.Label>
                <ComposeText style={COMPOSE_LABEL}>Create</ComposeText>
              </AssistChip.Label>
            </AssistChip>
            <Box modifiers={[size(1, 20), background(colors.line)]} />
            {filter.view.chips.map(({ kind, count }) => (
              <Chip
                key={kind}
                label={LABELS[kind]}
                count={count}
                selected={filter.view.shown === kind}
                // You joined every one of ours in it: nothing to show. All stays live, even empty.
                enabled={kind === 'all' || count > 0}
                onPress={() => filter.pick(kind)}
              />
            ))}
          </Row>
        </Host>
      </View>
    </View>
  );
}

// Out of the flow, see-through, untouchable and silent to TalkBack, but still built.
const HIDDEN = {
  position: 'absolute',
  left: 0,
  right: 0,
  opacity: 0,
  pointerEvents: 'none',
} as const;

/**
 * A card the picked chip may hide. Measured on an S25 dev build (perfetto, 2026-11-13): mounting a
 * dozen cards on a tap took ~135 ms of JS and a 45 ms frame; `display: none` still cost a 23–40 ms
 * frame; hiding built cards like this costs ~22 ms. `collapsable={false}` keeps the opacity swap from
 * flattening the view, which would re-parent the card.
 */
function Shown({ on, children }: { on: boolean; children: ReactNode }) {
  return (
    <View
      collapsable={false}
      importantForAccessibility={on ? 'auto' : 'no-hide-descendants'}
      accessibilityElementsHidden={!on}
      style={on ? undefined : HIDDEN}
    >
      {children}
    </View>
  );
}

/** Every card, the picked chip's shown; All ends with the bar work we don't count yet. */
export function Catalog({ filter }: { filter: Filter }) {
  return (
    <View
      className="gap-2.5"
      // style, not className: a swapped class remounts the view.
      style={{ marginTop: UNDER_CHIPS - 32 }}
      onLayout={(event) => filter.onListTop(event.nativeEvent.layout.y)}
    >
      {filter.view.order.map(({ entry, on }) => (
        <Shown key={entry.id} on={on}>
          <ChallengeCard entry={entry} />
        </Shown>
      ))}
      <Shown on={filter.view.shown === 'all'}>
        <ComingSoon />
      </Shown>
    </View>
  );
}
