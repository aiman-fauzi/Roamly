import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { Chip } from '@/components/ui/Chip'
import { Slider } from '@/components/ui/Slider'
import { Stepper } from '@/components/ui/Stepper'

describe('input controls', () => {
  it('clamps slider changes to the configured range and step', () => {
    const onChange = vi.fn()

    render(
      <Slider
        label="Budget"
        value={1000}
        min={100}
        max={50000}
        step={100}
        onChange={onChange}
      />
    )

    fireEvent.change(screen.getByRole('slider', { name: /budget/i }), {
      target: { value: '50123' },
    })

    expect(onChange).toHaveBeenCalledWith(50000)
  })

  it('prevents steppers from incrementing above the configured maximum', () => {
    const onChange = vi.fn()

    render(<Stepper label="Group size" value={20} min={1} max={20} onChange={onChange} />)

    fireEvent.click(screen.getByRole('button', { name: /increase group size/i }))

    expect(onChange).not.toHaveBeenCalled()
  })

  it('announces chip selection state and emits clicks', () => {
    const onClick = vi.fn()

    render(<Chip label="Adventure" selected={true} onClick={onClick} />)

    const chip = screen.getByRole('button', { name: /adventure/i })
    expect(chip).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(chip)
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})
