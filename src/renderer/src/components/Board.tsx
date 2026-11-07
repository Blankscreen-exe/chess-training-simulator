const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const
const ranks = [8, 7, 6, 5, 4, 3, 2, 1] as const

/** An empty board, in place of the real one that comes with the chess core. */
export function Board() {
  return (
    <div
      className="grid aspect-square h-full max-h-full max-w-full grid-cols-8 overflow-hidden rounded-md shadow-2xl shadow-black/50"
      role="img"
      aria-label="Empty chessboard"
    >
      {ranks.map((rank, row) =>
        files.map((file, column) => (
          <div
            key={`${file}${rank}`}
            className={(row + column) % 2 === 0 ? 'bg-board-light' : 'bg-board-dark'}
          />
        )),
      )}
    </div>
  )
}
