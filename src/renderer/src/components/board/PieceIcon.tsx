import type { Role } from '@lichess-org/chessground/types'
import { createElement, type HTMLAttributes } from 'react'
import type { Color } from '@shared/chess'

/** A piece drawn with the board's own piece set, outside the board. */
export function PieceIcon({
  role,
  color,
  className = '',
  ...rest
}: { role: Role; color: Color } & HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`cg-wrap ${className}`} {...rest}>
      {/* The piece set's styles are written for chessground's own <piece> element. */}
      {createElement('piece', {
        className: `${role} ${color}`,
        style: { position: 'static', display: 'block', width: '100%', height: '100%' },
      })}
    </div>
  )
}
