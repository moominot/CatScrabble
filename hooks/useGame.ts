import { useState, useEffect } from 'react';
import { db } from '../firebaseConfig';
import { GameState } from '../types';

export const useGame = (gameId: string | null) => {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!gameId) { setLoading(false); return; }

    const ref = db.ref(`games/${gameId}`);
    const handler = ref.on('value', snap => {
      if (!snap.exists()) { setError('Partida no trobada'); setLoading(false); return; }
      setGameState(snap.val() as GameState);
      setLoading(false);
    }, err => {
      setError(err.message);
      setLoading(false);
    });

    return () => ref.off('value', handler);
  }, [gameId]);

  return { gameState, loading, error };
};

// Hook per al faristol privat del jugador
export const usePlayerRack = (gameId: string | null, playerId: string | null) => {
  const [rack, setRack] = useState<string[]>([]);

  useEffect(() => {
    if (!gameId || !playerId) return;
    const ref = db.ref(`games/${gameId}/racks/${playerId}`);
    const handler = ref.on('value', snap => {
      setRack(snap.val() ?? []);
    });
    return () => ref.off('value', handler);
  }, [gameId, playerId]);

  return rack;
};
