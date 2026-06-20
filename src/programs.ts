export interface BroadcastProgram {
  id: string;
  title: string;
  description: string;
  theme: string;
  topicsText: string;
  intervalSeconds: number;
  teacherMode: boolean;
}

export const DEFAULT_BROADCAST_PROGRAMS: BroadcastProgram[] = [
  {
    id: 'sample-intro',
    title: 'Sample VTuber Program',
    description: 'A small sample program used when no local storage data exists.',
    theme:
      'A friendly AI VTuber explains the purpose of this broadcast system and how to customize it.',
    topicsText: [
      'Hello. This is a sample VTuber broadcast program.',
      'You can replace this script with your own local program data in storage/programs.json.',
      'The viewer can be captured by OBS, Playwright, or an RTMP pipeline for scheduled streaming.',
      'Keep production scripts, private avatars, stream keys, and generated media outside this repository.',
    ].join('\n'),
    intervalSeconds: 3,
    teacherMode: true,
  },
];

export function findBroadcastProgram(id: string) {
  return DEFAULT_BROADCAST_PROGRAMS.find((program) => program.id === id);
}
