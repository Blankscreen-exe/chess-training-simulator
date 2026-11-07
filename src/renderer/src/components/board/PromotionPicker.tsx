import type { Role } from '@lichess-org/chessground/types'
import type { Color, PromotionPiece } from '@shared/chess'
import { PROMOTION_PIECES } from '@shared/chess'
import { PieceIcon } from './PieceIcon'

const ROLES: Record<PromotionPiece, Role> = { q: 'queen', r: 'rook', b: 'bishop', n: 'knight' }

/** Asks which piece a pawn becomes. Clicking outside the choices takes the move back. */
export function PromotionPicker({
  color,
  onPick,
  onCancel,
}: {
  color: Color
  onPick: (piece: PromotionPiece) => void
  onCancel: () => void
}) {
  return (
    <div
      className="absolute inset-0 z-20 flex items-center justify-center bg-black/50"
      onClick={onCancel}
    >
      <div
        className="rounded-lg bg-stone-900 p-4 shadow-2xl"
        role="dialog"
        aria-label="Promote the pawn to"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="mb-3 text-center text-sm text-stone-300">Promote to</p>
        <div className="flex gap-2">
          {PROMOTION_PIECES.map((piece) => {
            const role = ROLES[piece]
            const name = role.charAt(0).toUpperCase() + role.slice(1)
            return (
              <button
                key={piece}
                type="button"
                title={name}
                aria-label={name}
                className="size-20 rounded-md bg-stone-800 p-1 hover:bg-stone-700 focus-visible:outline-2 focus-visible:outline-amber-400"
                onClick={() => onPick(piece)}
              >
                <PieceIcon role={role} color={color} className="size-full" />
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
