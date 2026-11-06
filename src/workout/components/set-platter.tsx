import { View } from 'react-native';

import { GLASS } from './controls';
import { LiveSet } from './live-set';
import { PausedSet } from './paused-set';
import type { PlatterProps } from './platter-header';
import { PositionCheck } from './position-check';

/** The floating card beside (landscape) or under (portrait) the camera: position check, live set or paused. */
export function SetPlatter(props: PlatterProps) {
  const { view, landscape } = props;
  return (
    <View className={`gap-3 rounded-4xl ${GLASS} ${landscape ? 'w-62 p-4' : 'p-5'}`}>
      {view.stage === 'paused' ? (
        <PausedSet {...props} />
      ) : view.phase === 'waiting' && !view.started ? (
        <PositionCheck {...props} />
      ) : (
        <LiveSet {...props} />
      )}
    </View>
  );
}
