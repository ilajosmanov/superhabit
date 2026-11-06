/** A challenge you joined: today is `day` of `days`. Days before today are done. */
export type Joined = { id: string; day: number; days: number; doneToday: boolean };

// shortcut: fake progress to design the Challenges tab against; replace with the data layer and delete this file.
export const MOCK_JOINED = {
  none: [],
  one: [{ id: 'squat-pushup', day: 4, days: 30, doneToday: false }],
  many: [
    { id: 'full-body-dozen', day: 9, days: 45, doneToday: false },
    { id: 'squat-hundred', day: 12, days: 21, doneToday: true },
    { id: 'squat-pushup', day: 4, days: 30, doneToday: false },
    { id: 'pushup-fifty', day: 2, days: 21, doneToday: false },
  ],
} satisfies Record<string, readonly Joined[]>;

export type MockState = keyof typeof MOCK_JOINED;
