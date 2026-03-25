// ─── Tile & Board ──────────────────────────────────────────────────────────────

export interface Tile {
  char: string;        // Internal char (e.g. 'Û' for QU, 'Ł' for L·L)
  displayChar: string; // Display string (e.g. 'QU', 'L·L')
  value: number;
  isBlank: boolean;
}

export interface BoardCell {
  row: number;
  col: number;
  tile: Tile | null;
  multiplier: MultiplierType;
}

export enum MultiplierType {
  None = 'none',
  DoubleLetter = 'dl',
  TripleLetter = 'tl',
  DoubleWord = 'dw',
  TripleWord = 'tw',
  Center = 'center',
}

// ─── Move ──────────────────────────────────────────────────────────────────────

export interface PlacedTile {
  tile: Tile;
  row: number;
  col: number;
}

export interface Move {
  id: string;
  playerId: string;
  playerName: string;
  word: string;
  tiles: Tile[];
  placedTiles: PlacedTile[];
  row: number;
  col: number;
  direction: 'H' | 'V';
  score: number;
  timestamp: number;
  turnNumber: number;
  isValid: boolean;
  isPass?: boolean;
  isSwap?: boolean;
  swappedTiles?: string[];
  isChallenged?: boolean;
  challengeResult?: 'valid' | 'invalid';
  challengedBy?: string;
  error?: string;
}

// ─── Player ────────────────────────────────────────────────────────────────────

export interface Player {
  id: string;
  name: string;
  email: string;
  totalScore: number;
  isReady: boolean;
  isConnected: boolean;
  consecutivePasses: number;
}

// ─── Game Config ───────────────────────────────────────────────────────────────

export type GameMode =
  | 'classica'          // 2–4 jugadors, torns
  | 'classica_1v1'      // 2 jugadors + sistema impugnació
  | 'duplicada_solo'    // 1 jugador, format duplicada
  | 'entrenament';      // 1 jugador, IA sempre visible

export interface GameConfig {
  mode: GameMode;
  maxPlayers: number;
  allowChallenge: boolean;         // Sistema impugnació (1v1)
  challengeWindowSeconds: number;  // Finestra per impugnar (default 15s)
  turnTimerSeconds: number;        // 0 = sense límit
  dictionary: 'DISC' | 'LEXIMOTS';
  masterPassword?: string;         // Opcional
}

// ─── Game State ────────────────────────────────────────────────────────────────

export type GameStatus =
  | 'LOBBY'       // Esperant jugadors
  | 'PLAYING'     // Partida en curs
  | 'CHALLENGE'   // Impugnació en curs
  | 'PAUSED'
  | 'FINISHED';

export interface ChallengeState {
  challengerId: string;
  challengedMoveId: string;
  deadline: number;  // timestamp
  result?: 'valid' | 'invalid';
}

export interface GameState {
  id: string;
  config: GameConfig;
  status: GameStatus;
  createdAt: number;
  hostName: string;

  // Tauler i bossa
  board: BoardCell[][];
  bag: string[];           // Fitxes restants (array, pop() per agafar)

  // Jugadors i torns
  players: Record<string, Player>;
  turnOrder: string[];           // [pid1, pid2, ...]
  currentTurn: string;           // playerId actiu
  turnNumber: number;
  consecutivePasses: number;     // Global — 4 consecutius = fi de partida

  // Faristols (privats per jugador, protegits per regles Firebase)
  racks: Record<string, string[]>;

  // Jugada activa (visible per tots un cop confirmada)
  lastMove: Move | null;
  challenge: ChallengeState | null;

  // Historial
  history: Move[];

  // Mode duplicada_solo / entrenament
  currentRack?: string[];        // Faristol únic (modes solo)
  timerEndTime?: number | null;
  timerPausedRemaining?: number | null;
}

// ─── UI helpers ────────────────────────────────────────────────────────────────

export interface ScoreResult {
  score: number;
  isValid: boolean;
  words: string[];
  error?: string;
}

// ─── PlayerMove (ús intern scrabbleUtils) ──────────────────────────────────────

export interface PlayerMove {
  id?: string;
  playerId?: string;
  playerName?: string;
  tableNumber?: string;
  row: number;
  col: number;
  direction: 'H' | 'V';
  tiles: Tile[];
  word?: string;
  score?: number;
  timestamp?: number;
  [key: string]: unknown;
}

// ─── Re-exports des de constants (per compatibilitat amb scrabbleUtils) ────────

export { LETTER_VALUES, DIGRAPH_MAP, REVERSE_DIGRAPH_MAP } from './constants';
