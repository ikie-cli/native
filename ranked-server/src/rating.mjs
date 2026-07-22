export function ratingChange(winnerRating, loserRating, k = 32) {
  const expectedWinner = 1 / (1 + 10 ** ((loserRating - winnerRating) / 400))
  const delta = Math.max(1, Math.round(k * (1 - expectedWinner)))
  return { winner: delta, loser: -delta }
}
