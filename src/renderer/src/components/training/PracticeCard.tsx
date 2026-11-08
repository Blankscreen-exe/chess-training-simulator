import type { PracticeRecord } from '@shared/profile'
import { useStartPuzzle } from '../../hooks/useStartPuzzle'
import { describePractice } from '../../lib/profile'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'

/** The positions the player missed, coming back to practise, and starting the next one due. */
export function PracticeCard({
  practice,
  onShow,
}: {
  practice: PracticeRecord
  onShow: () => void
}) {
  const { start, problem } = useStartPuzzle(onShow)
  return (
    <Card title="Practice">
      <p className="text-stone-300">{describePractice(practice)}</p>
      {practice.due > 0 && (
        <Button variant="primary" onClick={() => void start({ practice: true })}>
          Practise
        </Button>
      )}
      {problem && (
        <p className="text-red-300" role="alert">
          {problem}
        </p>
      )}
    </Card>
  )
}
