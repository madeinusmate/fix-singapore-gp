// Singapore keeps the original board id. Every other circuit's raced lap
// has its own board, so a time set in Monaco cannot land on Marina Bay.
export const boardId = (circuit, id) => (
  id === 'current' && circuit && circuit !== 'singapore' ? `${circuit}-current` : id
)
