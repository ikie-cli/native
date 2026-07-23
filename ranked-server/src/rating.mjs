export function ratingChange(winnerRating, loserRating, k = 32) {
  const expectedWinner = 1 / (1 + 10 ** ((loserRating - winnerRating) / 400))
  const delta = Math.max(1, Math.round(k * (1 - expectedWinner)))
  return { winner: delta, loser: -delta }
}

/** K-factor scales with games played this season: placements swing hardest. */
export function placementK(games) {
  return games < 10 ? 40 : games < 25 ? 32 : 24
}

/** Asymmetric Elo update — each player's swing uses their own placement K. */
export function seasonRatingChange(winnerRating, loserRating, winnerGames, loserGames) {
  const expectedWinner = 1 / (1 + 10 ** ((loserRating - winnerRating) / 400))
  return {
    winner: Math.max(1, Math.round(placementK(winnerGames) * (1 - expectedWinner))),
    loser: -Math.max(1, Math.round(placementK(loserGames) * (1 - expectedWinner)))
  }
}
