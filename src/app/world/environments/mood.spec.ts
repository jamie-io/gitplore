import { Scene } from 'three';
import { GRADE_KEY, gradeOf } from '@engine/color-grade';
import {
  DSCHUNGEL,
  GALERIE,
  LICHTUNG,
  Mood,
  PLAZA,
  applyMood,
  clearMood,
  sunDirection,
} from './mood';

const MOODS: readonly { name: string; mood: Mood }[] = [
  { name: 'LICHTUNG', mood: LICHTUNG },
  { name: 'DSCHUNGEL', mood: DSCHUNGEL },
  { name: 'PLAZA', mood: PLAZA },
  { name: 'GALERIE', mood: GALERIE },
];

describe('sunDirection', () => {
  it.each(MOODS)(
    'is a unit vector whose height is the sine of the elevation ($name)',
    ({ mood }) => {
      const direction = sunDirection(mood);

      expect(direction.length()).toBeCloseTo(1, 6);
      expect(direction.y).toBeCloseTo(Math.sin(mood.sun.elevation), 6);
    },
  );

  it('points to −Z at azimuth 0, where an arriving visitor looks', () => {
    const direction = sunDirection({ ...LICHTUNG, sun: { ...LICHTUNG.sun, azimuth: 0 } });

    expect(direction.x).toBeCloseTo(0, 6);
    expect(direction.z).toBeLessThan(0);
  });

  it('swings towards +X for a positive azimuth', () => {
    const direction = sunDirection({ ...LICHTUNG, sun: { ...LICHTUNG.sun, azimuth: 0.5 } });

    expect(direction.x).toBeGreaterThan(0);
  });
});

describe('moods', () => {
  it.each(MOODS)('never fogs $name from further away than it ends', ({ mood }) => {
    expect(mood.fog.far).toBeGreaterThanOrEqual(mood.fog.near);
  });
});

describe('applyMood', () => {
  it('records the grade on the scene and takes it back off when cleared', () => {
    const scene = new Scene();

    applyMood(scene, DSCHUNGEL);
    expect(gradeOf(scene)).toBe(DSCHUNGEL.grade);

    clearMood(scene);
    expect(GRADE_KEY in scene.userData).toBe(false);
  });
});
