import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useGame, usePlayerRack } from '../hooks/useGame';
import { joinGame, startGame, submitMove, passTurn, swapTiles, resolveChallenge } from '../services/gameService';
import Board from '../components/Board';
import Tile from '../components/Tile';
import { Tile as TileType, PlacedTile, Move, GameState } from '../types';
import { LETTER_VALUES, REVERSE_DIGRAPH_MAP } from '../constants';
import { calculateMoveScore, loadDictionary } from '../utils/scrabbleUtils';
import { ArrowLeft, RotateCcw, RefreshCw, ChevronRight, Clock } from 'lucide-react';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const getOrCreatePlayerId = (): string => {
  let id = localStorage.getItem('cat_player_id');
  if (!id) {
    id = `p_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    localStorage.setItem('cat_player_id', id);
  }
  return id;
};

const charToTile = (char: string): TileType => {
  const isBlank = char === '?';
  const displayChar = REVERSE_DIGRAPH_MAP[char] ?? char;
  return {
    char,
    displayChar,
    value: isBlank ? 0 : (LETTER_VALUES[char] ?? 0),
    isBlank,
  };
};

type PendingTile = { tile: TileType; rackIdx: number };

// ─── Component ────────────────────────────────────────────────────────────────

const ClassicGameView: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const gameId = searchParams.get('gameId');
  const isHost = searchParams.get('host') === '1';

  const playerId = getOrCreatePlayerId();
  const playerName = localStorage.getItem('cat_player_name') ?? 'Jugador';

  const { gameState, loading, error } = useGame(gameId);
  const rackChars = usePlayerRack(gameId, playerId);

  // ── Move building state ─────────────────────────────────────────────────────
  const [pendingMap, setPendingMap] = useState<Map<string, PendingTile>>(new Map());
  const [selectedRackIdx, setSelectedRackIdx] = useState<number | null>(null);

  // ── UI state ────────────────────────────────────────────────────────────────
  const [showSwap, setShowSwap] = useState(false);
  const [swapSet, setSwapSet] = useState<Set<number>>(new Set());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [previewScore, setPreviewScore] = useState<number | null>(null);
  const [challengeCountdown, setChallengeCountdown] = useState(0);
  const [turnElapsed, setTurnElapsed] = useState(0);
  const [dictReady, setDictReady] = useState(false);
  const [joined, setJoined] = useState(false);
  const turnTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Load dictionary ─────────────────────────────────────────────────────────
  useEffect(() => {
    const dict = gameState?.config?.dictionary ?? 'DISC';
    loadDictionary(dict).then(() => setDictReady(true)).catch(() => setDictReady(true));
  }, [gameState?.config?.dictionary]);

  // ── Auto-join game ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!gameState || joined) return;
    if (gameState.players?.[playerId]) { setJoined(true); return; }
    if (gameState.status !== 'LOBBY') return;
    joinGame(gameId!, { id: playerId, name: playerName, email: `${playerId}@catscrabble.local` })
      .then(() => setJoined(true))
      .catch(() => setJoined(true));
  }, [gameState, joined, gameId, playerId, playerName]);

  // ── Challenge countdown ─────────────────────────────────────────────────────
  useEffect(() => {
    if (gameState?.status !== 'CHALLENGE' || !gameState.challenge) return;
    const update = () => {
      const remaining = Math.max(0, Math.ceil((gameState.challenge!.deadline - Date.now()) / 1000));
      setChallengeCountdown(remaining);
      if (remaining === 0 && gameState.challenge?.challengerId !== playerId) {
        resolveChallenge(gameId!, 'valid').catch(() => {});
      }
    };
    update();
    const id = setInterval(update, 500);
    return () => clearInterval(id);
  }, [gameState?.status, gameState?.challenge, gameId, playerId]);

  // ── Turn timer ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (turnTimerRef.current) clearInterval(turnTimerRef.current);
    if (gameState?.status !== 'PLAYING') return;
    setTurnElapsed(0);
    turnTimerRef.current = setInterval(() => setTurnElapsed(s => s + 1), 1000);
    return () => { if (turnTimerRef.current) clearInterval(turnTimerRef.current); };
  }, [gameState?.turnNumber, gameState?.status]);

  // ── Reset pending on turn change ────────────────────────────────────────────
  useEffect(() => {
    setPendingMap(new Map());
    setSelectedRackIdx(null);
    setMoveError(null);
    setPreviewScore(null);
  }, [gameState?.currentTurn, gameState?.turnNumber]);

  // ── Preview score ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!gameState || pendingMap.size === 0 || !dictReady) { setPreviewScore(null); return; }
    const result = buildMoveResult(gameState, pendingMap, rackChars);
    if (result?.score !== undefined) setPreviewScore(result.score);
    else setPreviewScore(null);
  }, [pendingMap, gameState, rackChars, dictReady]);

  // ─── Derived state ──────────────────────────────────────────────────────────
  const isMyTurn = gameState?.currentTurn === playerId && gameState?.status === 'PLAYING';
  const players = gameState ? Object.values(gameState.players ?? {}) : [];
  const sortedPlayers = gameState?.turnOrder
    ? gameState.turnOrder.map(id => gameState.players?.[id]).filter(Boolean)
    : players;

  // Rack visual: rack chars amb les pendents ja col·locades marcades com a null
  const usedRackIndices = new Set<number>();
  pendingMap.forEach(pt => usedRackIndices.add(pt.rackIdx));
  const visibleRack = rackChars.map((ch, i) => (usedRackIndices.has(i) ? null : ch));

  // Preview tiles per Board
  const previewTiles = Array.from(pendingMap.entries()).map(([key, pt]) => {
    const [r, c] = key.split(',').map(Number);
    return { tile: pt.tile, row: r, col: c };
  });

  // ─── Handlers ──────────────────────────────────────────────────────────────

  const handleRackTileClick = (idx: number) => {
    if (!isMyTurn || visibleRack[idx] === null) return;
    setSelectedRackIdx(prev => prev === idx ? null : idx);
    setMoveError(null);
  };

  const handleCellClick = useCallback((row: number, col: number) => {
    if (!isMyTurn) return;
    const key = `${row},${col}`;

    // Si ja hi ha una fitxa pendent, treure-la
    if (pendingMap.has(key)) {
      setPendingMap(prev => { const m = new Map(prev); m.delete(key); return m; });
      return;
    }

    // Cal tenir una fitxa seleccionada
    if (selectedRackIdx === null) return;
    const ch = rackChars[selectedRackIdx];
    if (!ch) return;

    // Situar fitxa
    const tile = charToTile(ch);
    setPendingMap(prev => new Map(prev).set(key, { tile, rackIdx: selectedRackIdx }));
    setSelectedRackIdx(null);
    setMoveError(null);
  }, [isMyTurn, pendingMap, selectedRackIdx, rackChars]);

  const handleReturnPreviewTile = (_e: React.TouchEvent | React.MouseEvent, _tile: TileType, row: number, col: number) => {
    const key = `${row},${col}`;
    setPendingMap(prev => { const m = new Map(prev); m.delete(key); return m; });
  };

  const handleUndo = () => {
    setPendingMap(new Map());
    setSelectedRackIdx(null);
    setMoveError(null);
  };

  const handlePass = async () => {
    if (!gameId || !isMyTurn || isSubmitting) return;
    setIsSubmitting(true);
    try { await passTurn(gameId, playerId); }
    catch (e: any) { setMoveError(e.message); }
    finally { setIsSubmitting(false); }
  };

  const handleSwapToggle = (idx: number) => {
    setSwapSet(prev => {
      const s = new Set(prev);
      s.has(idx) ? s.delete(idx) : s.add(idx);
      return s;
    });
  };

  const handleSwapConfirm = async () => {
    if (!gameId || !isMyTurn || isSubmitting) return;
    const tilesToSwap = [...swapSet].map(i => rackChars[i]).filter(Boolean);
    if (!tilesToSwap.length) return;
    setIsSubmitting(true);
    try {
      await swapTiles(gameId, playerId, tilesToSwap);
      setShowSwap(false);
      setSwapSet(new Set());
    } catch (e: any) { setMoveError(e.message); }
    finally { setIsSubmitting(false); }
  };

  const handleSubmit = async () => {
    if (!gameId || !isMyTurn || isSubmitting || !gameState) return;
    if (pendingMap.size === 0) { setMoveError('Col·loca almenys una fitxa.'); return; }

    const result = buildMoveResult(gameState, pendingMap, rackChars);
    if (!result) { setMoveError('Jugada invàlida: fitxes mal col·locades.'); return; }
    if (!result.isValid) { setMoveError(result.error ?? 'Jugada no vàlida.'); return; }

    // Construir nova rack (sense les fitxes col·locades + draw from bag)
    const newRackChars = rackChars.filter((_, i) => !usedRackIndices.has(i));
    const numToDraw = Math.min(7 - newRackChars.length, (gameState.bag ?? []).length);
    const drawn = (gameState.bag ?? []).slice(0, numToDraw);
    const fullNewRack = [...newRackChars, ...drawn];

    const placedTiles: PlacedTile[] = Array.from(pendingMap.entries()).map(([key, pt]) => {
      const [r, c] = key.split(',').map(Number);
      return { tile: pt.tile, row: r, col: c };
    });

    const move: Move = {
      id: Date.now().toString(),
      playerId,
      playerName,
      word: result.wordStr,
      tiles: placedTiles.map(p => p.tile),
      placedTiles,
      row: result.startRow,
      col: result.startCol,
      direction: result.direction,
      score: result.score,
      timestamp: Date.now(),
      turnNumber: gameState.turnNumber,
      isValid: true,
    };

    setIsSubmitting(true);
    try {
      await submitMove(gameId, move, fullNewRack, drawn);
    } catch (e: any) {
      setMoveError(e.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStartGame = async () => {
    if (!gameId || isSubmitting) return;
    setIsSubmitting(true);
    try { await startGame(gameId); }
    catch (e: any) { setMoveError(e.message); }
    finally { setIsSubmitting(false); }
  };

  const handleChallenge = async () => {
    if (!gameId || isSubmitting) return;
    setIsSubmitting(true);
    try { await resolveChallenge(gameId, 'invalid'); }
    catch (e: any) { setMoveError(e.message); }
    finally { setIsSubmitting(false); }
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  if (loading) return (
    <div className="min-h-screen bg-pearl-50 flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-mist-200 border-t-teal-500 rounded-full animate-spin" />
    </div>
  );

  if (error || !gameState) return (
    <div className="min-h-screen bg-pearl-50 flex flex-col items-center justify-center gap-4">
      <p className="text-coral-400 font-bold">{error ?? 'Partida no trobada'}</p>
      <button onClick={() => navigate('/')} className="text-teal-600 underline text-sm">Tornar al lobby</button>
    </div>
  );

  const bagCount = (gameState.bag ?? []).length;
  const turnTimer = gameState.config?.turnTimerSeconds
    ? gameState.config.turnTimerSeconds - turnElapsed
    : null;
  const timerWarning = turnTimer !== null && turnTimer <= 30;

  return (
    <div className="flex flex-col h-screen bg-pearl-50 text-teal-800 select-none overflow-hidden">

      {/* ── Header: marcador + info ── */}
      <header className="flex-shrink-0 bg-teal-800 text-white px-3 py-2 shadow-md">
        <div className="flex items-center justify-between gap-2">
          <button onClick={() => navigate('/')} className="text-mist-400 hover:text-white transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </button>

          {/* Jugadors i puntuació */}
          <div className="flex items-center gap-3 overflow-x-auto flex-1 justify-center">
            {sortedPlayers.map(p => (
              <div key={p!.id} className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-sm font-bold transition-all ${
                gameState.currentTurn === p!.id && gameState.status === 'PLAYING'
                  ? 'bg-teal-600 text-white shadow'
                  : 'text-mist-300'
              }`}>
                {gameState.currentTurn === p!.id && gameState.status === 'PLAYING' && (
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-300 animate-pulse" />
                )}
                <span className="max-w-[80px] truncate">{p!.name}</span>
                <span className="text-xs opacity-80">{p!.totalScore}</span>
              </div>
            ))}
          </div>

          {/* Bossa i rellotge */}
          <div className="flex items-center gap-2 text-xs text-mist-300 flex-shrink-0">
            <span title="Fitxes a la bossa">🎒{bagCount}</span>
            {turnTimer !== null && (
              <span className={`flex items-center gap-0.5 ${timerWarning ? 'text-coral-400 animate-pulse' : ''}`}>
                <Clock className="w-3 h-3" />{Math.max(0, turnTimer)}s
              </span>
            )}
          </div>
        </div>

        {/* Estat: torn actiu */}
        {gameState.status === 'PLAYING' && (
          <p className="text-center text-xs text-mist-400 mt-1">
            {isMyTurn ? '→ El teu torn' : `Esperant ${gameState.players?.[gameState.currentTurn]?.name ?? ''}...`}
          </p>
        )}
        {gameState.status === 'LOBBY' && (
          <p className="text-center text-xs text-mist-400 mt-1">
            Sala d'espera · {Object.keys(gameState.players ?? {}).length}/{gameState.config?.maxPlayers} jugadors
          </p>
        )}
        {gameState.status === 'FINISHED' && (
          <p className="text-center text-xs text-amber-300 font-bold mt-1">Partida acabada</p>
        )}
      </header>

      {/* ── Tauler ── */}
      <div className="flex-1 min-h-0 overflow-hidden flex items-center justify-center bg-moss-200/30 p-1">
        <Board
          board={gameState.board}
          previewTiles={previewTiles}
          onCellClick={isMyTurn ? handleCellClick : undefined}
          onPreviewTileTouchStart={isMyTurn ? handleReturnPreviewTile : undefined}
          selectedCell={selectedRackIdx !== null ? undefined : undefined}
          className="max-h-full max-w-full"
        />
      </div>

      {/* ── Faristol ── */}
      {gameState.status === 'PLAYING' && (
        <div className="flex-shrink-0 bg-white border-t border-stone-200 px-3 py-2">
          <div className="flex items-center justify-center gap-1.5">
            {showSwap
              ? rackChars.map((ch, i) => (
                  <div
                    key={i}
                    onClick={() => handleSwapToggle(i)}
                    className={`cursor-pointer rounded transition-all ${swapSet.has(i) ? 'ring-2 ring-coral-400 scale-110' : 'opacity-60'}`}
                  >
                    <Tile tile={charToTile(ch)} size="lg" />
                  </div>
                ))
              : visibleRack.map((ch, i) => (
                  <div
                    key={i}
                    onClick={() => ch !== null ? handleRackTileClick(i) : undefined}
                    className={`transition-all ${ch === null ? 'opacity-20' : 'cursor-pointer'} ${
                      selectedRackIdx === i ? 'scale-125 ring-2 ring-teal-500 rounded' : ''
                    }`}
                  >
                    {ch !== null
                      ? <Tile tile={charToTile(ch)} size="lg" />
                      : <div className="w-14 h-14 bg-stone-100 rounded-sm border border-dashed border-stone-300" />
                    }
                  </div>
                ))
            }
          </div>

          {/* Instrucció ràpida */}
          {isMyTurn && !showSwap && selectedRackIdx !== null && (
            <p className="text-center text-xs text-teal-600 mt-1 animate-pulse">Toca una casella del tauler per col·locar la fitxa</p>
          )}
          {isMyTurn && !showSwap && selectedRackIdx === null && pendingMap.size === 0 && (
            <p className="text-center text-xs text-stone-400 mt-1">Toca una fitxa per seleccionar-la</p>
          )}
        </div>
      )}

      {/* ── Botons d'acció ── */}
      {gameState.status === 'PLAYING' && isMyTurn && (
        <div className="flex-shrink-0 bg-white border-t border-stone-100 px-3 py-2 space-y-2">
          {moveError && (
            <p className="text-xs text-coral-400 bg-red-50 border border-coral-200 rounded px-2 py-1 text-center">{moveError}</p>
          )}

          {!showSwap ? (
            <div className="flex gap-2">
              {/* Desfer */}
              {pendingMap.size > 0 && (
                <button
                  onClick={handleUndo}
                  className="p-2.5 bg-stone-100 hover:bg-stone-200 text-stone-600 rounded-md transition-colors"
                  title="Desfer"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
              )}

              {/* Passar */}
              {pendingMap.size === 0 && (
                <button
                  onClick={handlePass}
                  disabled={isSubmitting}
                  className="flex-1 py-2.5 bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold rounded-md text-sm transition-colors disabled:opacity-50"
                >
                  PASSAR
                </button>
              )}

              {/* Canviar */}
              {pendingMap.size === 0 && (gameState.bag ?? []).length >= 7 && (
                <button
                  onClick={() => setShowSwap(true)}
                  className="flex-1 py-2.5 bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold rounded-md text-sm transition-colors flex items-center justify-center gap-1"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> CANVIAR
                </button>
              )}

              {/* Enviar */}
              {pendingMap.size > 0 && (
                <button
                  onClick={handleSubmit}
                  disabled={isSubmitting || !dictReady}
                  className="flex-1 py-2.5 bg-teal-800 hover:bg-teal-700 text-white font-bold rounded-md text-sm transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isSubmitting ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      ENVIAR
                      {previewScore !== null && (
                        <span className="bg-teal-600 text-white text-xs px-1.5 py-0.5 rounded font-bold">{previewScore}pt</span>
                      )}
                      <ChevronRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              )}
            </div>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={() => { setShowSwap(false); setSwapSet(new Set()); }}
                className="flex-1 py-2.5 bg-stone-100 text-stone-700 font-bold rounded-md text-sm"
              >
                CANCEL·LAR
              </button>
              <button
                onClick={handleSwapConfirm}
                disabled={swapSet.size === 0 || isSubmitting}
                className="flex-1 py-2.5 bg-teal-800 hover:bg-teal-700 text-white font-bold rounded-md text-sm disabled:opacity-50 flex items-center justify-center gap-1"
              >
                <RefreshCw className="w-3.5 h-3.5" /> CANVIAR ({swapSet.size})
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Overlay: impugnació ── */}
      {gameState.status === 'CHALLENGE' && gameState.challenge && (
        <div className="flex-shrink-0 bg-amber-50 border-t-2 border-amber-300 px-4 py-3">
          <p className="text-center text-sm font-bold text-teal-800 mb-2">
            {gameState.challenge.challengerId === playerId
              ? `Pots impugnar la jugada de ${gameState.players?.[gameState.lastMove?.playerId ?? '']?.name ?? ''}!`
              : `Esperant resolució...`
            }
          </p>
          <div className="flex items-center justify-center gap-3">
            <span className={`text-2xl font-black ${challengeCountdown <= 5 ? 'text-coral-400 animate-pulse' : 'text-teal-800'}`}>
              {challengeCountdown}s
            </span>
            {gameState.challenge.challengerId === playerId && (
              <button
                onClick={handleChallenge}
                disabled={isSubmitting || challengeCountdown === 0}
                className="px-6 py-2.5 bg-coral-400 hover:bg-coral-500 text-white font-black rounded-md text-sm disabled:opacity-50 transition-colors"
              >
                IMPUGNAR
              </button>
            )}
          </div>
          {moveError && <p className="text-xs text-coral-400 text-center mt-1">{moveError}</p>}
        </div>
      )}

      {/* ── Overlay: lobby ── */}
      {gameState.status === 'LOBBY' && (
        <div className="flex-shrink-0 bg-white border-t border-stone-200 px-4 py-4 text-center space-y-3">
          <p className="text-sm text-stone-600">
            Jugadors: {Object.values(gameState.players ?? {}).map(p => (p as any).name).join(', ') || 'Cap jugador'}
          </p>
          {isHost && Object.keys(gameState.players ?? {}).length >= 1 && (
            <button
              onClick={handleStartGame}
              disabled={isSubmitting}
              className="w-full py-3 bg-teal-800 hover:bg-teal-700 text-white font-bold rounded-md transition-colors disabled:opacity-50"
            >
              {isSubmitting ? 'Iniciant...' : 'INICIAR PARTIDA'}
            </button>
          )}
          {moveError && <p className="text-xs text-coral-400">{moveError}</p>}
        </div>
      )}

      {/* ── Overlay: fi de partida ── */}
      {gameState.status === 'FINISHED' && (
        <div className="flex-shrink-0 bg-white border-t border-stone-200 px-4 py-4 space-y-3">
          <p className="text-center text-lg font-black text-teal-800">Partida acabada!</p>
          <div className="space-y-1">
            {[...sortedPlayers].sort((a, b) => (b!.totalScore - a!.totalScore)).map((p, i) => (
              <div key={p!.id} className="flex justify-between items-center">
                <span className={`font-bold ${i === 0 ? 'text-amber-500' : 'text-stone-600'}`}>
                  {i === 0 ? '🏆 ' : ''}{p!.name}
                </span>
                <span className="font-black text-teal-800">{p!.totalScore} pts</span>
              </div>
            ))}
          </div>
          <button onClick={() => navigate('/')} className="w-full py-2.5 bg-teal-800 text-white font-bold rounded-md">
            Tornar al lobby
          </button>
        </div>
      )}
    </div>
  );
};

export default ClassicGameView;

// ─── Helper: construir resultat del moviment ──────────────────────────────────

interface MoveResult {
  isValid: boolean;
  score: number;
  error?: string;
  wordStr: string;
  startRow: number;
  startCol: number;
  direction: 'H' | 'V';
  placedTiles: PlacedTile[];
}

function buildMoveResult(
  gameState: GameState,
  pendingMap: Map<string, PendingTile>,
  rackChars: string[]
): MoveResult | null {
  if (pendingMap.size === 0) return null;

  const entries = Array.from(pendingMap.entries()).map(([key, pt]) => {
    const [r, c] = key.split(',').map(Number);
    return { row: r, col: c, tile: pt.tile };
  });

  // Determinar direcció
  const rows = entries.map(e => e.row);
  const cols = entries.map(e => e.col);
  const allSameRow = rows.every(r => r === rows[0]);
  const allSameCol = cols.every(c => c === cols[0]);

  if (!allSameRow && !allSameCol) {
    return { isValid: false, score: 0, error: 'Les fitxes han d\'estar en la mateixa fila o columna.', wordStr: '', startRow: 0, startCol: 0, direction: 'H', placedTiles: [] };
  }

  const direction: 'H' | 'V' = (allSameRow && !allSameCol) || (pendingMap.size === 1 && allSameRow) ? 'H' : 'V';
  const board = gameState.board;
  const dr = direction === 'H' ? 0 : 1;
  const dc = direction === 'H' ? 1 : 0;

  // Trobar inici de la paraula (estendre als extrems)
  let startRow = entries[0].row;
  let startCol = entries[0].col;

  // Inici mínim de les fitxes noves
  if (direction === 'H') {
    startRow = rows[0];
    startCol = Math.min(...cols);
  } else {
    startRow = Math.min(...rows);
    startCol = cols[0];
  }

  // Recular fins trobar el primer tile de la paraula al tauler
  while (
    startRow - dr >= 0 && startRow - dr < 15 &&
    startCol - dc >= 0 && startCol - dc < 15 &&
    board[startRow - dr][startCol - dc].tile
  ) {
    startRow -= dr;
    startCol -= dc;
  }

  // Construir array complet de tiles per la paraula
  const wordTiles: TileType[] = [];
  let r = startRow;
  let c = startCol;

  const pendingSet = new Map(Array.from(pendingMap.entries()).map(([k, pt]) => [k, pt.tile]));

  while (r >= 0 && r < 15 && c >= 0 && c < 15) {
    const key = `${r},${c}`;
    const boardTile = board[r][c].tile;
    const pendingTile = pendingSet.get(key);

    if (pendingTile) {
      wordTiles.push(pendingTile);
    } else if (boardTile) {
      wordTiles.push(boardTile);
    } else {
      break;
    }

    r += dr;
    c += dc;
  }

  if (wordTiles.length < 2 && pendingMap.size === 1) {
    // Fitxa sola: mirar si forma paraula en l'altra direcció
    const singleEntry = entries[0];
    const altDir: 'H' | 'V' = direction === 'H' ? 'V' : 'H';
    const altDr = altDir === 'H' ? 0 : 1;
    const altDc = altDir === 'H' ? 1 : 0;
    let altStartRow = singleEntry.row;
    let altStartCol = singleEntry.col;
    while (
      altStartRow - altDr >= 0 && altStartCol - altDc >= 0 &&
      board[altStartRow - altDr][altStartCol - altDc]?.tile
    ) { altStartRow -= altDr; altStartCol -= altDc; }

    const altTiles: TileType[] = [];
    let ar = altStartRow, ac = altStartCol;
    while (ar >= 0 && ar < 15 && ac >= 0 && ac < 15) {
      const k = `${ar},${ac}`;
      const bt = board[ar][ac].tile;
      const pt = pendingSet.get(k);
      if (pt) altTiles.push(pt);
      else if (bt) altTiles.push(bt);
      else break;
      ar += altDr; ac += altDc;
    }
    if (altTiles.length >= 2) {
      // Usar la direcció alternativa per a la jugada
      const scoreResult = calculateMoveScore(board, altTiles, rackChars, altStartRow, altStartCol, altDir);
      return {
        isValid: scoreResult.isValid,
        score: scoreResult.score,
        error: scoreResult.error,
        wordStr: altTiles.map(t => t.displayChar).join(''),
        startRow: altStartRow,
        startCol: altStartCol,
        direction: altDir,
        placedTiles: entries.map(e => ({ tile: e.tile, row: e.row, col: e.col })),
      };
    }
  }

  const wordStr = wordTiles.map(t => t.displayChar).join('');
  const scoreResult = calculateMoveScore(board, wordTiles, rackChars, startRow, startCol, direction);

  return {
    isValid: scoreResult.isValid,
    score: scoreResult.score,
    error: scoreResult.error,
    wordStr,
    startRow,
    startCol,
    direction,
    placedTiles: entries.map(e => ({ tile: e.tile, row: e.row, col: e.col })),
  };
}
