import { db } from '../firebaseConfig';
import { GameState, GameConfig, GameMode, Player, Move, BoardCell } from '../types';
import { createInitialBoard, calculateRemainingBag, shuffleArray } from '../utils/scrabbleUtils';
import { TILE_COUNTS } from '../constants';

// ─── Helpers ──────────────────────────────────────────────────────────────────

export const emailToId = (email: string): string =>
  email.toLowerCase().replace(/[^a-z0-9]/g, '_');

const initialBag = (): string[] => {
  const bag: string[] = [];
  Object.entries(TILE_COUNTS).forEach(([char, count]) => {
    for (let i = 0; i < count; i++) bag.push(char);
  });
  return shuffleArray(bag);
};

const DEFAULT_CONFIG: Omit<GameConfig, 'mode'> = {
  maxPlayers: 4,
  allowChallenge: false,
  challengeWindowSeconds: 15,
  turnTimerSeconds: 0,
  dictionary: 'DISC',
};

// ─── Crear partida ────────────────────────────────────────────────────────────

export const createGame = async (
  hostName: string,
  mode: GameMode,
  configOverrides: Partial<GameConfig> = {}
): Promise<string> => {
  const ref = db.ref('games').push();
  const gameId = ref.key!;

  const config: GameConfig = {
    ...DEFAULT_CONFIG,
    mode,
    maxPlayers: mode === 'classica_1v1' ? 2 : configOverrides.maxPlayers ?? 4,
    allowChallenge: mode === 'classica_1v1' ? (configOverrides.allowChallenge ?? false) : false,
    ...configOverrides,
  };

  const board: BoardCell[][] = createInitialBoard();
  const bag = initialBag();

  const initialState: Omit<GameState, 'racks'> = {
    id: gameId,
    config,
    status: 'LOBBY',
    createdAt: Date.now(),
    hostName,
    board,
    bag,
    players: {},
    turnOrder: [],
    currentTurn: '',
    turnNumber: 0,
    consecutivePasses: 0,
    lastMove: null,
    challenge: null,
    history: [],
  };

  await ref.set(initialState);
  await db.ref(`publicGames/${gameId}`).set({
    id: gameId,
    hostName,
    mode,
    status: 'LOBBY',
    createdAt: Date.now(),
    playerCount: 0,
  });

  return gameId;
};

// ─── Registrar jugador ────────────────────────────────────────────────────────

export const joinGame = async (
  gameId: string,
  player: { id: string; name: string; email: string }
): Promise<void> => {
  const gameRef = db.ref(`games/${gameId}`);
  const snap = await gameRef.once('value');
  const game: GameState = snap.val();

  if (!game) throw new Error('Partida no trobada');
  if (game.status !== 'LOBBY') throw new Error('La partida ja ha començat');
  const currentPlayers = Object.keys(game.players || {}).length;
  if (currentPlayers >= game.config.maxPlayers) throw new Error('Partida plena');

  const newPlayer: Player = {
    id: player.id,
    name: player.name,
    email: player.email,
    totalScore: 0,
    isReady: false,
    isConnected: true,
    consecutivePasses: 0,
  };

  await db.ref(`games/${gameId}/players/${player.id}`).set(newPlayer);
};

// ─── Iniciar partida ──────────────────────────────────────────────────────────

export const startGame = async (gameId: string): Promise<void> => {
  const snap = await db.ref(`games/${gameId}`).once('value');
  const game: GameState = snap.val();

  const playerIds = Object.keys(game.players);
  if (playerIds.length < 2 && game.config.mode !== 'entrenament' && game.config.mode !== 'duplicada_solo') {
    throw new Error('Calen almenys 2 jugadors');
  }

  const shuffledOrder = shuffleArray(playerIds);
  const bag = [...game.bag];

  // Repartir 7 fitxes a cada jugador
  const racks: Record<string, string[]> = {};
  for (const pid of shuffledOrder) {
    racks[pid] = bag.splice(0, 7);
  }

  await db.ref(`games/${gameId}`).update({
    status: 'PLAYING',
    turnOrder: shuffledOrder,
    currentTurn: shuffledOrder[0],
    turnNumber: 1,
    bag,
    racks,
  });

  await db.ref(`publicGames/${gameId}/status`).set('PLAYING');
};

// ─── Enviar jugada ────────────────────────────────────────────────────────────

export const submitMove = async (
  gameId: string,
  move: Move,
  newRack: string[],
  drawnTiles: string[]
): Promise<void> => {
  const updates: Record<string, any> = {};
  const snap = await db.ref(`games/${gameId}`).once('value');
  const game: GameState = snap.val();

  const bag = [...game.bag];
  const drawn = bag.splice(0, drawnTiles.length);

  // Avançar torn
  const currentIndex = game.turnOrder.indexOf(game.currentTurn);
  const nextIndex = (currentIndex + 1) % game.turnOrder.length;
  const nextTurn = game.turnOrder[nextIndex];

  updates[`games/${gameId}/board`] = move.isPass || move.isSwap ? game.board : applyMoveToBoard(game.board, move);
  updates[`games/${gameId}/bag`] = bag;
  updates[`games/${gameId}/racks/${move.playerId}`] = newRack;
  updates[`games/${gameId}/lastMove`] = move;
  updates[`games/${gameId}/currentTurn`] = nextTurn;
  updates[`games/${gameId}/turnNumber`] = game.turnNumber + 1;
  updates[`games/${gameId}/consecutivePasses`] = (move.isPass || move.isSwap)
    ? (game.consecutivePasses + 1) : 0;
  updates[`games/${gameId}/players/${move.playerId}/totalScore`] =
    (game.players[move.playerId]?.totalScore ?? 0) + move.score;
  updates[`games/${gameId}/history/${game.turnNumber}`] = move;

  // Fi de partida: bossa buida + faristol buit, o 4 passes consecutius
  const newConsecutivePasses = updates[`games/${gameId}/consecutivePasses`];
  const rackEmpty = newRack.length === 0 && bag.length === 0;
  const allPassed = newConsecutivePasses >= game.turnOrder.length * 2;

  if (rackEmpty || allPassed) {
    updates[`games/${gameId}/status`] = 'FINISHED';
    await db.ref(`publicGames/${gameId}/status`).set('FINISHED');
  }

  // Finestra d'impugnació
  if (game.config.allowChallenge && !move.isPass && !move.isSwap) {
    updates[`games/${gameId}/status`] = 'CHALLENGE';
    updates[`games/${gameId}/challenge`] = {
      challengerId: nextTurn,
      challengedMoveId: move.id,
      deadline: Date.now() + game.config.challengeWindowSeconds * 1000,
    };
  } else {
    updates[`games/${gameId}/status`] = 'PLAYING';
    updates[`games/${gameId}/challenge`] = null;
  }

  await db.ref().update(updates);
};

// ─── Impugnació ───────────────────────────────────────────────────────────────

export const resolveChallenge = async (
  gameId: string,
  result: 'valid' | 'invalid'
): Promise<void> => {
  const snap = await db.ref(`games/${gameId}`).once('value');
  const game: GameState = snap.val();
  const updates: Record<string, any> = {};

  if (result === 'invalid') {
    // Jugada invàlida: el jugador retira fitxes i perd els punts
    const move = game.lastMove!;
    updates[`games/${gameId}/board`] = game.board; // revert no trivial — simplificat: el màster gestiona
    updates[`games/${gameId}/players/${move.playerId}/totalScore`] =
      (game.players[move.playerId]?.totalScore ?? 0) - move.score;
    updates[`games/${gameId}/history/${move.turnNumber}/challengeResult`] = 'invalid';
  } else {
    // Jugada vàlida: el retador perd el torn (ja s'ha avançat, penalitzem el currentTurn)
    updates[`games/${gameId}/history/${game.lastMove!.turnNumber}/challengeResult`] = 'valid';
  }

  updates[`games/${gameId}/challenge`] = null;
  updates[`games/${gameId}/status`] = 'PLAYING';

  await db.ref().update(updates);
};

// ─── Canviar fitxes ───────────────────────────────────────────────────────────

export const swapTiles = async (
  gameId: string,
  playerId: string,
  tilesToSwap: string[]
): Promise<void> => {
  const snap = await db.ref(`games/${gameId}`).once('value');
  const game: GameState = snap.val();
  const bag = shuffleArray([...game.bag, ...tilesToSwap]);
  const newTiles = bag.splice(0, tilesToSwap.length);
  const currentRack = (game.racks?.[playerId] || []).filter(t => !tilesToSwap.includes(t));
  const newRack = [...currentRack, ...newTiles];

  const move: Move = {
    id: Date.now().toString(),
    playerId,
    playerName: game.players[playerId]?.name ?? '',
    word: '',
    tiles: [],
    placedTiles: [],
    row: 0, col: 0, direction: 'H',
    score: 0,
    timestamp: Date.now(),
    turnNumber: game.turnNumber,
    isValid: true,
    isSwap: true,
    swappedTiles: tilesToSwap,
  };

  await submitMove(gameId, move, newRack, newTiles);
};

// ─── Passar torn ─────────────────────────────────────────────────────────────

export const passTurn = async (gameId: string, playerId: string): Promise<void> => {
  const snap = await db.ref(`games/${gameId}`).once('value');
  const game: GameState = snap.val();

  const move: Move = {
    id: Date.now().toString(),
    playerId,
    playerName: game.players[playerId]?.name ?? '',
    word: '',
    tiles: [],
    placedTiles: [],
    row: 0, col: 0, direction: 'H',
    score: 0,
    timestamp: Date.now(),
    turnNumber: game.turnNumber,
    isValid: true,
    isPass: true,
  };

  await submitMove(gameId, move, game.racks?.[playerId] ?? [], []);
};

// ─── Partides públiques ───────────────────────────────────────────────────────

export const getPublicGames = async (): Promise<any[]> => {
  const snap = await db.ref('publicGames').orderByChild('createdAt').limitToLast(20).once('value');
  if (!snap.exists()) return [];
  return Object.values(snap.val() as Record<string, any>)
    .filter(g => g.status !== 'FINISHED')
    .sort((a, b) => b.createdAt - a.createdAt);
};

// ─── Helper intern ────────────────────────────────────────────────────────────

const applyMoveToBoard = (board: BoardCell[][], move: Move): BoardCell[][] => {
  const newBoard = board.map(row => row.map(cell => ({ ...cell })));
  move.placedTiles.forEach(({ tile, row, col }) => {
    newBoard[row][col] = { ...newBoard[row][col], tile };
  });
  return newBoard;
};
