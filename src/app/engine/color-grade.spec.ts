import { Scene } from 'three';
import { GRADE_KEY, NEUTRAL_GRADE, gradeOf, setGrade } from './color-grade';

describe('colour grade', () => {
  it('is neutral for a scene that asked for nothing', () => {
    expect(gradeOf(new Scene())).toBe(NEUTRAL_GRADE);
  });

  it('reads back what a scene asked for, and forgets it when cleared', () => {
    const scene = new Scene();
    const warm = { ...NEUTRAL_GRADE, warmth: 0.2 };

    setGrade(scene, warm);
    expect(gradeOf(scene)).toBe(warm);

    setGrade(scene, null);
    expect(GRADE_KEY in scene.userData).toBe(false);
  });
});
