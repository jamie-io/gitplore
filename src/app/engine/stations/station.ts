/**
 * Stations: the stops a world lays out for a visitor to walk, or glide, between. The types live in
 * the engine because a scene declares them and the engine glides between them; the bookkeeping of
 * which ones were seen lives in `features/world/station-director.ts`, and the HUD shows the result.
 */

/** A spot on the ground, in world metres. */
export interface GroundPoint {
  readonly x: number;
  readonly z: number;
}

/** Where a glide to a station ends, and which way the visitor faces there (yaw 0 faces −z). */
export interface StationStand extends GroundPoint {
  readonly yaw: number;
}

/** The card the HUD shows while the visitor stands at a station or beside a find. */
export interface StationPlate {
  /** A short line above the title, e.g. `Station 3`. */
  readonly kicker: string;
  readonly title: string;
  /** German, two lines at most. */
  readonly text: string;
  /** English, one line. */
  readonly en: string;
}

export interface StationSpec {
  readonly id: string;
  /** The chip label, e.g. `Commit-Stufen`. */
  readonly name: string;
  readonly stand: StationStand;
  /** Metres from the stand within which the visitor counts as being at the station. */
  readonly trigger: number;
  /** Read each time it is shown, so a plate can follow the world's state and the project's data. */
  readonly plate: () => StationPlate;
}

/** The project's name and one line, shown over the arrival camera. */
export interface ScenePitch {
  readonly title: string;
  readonly line: string;
}

/**
 * How a station chip reads: the visitor is `here`, has `visited` it, it is the `next` one not yet
 * seen, or it is simply `open`.
 */
export type ChipState = 'here' | 'visited' | 'next' | 'open';

/** One chip of the station bar: a snapshot the store can hold as a signal value. */
export interface StationChip {
  /** 1-based, the number key that glides there. */
  readonly index: number;
  readonly id: string;
  readonly name: string;
  readonly state: ChipState;
}
