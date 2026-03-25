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
  return { char, displayChar, value: isBlank ? 0 : (LETTER_VALUES[char] ?? 0), isBlank };
};

type PendingTile = { tile: TileType; localIdx: number };

interface DragState {
  localIdx: number;
  tile: TileType;
  x: number;
  y: number;
}

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

  // ── Faristol local (reordenable) ────────────────────────────────────────────
  const [localRack, setLocalRack] = useState<(string | null)[]>([]);

  useEffect(() => {
    setLocalRack(rackChars.map(ch => ch));
  }, [rackChars.join(',')]);

  // ── Move building ────────────────────────────────────────────────────────────
  const [pendingMap, setPendingMap] = useState<Map<string, PendingTile>>(new Map());
  const [selectedLocalIdx, setSelectedLocalIdx] = useState<number | null>(null);

  // ── Drag ─────────────────────────────────────────────────────────────────────
  const [drag, setDrag] = useState<DragState | null>(null);
  const [dragOverCell, setDragOverCell] = useState<{ row: number; col: number } | null>(null);
  const [dragOverRackIdx, setDragOverRackIdx] = useState<number | null>(null);
  const boardWrapRef = useRef<HTMLDivElement>(null);
  const rackRef = useRef<HTMLDivElement>(null);

  // ── UI state ─────────────────────────────────────────────────────────────────
  const [showSwap, setShowSwap] = useState(false);
  const [swapSet, setSwapSet] = useState<Set<number>>(new Set());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [previewScore, setPreviewScore] = useState<number | null>(null);
  const [turnElapsed, setTurnElapsed] = useState(0);
  const [dictReady, setDictReady] = useState(false);
  const [joined, setJoined] = useState(false);
  const turnTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Load dictionary ──────────────────────────────────────────────────────────
  useEffect(() => {
    const dict = gameState?.config?.dictionary ?? 'DISC';
    loadDictionary(dict).then(() => setDictReady(true)).catch(() => setDictReady(true));
  }, [gameState?.config?.dictionary]);

  // ── Auto-join ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!gameState || joined) return;
    if (gameState.players?.[playerId]) { setJoined(true); return; }
    if (gameState.status !== 'LOBBY') return;
    joinGame(gameId!, { id: playerId, name: playerName, email: `${playerId}@catscrabble.local` })
      .then(() => setJoined(true)).catch(() => setJoined(true));
  }, [gameState, joined, gameId, playerId, playerName]);

  // ── Turn timer ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (turnTimerRef.current) clearInterval(turnTimerRef.current);
    if (gameState?.status !== 'PLAYING') return;
    setTurnElapsed(0);
    turnTimerRef.current = setInterval(() => setTurnElapsed(s => s + 1), 1000);
    return () => { if (turnTimerRef.current) clearInterval(turnTimerRef.current); };
  }, [gameState?.turnNumber, gameState?.status]);

  // ── Reset pending on torn change ─────────────────────────────────────────────
  useEffect(() => {
    setPendingMap(new Map());
    setSelectedLocalIdx(null);
    setMoveError(null);
    setPreviewScore(null);
  }, [gameState?.currentTurn, gameState?.turnNumber]);

  // ── Preview score ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!gameState || pendingMap.size === 0) { setPreviewScore(null); return; }
    const skipValidation = gameState.config?.allowChallenge ?? false;
    const result = buildMoveResult(gameState, pendingMap, localRack, skipValidation);
    setPreviewScore(result?.score ?? null);
  }, [pendingMap, gameState, localRack]);

  // ─── Derived ─────────────────────────────────────────────────────────────────
  const isMyTurn = gameState?.currentTurn === playerId && gameState?.status === 'PLAYING';
  const allowChallenge = gameState?.config?.allowChallenge ?? false;

  const sortedPlayers = gameState?.turnOrder
    ? gameState.turnOrder.map(id => gameState.players?.[id]).filter(Boolean)
    : Object.values(gameState?.players ?? {});

  const usedLocalIndices = new Set<number>();
  pendingMap.forEach(pt => usedLocalIndices.add(pt.localIdx));

  const previewTiles = Array.from(pendingMap.entries()).map(([key, pt]) => {
    const [r, c] = key.split(',').map(Number);
    return { tile: pt.tile, row: r, col: c };
  });

  // Afegir preview durant drag sobre tauler
  const allPreviewTiles = [...previewTiles];
  if (drag && dragOverCell && !pendingMap.has(`${dragOverCell.row},${dragOverCell.col}`) &&
      !gameState?.board?.[dragOverCell.row]?.[dragOverCell.col]?.tile) {
    allPreviewTiles.push({ tile: drag.tile, row: dragOverCell.row, col: dragOverCell.col });
  }

  // ─── Helpers de posicionament ─────────────────────────────────────────────────

  const getBoardCell = useCallback((px: number, py: number): { row: number; col: number } | null => {
    const el = boardWrapRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    if (px < rect.left || px > rect.right || py < rect.top || py > rect.bottom) return null;
    const cellW = rect.width / 16;
    const cellH = rect.height / 16;
    const col = Math.floor((px - rect.left) / cellW) - 1;
    const row = Math.floor((py - rect.top) / cellH) - 1;
    if (row < 0 || row > 14 || col < 0 || col > 14) return null;
    return { row, col };
  }, []);

  const getRackIdx = useCallback((px: number, py: number): number | null => {
    const el = rackRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    if (py < rect.top || py > rect.bottom) return null;
    const items = el.querySelectorAll('[data-rack-idx]');
    for (const item of items) {
      const r = item.getBoundingClientRect();
      if (px >= r.left && px <= r.right) {
        return parseInt((item as HTMLElement).dataset.rackIdx ?? '-1');
      }
    }
    return null;
  }, []);

  // ─── Drag handlers ────────────────────────────────────────────────────────────

  const handleRackPointerDown = (e: React.PointerEvent, localIdx: number) => {
    if (!isMyTurn || localRack[localIdx] === null) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const tile = charToTile(localRack[localIdx]!);
    setDrag({ localIdx, tile, x: e.clientX, y: e.clientY });
    setSelectedLocalIdx(null);
  };

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!drag) return;
    e.preventDefault();
    setDrag(prev => prev ? { ...prev, x: e.clientX, y: e.clientY } : null);
    setDragOverCell(getBoardCell(e.clientX, e.clientY));
    setDragOverRackIdx(getRackIdx(e.clientX, e.clientY));
  }, [drag, getBoardCell, getRackIdx]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!drag) return;
    e.preventDefault();

    const boardCell = getBoardCell(e.clientX, e.clientY);
    const rackIdx = getRackIdx(e.clientX, e.clientY);

    if (boardCell && !gameState?.board?.[boardCell.row]?.[boardCell.col]?.tile &&
        !pendingMap.has(`${boardCell.row},${boardCell.col}`)) {
      // Col·locar al tauler
      const key = `${boardCell.row},${boardCell.col}`;
      setPendingMap(prev => new Map(prev).set(key, { tile: drag.tile, localIdx: drag.localIdx }));
      setLocalRack(prev => { const r = [...prev]; r[drag.localIdx] = null; return r; });
    } else if (rackIdx !== null && rackIdx !== drag.localIdx) {
      // Reordenar faristol
      setLocalRack(prev => {
        const r = [...prev];
        [r[drag.localIdx], r[rackIdx]] = [r[rackIdx], r[drag.localIdx]];
        return r;
      });
      // Actualitza pendingMap si algun tile afectat ja estava col·locat
      setPendingMap(prev => {
        const m = new Map<string, PendingTile>(prev);
        m.forEach((pt: PendingTile, k: string) => {
          if (pt.localIdx === drag.localIdx) m.set(k, { ...pt, localIdx: rackIdx });
          else if (pt.localIdx === rackIdx) m.set(k, { ...pt, localIdx: drag.localIdx });
        });
        return m;
      });
    }

    setDrag(null);
    setDragOverCell(null);
    setDragOverRackIdx(null);
  }, [drag, getBoardCell, getRackIdx, gameState, pendingMap]);

  // ─── Tap handlers ────────────────────────────────────────────────────────────

  const handleRackTileClick = (localIdx: number) => {
    if (!isMyTurn || localRack[localIdx] === null || drag) return;
    setSelectedLocalIdx(prev => prev === localIdx ? null : localIdx);
    setMoveError(null);
  };

  const handleCellClick = useCallback((row: number, col: number) => {
    if (!isMyTurn) return;
    const key = `${row},${col}`;
    if (pendingMap.has(key)) {
      const { localIdx } = pendingMap.get(key)!;
      const tile = pendingMap.get(key)!.tile;
      setPendingMap(prev => { const m = new Map(prev); m.delete(key); return m; });
      setLocalRack(prev => { const r = [...prev]; r[localIdx] = tile.char; return r; });
      return;
    }
    if (selectedLocalIdx === null) return;
    const ch = localRack[selectedLocalIdx];
    if (!ch) return;
    const tile = charToTile(ch);
    setPendingMap(prev => new Map(prev).set(key, { tile, localIdx: selectedLocalIdx }));
    setLocalRack(prev => { const r = [...prev]; r[selectedLocalIdx] = null; return r; });
    setSelectedLocalIdx(null);
    setMoveError(null);
  }, [isMyTurn, pendingMap, selectedLocalIdx, localRack]);

  const handleReturnPreviewTile = (_e: React.TouchEvent | React.MouseEvent, _tile: TileType, row: number, col: number) => {
    const key = `${row},${col}`;
    if (!pendingMap.has(key)) return;
    const { localIdx, tile } = pendingMap.get(key)!;
    setPendingMap(prev => { const m = new Map(prev); m.delete(key); return m; });
    setLocalRack(prev => { const r = [...prev]; r[localIdx] = tile.char; return r; });
  };

  const handleUndo = () => {
    // Restaura totes les fitxes al faristol
    const restored = [...localRack];
    pendingMap.forEach(({ tile, localIdx }) => { restored[localIdx] = tile.char; });
    setLocalRack(restored);
    setPendingMap(new Map());
    setSelectedLocalIdx(null);
    setMoveError(null);
  };

  // ─── Accions de joc ──────────────────────────────────────────────────────────

  const handlePass = async () => {
    if (!gameId || !isMyTurn || isSubmitting) return;
    setIsSubmitting(true);
    try { await passTurn(gameId, playerId); }
    catch (e: any) { setMoveError(e.message); }
    finally { setIsSubmitting(false); }
  };

  const handleSwapToggle = (idx: number) => {
    setSwapSet(prev => { const s = new Set(prev); s.has(idx) ? s.delete(idx) : s.add(idx); return s; });
  };

  const handleSwapConfirm = async () => {
    if (!gameId || !isMyTurn || isSubmitting) return;
    const tilesToSwap = [...swapSet].map(i => localRack[i]).filter(Boolean) as string[];
    if (!tilesToSwap.length) return;
    setIsSubmitting(true);
    try {
      await swapTiles(gameId, playerId, tilesToSwap);
      setShowSwap(false); setSwapSet(new Set());
    } catch (e: any) { setMoveError(e.message); }
    finally { setIsSubmitting(false); }
  };

  const handleSubmit = async () => {
    if (!gameId || !isMyTurn || isSubmitting || !gameState) return;
    if (pendingMap.size === 0) { setMoveError('Col·loca almenys una fitxa.'); return; }

    const skipValidation = allowChallenge;
    const result = buildMoveResult(gameState, pendingMap, localRack, skipValidation);
    if (!result) { setMoveError('Les fitxes han d\'estar en la mateixa fila o columna.'); return; }
    if (!skipValidation && !result.isValid) { setMoveError(result.error ?? 'Jugada no vàlida.'); return; }

    const currentRackChars = localRack.filter(ch => ch !== null) as string[];
    const numToDraw = Math.min(pendingMap.size, (gameState.bag ?? []).length);
    const drawn = (gameState.bag ?? []).slice(0, numToDraw);
    const fullNewRack = [...currentRackChars, ...drawn];

    const placedTiles: PlacedTile[] = Array.from(pendingMap.entries()).map(([key, pt]) => {
      const [r, c] = key.split(',').map(Number);
      return { tile: pt.tile, row: r, col: c };
    });

    const move: Move = {
      id: Date.now().toString(),
      playerId, playerName,
      word: result.wordStr,
      tiles: placedTiles.map(p => p.tile),
      placedTiles,
      row: result.startRow, col: result.startCol, direction: result.direction,
      score: result.score,
      timestamp: Date.now(),
      turnNumber: gameState.turnNumber,
      isValid: !skipValidation ? result.isValid : true,
    };

    setIsSubmitting(true);
    try { await submitMove(gameId, move, fullNewRack, drawn); }
    catch (e: any) { setMoveError(e.message); }
    finally { setIsSubmitting(false); }
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

  const handleAcceptMove = async () => {
    if (!gameId || isSubmitting) return;
    setIsSubmitting(true);
    try { await resolveChallenge(gameId, 'valid'); }
    catch (e: any) { setMoveError(e.message); }
    finally { setIsSubmitting(false); }
  };

  // ─── Render ──────────────────────────────────────────────────────────────────

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
    ? gameState.config.turnTimerSeconds - turnElapsed : null;
  const timerWarning = turnTimer !== null && turnTimer <= 30;
  const isChallenger = gameState.challenge?.challengerId === playerId;

  return (
    <div
      className="flex flex-col h-[100dvh] bg-pearl-50 text-teal-800 select-none overflow-hidden touch-none"
      onPointerMove={drag ? handlePointerMove : undefined}
      onPointerUp={drag ? handlePointerUp : undefined}
    >

      {/* ── Header ── */}
      <header className="flex-shrink-0 bg-teal-800 text-white px-3 py-2 shadow-md">
        <div className="flex items-center justify-between gap-2">
          <button onClick={() => navigate('/')} className="text-mist-400 hover:text-white transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-2 overflow-x-auto flex-1 justify-center">
            {sortedPlayers.map(p => (
              <div key={(p as any).id} className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-sm font-bold transition-all flex-shrink-0 ${
                gameState.currentTurn === (p as any).id && gameState.status === 'PLAYING'
                  ? 'bg-teal-600 text-white shadow' : 'text-mist-300'
              }`}>
                {gameState.currentTurn === (p as any).id && gameState.status === 'PLAYING' && (
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-300 animate-pulse" />
                )}
                <span className="max-w-[90px] truncate">{(p as any).name}</span>
                <span className="text-xs opacity-80">{(p as any).totalScore}</span>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2 text-xs text-mist-300 flex-shrink-0">
            <span>🎒{bagCount}</span>
            {turnTimer !== null && (
              <span className={`flex items-center gap-0.5 ${timerWarning ? 'text-coral-400 animate-pulse' : ''}`}>
                <Clock className="w-3 h-3" />{Math.max(0, turnTimer)}s
              </span>
            )}
          </div>
        </div>

        {gameState.status === 'PLAYING' && (
          <p className="text-center text-xs text-mist-400 mt-1">
            {isMyTurn ? '→ El teu torn' : `Torn de ${gameState.players?.[gameState.currentTurn]?.name ?? '...'}`}
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

      {/* ── Tauler (sempre quadrat) ── */}
      <div className="flex-1 min-h-0 flex items-center justify-center bg-moss-200/30 p-1">
        <div ref={boardWrapRef} className="h-full aspect-square max-w-full">
          <Board
            board={gameState.board}
            previewTiles={allPreviewTiles}
            onCellClick={isMyTurn && !drag ? handleCellClick : undefined}
            onPreviewTileTouchStart={isMyTurn ? handleReturnPreviewTile : undefined}
            className="w-full h-full"
          />
        </div>
      </div>

      {/* ── Faristol ── */}
      {(gameState.status === 'PLAYING' || gameState.status === 'CHALLENGE') && (
        <div className="flex-shrink-0 bg-white border-t border-stone-200 px-2 py-2">
          <div ref={rackRef} className="flex gap-1 w-full items-center">
            {showSwap
              ? localRack.map((ch, i) => ch !== null ? (
                  <div
                    key={i}
                    data-rack-idx={i}
                    onClick={() => handleSwapToggle(i)}
                    className={`flex-1 aspect-square cursor-pointer rounded transition-all ${swapSet.has(i) ? 'ring-2 ring-coral-400 scale-105' : 'opacity-50'}`}
                  >
                    <Tile tile={charToTile(ch)} size="xl" />
                  </div>
                ) : <div key={i} className="flex-1 aspect-square" />)
              : localRack.map((ch, i) => (
                  <div
                    key={i}
                    data-rack-idx={i}
                    onPointerDown={ch !== null && isMyTurn ? (e) => handleRackPointerDown(e, i) : undefined}
                    onClick={ch !== null && isMyTurn ? () => handleRackTileClick(i) : undefined}
                    className={`flex-1 aspect-square transition-all touch-none ${
                      ch === null ? 'opacity-0 pointer-events-none' : 'cursor-grab active:cursor-grabbing'
                    } ${selectedLocalIdx === i ? 'scale-110 ring-2 ring-teal-500 rounded' : ''}
                    ${dragOverRackIdx === i && drag && drag.localIdx !== i ? 'ring-2 ring-amber-400 rounded scale-105' : ''}`}
                  >
                    {ch !== null
                      ? <Tile tile={charToTile(ch)} size="xl"
                          className={drag?.localIdx === i ? 'opacity-30' : ''} />
                      : null
                    }
                  </div>
                ))
            }
          </div>

          {isMyTurn && !showSwap && selectedLocalIdx !== null && (
            <p className="text-center text-xs text-teal-600 mt-1 animate-pulse">Toca una casella del tauler</p>
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
              {pendingMap.size > 0 && (
                <button onClick={handleUndo}
                  className="p-2.5 bg-stone-100 hover:bg-stone-200 text-stone-600 rounded-md transition-colors" title="Desfer">
                  <RotateCcw className="w-4 h-4" />
                </button>
              )}
              {pendingMap.size === 0 && (
                <button onClick={handlePass} disabled={isSubmitting}
                  className="flex-1 py-2.5 bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold rounded-md text-sm disabled:opacity-50">
                  PASSAR
                </button>
              )}
              {pendingMap.size === 0 && bagCount >= 7 && (
                <button onClick={() => setShowSwap(true)}
                  className="flex-1 py-2.5 bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold rounded-md text-sm flex items-center justify-center gap-1">
                  <RefreshCw className="w-3.5 h-3.5" /> CANVIAR
                </button>
              )}
              {pendingMap.size > 0 && (
                <button onClick={handleSubmit} disabled={isSubmitting}
                  className="flex-1 py-2.5 bg-teal-800 hover:bg-teal-700 text-white font-bold rounded-md text-sm disabled:opacity-50 flex items-center justify-center gap-2">
                  {isSubmitting
                    ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    : <>ENVIAR {previewScore !== null && <span className="bg-teal-600 text-xs px-1.5 py-0.5 rounded">{previewScore}pt</span>} <ChevronRight className="w-4 h-4" /></>
                  }
                </button>
              )}
            </div>
          ) : (
            <div className="flex gap-2">
              <button onClick={() => { setShowSwap(false); setSwapSet(new Set()); }}
                className="flex-1 py-2.5 bg-stone-100 text-stone-700 font-bold rounded-md text-sm">
                CANCEL·LAR
              </button>
              <button onClick={handleSwapConfirm} disabled={swapSet.size === 0 || isSubmitting}
                className="flex-1 py-2.5 bg-teal-800 hover:bg-teal-700 text-white font-bold rounded-md text-sm disabled:opacity-50 flex items-center justify-center gap-1">
                <RefreshCw className="w-3.5 h-3.5" /> CANVIAR ({swapSet.size})
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Overlay: impugnació ── */}
      {gameState.status === 'CHALLENGE' && gameState.challenge && (
        <div className="flex-shrink-0 bg-amber-50 border-t-2 border-amber-300 px-4 py-3">
          <p className="text-center text-sm font-bold text-teal-800 mb-3">
            {isChallenger
              ? `Jugada de ${gameState.players?.[gameState.lastMove?.playerId ?? '']?.name ?? ''}:`
              : 'Esperant que el contrincant decideixi...'}
          </p>
          {gameState.lastMove && (
            <p className="text-center text-lg font-black text-teal-700 mb-3">
              {gameState.lastMove.word} · {gameState.lastMove.score} pts
            </p>
          )}
          {isChallenger ? (
            <div className="flex gap-2">
              <button onClick={handleAcceptMove} disabled={isSubmitting}
                className="flex-1 py-2.5 bg-teal-700 hover:bg-teal-600 text-white font-bold rounded-md text-sm disabled:opacity-50">
                ACCEPTAR
              </button>
              <button onClick={handleChallenge} disabled={isSubmitting}
                className="flex-1 py-2.5 bg-coral-400 hover:bg-coral-500 text-white font-black rounded-md text-sm disabled:opacity-50">
                IMPUGNAR
              </button>
            </div>
          ) : null}
          {moveError && <p className="text-xs text-coral-400 text-center mt-1">{moveError}</p>}
        </div>
      )}

      {/* ── Overlay: lobby ── */}
      {gameState.status === 'LOBBY' && (
        <div className="flex-shrink-0 bg-white border-t border-stone-200 px-4 py-4 text-center space-y-3">
          <p className="text-sm text-stone-600">
            Jugadors: {Object.values(gameState.players ?? {}).map((p: any) => p.name).join(', ') || 'Cap jugador'}
          </p>
          {isHost && Object.keys(gameState.players ?? {}).length >= 1 && (
            <button onClick={handleStartGame} disabled={isSubmitting}
              className="w-full py-3 bg-teal-800 hover:bg-teal-700 text-white font-bold rounded-md disabled:opacity-50">
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
            {[...sortedPlayers].sort((a: any, b: any) => b.totalScore - a.totalScore).map((p: any, i: number) => (
              <div key={p.id} className="flex justify-between items-center">
                <span className={`font-bold ${i === 0 ? 'text-amber-500' : 'text-stone-600'}`}>
                  {i === 0 ? '🏆 ' : ''}{p.name}
                </span>
                <span className="font-black text-teal-800">{p.totalScore} pts</span>
              </div>
            ))}
          </div>
          <button onClick={() => navigate('/')} className="w-full py-2.5 bg-teal-800 text-white font-bold rounded-md">
            Tornar al lobby
          </button>
        </div>
      )}

      {/* ── Ghost tile durant drag ── */}
      {drag && (
        <div
          className="fixed pointer-events-none z-50 w-10 h-10 opacity-80"
          style={{ left: drag.x - 20, top: drag.y - 20 }}
        >
          <Tile tile={drag.tile} size="xl" className="!w-10 !h-10 shadow-xl scale-125" />
        </div>
      )}
    </div>
  );
};

export default ClassicGameView;

// ─── Helper: construir resultat del moviment ──────────────────────────────────

interface MoveResult {
  isValid: boolean; score: number; error?: string;
  wordStr: string; startRow: number; startCol: number; direction: 'H' | 'V';
}

function buildMoveResult(
  gameState: GameState,
  pendingMap: Map<string, PendingTile>,
  localRack: (string | null)[],
  skipValidation: boolean,
): MoveResult | null {
  if (pendingMap.size === 0) return null;

  const entries = Array.from(pendingMap.entries()).map(([key, pt]) => {
    const [row, col] = key.split(',').map(Number);
    return { row, col, tile: pt.tile };
  });

  const rows = entries.map(e => e.row);
  const cols = entries.map(e => e.col);
  const allSameRow = rows.every(r => r === rows[0]);
  const allSameCol = cols.every(c => c === cols[0]);

  if (!allSameRow && !allSameCol) return null;

  const direction: 'H' | 'V' = (entries.length === 1 || allSameRow) ? 'H' : 'V';
  const board = gameState.board;
  const dr = direction === 'H' ? 0 : 1;
  const dc = direction === 'H' ? 1 : 0;

  let startRow = direction === 'H' ? rows[0] : Math.min(...rows);
  let startCol = direction === 'H' ? Math.min(...cols) : cols[0];

  // Recular fins a l'inici de la paraula
  while (startRow - dr >= 0 && startCol - dc >= 0 &&
         board[startRow - dr]?.[startCol - dc]?.tile) {
    startRow -= dr; startCol -= dc;
  }

  // Construir paraula completa
  const pendingSet = new Map(Array.from(pendingMap.entries()).map(([k, pt]) => [k, pt.tile]));
  const wordTiles: TileType[] = [];
  let r = startRow, c = startCol;
  while (r >= 0 && r < 15 && c >= 0 && c < 15) {
    const key = `${r},${c}`;
    const bt = board[r][c].tile;
    const pt = pendingSet.get(key);
    if (pt) wordTiles.push(pt);
    else if (bt) wordTiles.push(bt);
    else break;
    r += dr; c += dc;
  }

  // Per fitxa sola: provar direcció alternativa si crea paraula
  if (entries.length === 1 && wordTiles.length < 2) {
    const altDir: 'H' | 'V' = 'V';
    const altDr = 1, altDc = 0;
    let ar = entries[0].row, ac = entries[0].col;
    while (ar - altDr >= 0 && board[ar - altDr]?.[ac]?.tile) { ar -= altDr; }
    const altTiles: TileType[] = [];
    let tr = ar, tc = ac;
    while (tr >= 0 && tr < 15) {
      const k = `${tr},${tc}`;
      const bt = board[tr][tc].tile;
      const pt = pendingSet.get(k);
      if (pt) altTiles.push(pt); else if (bt) altTiles.push(bt); else break;
      tr += altDr;
    }
    if (altTiles.length >= 2) {
      const rackCharsForScore = localRack.filter(Boolean) as string[];
      const scoreResult = calculateMoveScore(board, altTiles, rackCharsForScore, ar, ac, altDir);
      return {
        isValid: skipValidation ? true : scoreResult.isValid,
        score: scoreResult.score,
        error: scoreResult.error,
        wordStr: altTiles.map(t => t.displayChar).join(''),
        startRow: ar, startCol: ac, direction: altDir,
      };
    }
  }

  const rackCharsForScore = localRack.filter(Boolean) as string[];
  const scoreResult = calculateMoveScore(board, wordTiles, rackCharsForScore, startRow, startCol, direction);

  return {
    isValid: skipValidation ? true : scoreResult.isValid,
    score: scoreResult.score,
    error: scoreResult.error,
    wordStr: wordTiles.map(t => t.displayChar).join(''),
    startRow, startCol, direction,
  };
}
