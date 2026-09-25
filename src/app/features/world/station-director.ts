import type { ChipState, StationChip, StationPlate, StationSpec } from '@engine/stations/station';

// The chip types are declared beside the stations, so the store can hold them without importing
// `features/`; they are re-exported here because this is where they are made.
export type { ChipState, StationChip } from '@engine/stations/station';

/**
 * Keeps track of a world's stations as the visitor moves (spec §2): which one they are at now,
 * which they have been to since arriving or restarting, and which one comes next. It also picks
 * the plate to show — the station's own inside its trigger, else whatever find the scene reports.
 *
 * It runs every frame but allocates only when something changed, so the store is written only then.
 */
export class StationDirector {
  private readonly visited: boolean[];
  /** Index into `stations` of the one the visitor stands at, or −1. */
  private here = -1;
  private currentChips: readonly StationChip[] = [];
  private currentPlate: StationPlate | null = null;

  constructor(
    private readonly stations: readonly StationSpec[],
    private readonly plateAt?: (x: number, z: number) => StationPlate | null,
  ) {
    this.visited = stations.map(() => false);
    this.currentChips = this.buildChips();
  }

  /** Returns true when chips or plate changed since the last call. */
  update(x: number, z: number): boolean {
    const here = this.stationAt(x, z);
    let chipsChanged = false;
    if (here !== this.here) {
      this.here = here;
      if (here >= 0) {
        this.visited[here] = true;
      }
      this.currentChips = this.buildChips();
      chipsChanged = true;
    }

    const plate = here >= 0 ? this.stations[here].plate() : (this.plateAt?.(x, z) ?? null);
    // Compared by its words, not its identity: a plate function may build a fresh object on every
    // call, and one whose words changed in place (a switched wall, a new count) must still show.
    const plateChanged = !samePlate(plate, this.currentPlate);
    if (plateChanged) {
      this.currentPlate = plate;
    }

    return chipsChanged || plateChanged;
  }

  chips(): readonly StationChip[] {
    return this.currentChips;
  }

  plate(): StationPlate | null {
    return this.currentPlate;
  }

  /** Back to the state on arrival: nothing visited, nowhere, no plate. */
  reset(): void {
    this.visited.fill(false);
    this.here = -1;
    this.currentPlate = null;
    this.currentChips = this.buildChips();
  }

  /** The station whose trigger holds (x, z), the nearest one where two overlap; −1 for none. */
  private stationAt(x: number, z: number): number {
    let found = -1;
    let nearest = Infinity;
    // Every frame: an indexed loop, with no callback to allocate.
    for (let index = 0; index < this.stations.length; index++) {
      const station = this.stations[index]!;
      const distance = Math.hypot(x - station.stand.x, z - station.stand.z);
      if (distance <= station.trigger && distance < nearest) {
        found = index;
        nearest = distance;
      }
    }
    return found;
  }

  private buildChips(): readonly StationChip[] {
    const next = this.visited.findIndex((seen, index) => !seen && index !== this.here);
    return this.stations.map((station, index) => ({
      index: index + 1,
      id: station.id,
      name: station.name,
      state: this.stateOf(index, next),
    }));
  }

  private stateOf(index: number, next: number): ChipState {
    if (index === this.here) {
      return 'here';
    }
    if (this.visited[index]) {
      return 'visited';
    }
    return index === next ? 'next' : 'open';
  }
}

function samePlate(a: StationPlate | null, b: StationPlate | null): boolean {
  if (a === b) {
    return true;
  }
  if (!a || !b) {
    return false;
  }
  return a.kicker === b.kicker && a.title === b.title && a.text === b.text && a.en === b.en;
}
