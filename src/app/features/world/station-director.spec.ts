import type { StationPlate, StationSpec } from '@engine/stations/station';
import { StationDirector } from './station-director';

const plateOf = (title: string): StationPlate => ({
  kicker: 'Station',
  title,
  text: `${title} text`,
  en: `${title} en`,
});

/** Three stations on a line, 10 m apart, each with a 3 m trigger. */
const STATIONS: readonly StationSpec[] = ['one', 'two', 'three'].map((id, i) => ({
  id,
  name: id.toUpperCase(),
  stand: { x: 0, z: -10 * i, yaw: 0 },
  trigger: 3,
  plate: () => plateOf(id),
}));

const FIND = plateOf('find');

describe('StationDirector', () => {
  const states = (director: StationDirector) => director.chips().map((chip) => chip.state);

  it('starts with every station open except the first, which is next', () => {
    const director = new StationDirector(STATIONS);

    expect(states(director)).toEqual(['next', 'open', 'open']);
    expect(director.chips().map((chip) => chip.index)).toEqual([1, 2, 3]);
    expect(director.chips().map((chip) => chip.name)).toEqual(['ONE', 'TWO', 'THREE']);
  });

  it('marks the station the player is inside as here and the next unvisited one as next', () => {
    const director = new StationDirector(STATIONS);

    expect(director.update(0, 1)).toBe(true);

    expect(states(director)).toEqual(['here', 'next', 'open']);
  });

  it('marks a station visited once the player has left it', () => {
    const director = new StationDirector(STATIONS);
    director.update(0, 0);

    director.update(0, -5);

    expect(states(director)).toEqual(['visited', 'next', 'open']);
  });

  it('skips visited stations when choosing the next one', () => {
    const director = new StationDirector(STATIONS);
    director.update(0, -10);
    director.update(0, -5);

    expect(states(director)).toEqual(['next', 'visited', 'open']);
  });

  it("shows the station's plate at the station, the find's elsewhere, else none", () => {
    const director = new StationDirector(STATIONS, (x) => (x > 20 ? FIND : null));

    director.update(0, 0);
    expect(director.plate()).toEqual(plateOf('one'));

    director.update(30, 0);
    expect(director.plate()).toBe(FIND);

    director.update(10, 0);
    expect(director.plate()).toBeNull();
  });

  it('reports no change when nothing changed', () => {
    const director = new StationDirector(STATIONS);
    director.update(0, 0);
    const chips = director.chips();

    expect(director.update(0.5, 0)).toBe(false);
    expect(director.chips()).toBe(chips);
  });

  it('reports a plate whose words changed while the player stood still', () => {
    let title = 'before';
    const stations = [{ ...STATIONS[0], plate: () => plateOf(title) }];
    const director = new StationDirector(stations);
    director.update(0, 0);

    title = 'after';

    expect(director.update(0, 0)).toBe(true);
    expect(director.plate()?.title).toBe('after');
  });

  it('keeps the same plate object while its words stay the same', () => {
    const director = new StationDirector(STATIONS);
    director.update(0, 0);
    const plate = director.plate();

    director.update(0, 0.5);

    expect(director.plate()).toBe(plate);
  });

  it('restores the start on reset', () => {
    const director = new StationDirector(STATIONS, () => FIND);
    director.update(0, 0);
    director.update(0, -10);

    director.reset();

    expect(states(director)).toEqual(['next', 'open', 'open']);
    expect(director.plate()).toBeNull();
  });
});
