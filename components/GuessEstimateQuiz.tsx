"use client"

import React, { useState } from 'react'
import SafeImage from '@/components/SafeImage'

type Item = {
  id?: string | number
  title?: string
  slug?: string
  previewImage?: string | null
  estimate: number
}

export default function GuessEstimateQuiz({ items, tolerance = 0.1, goal = 10 }: { items: Item[]; tolerance?: number; goal?: number }) {
  const [index, setIndex] = useState(0)
  const [score, setScore] = useState(0)
  const [guess, setGuess] = useState('')
  const [history, setHistory] = useState<any[]>([])
  const [finished, setFinished] = useState(false)

  const total = items.length

  const submit = (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (index >= total) return
    const cur = items[index]
    const raw = String(guess || '').replace(/[^0-9.-]/g, '')
    const n = Number(raw)
    const correct = !Number.isNaN(n) && Math.abs(n - cur.estimate) <= Math.max(1, Math.abs(cur.estimate) * tolerance)
    const entry = { id: cur.id, title: cur.title, guessed: n, actual: cur.estimate, correct }
    setHistory((h) => [...h, entry])
    if (correct) setScore((s) => s + 1)
    setGuess('')
    const next = index + 1
    if (score + (correct ? 1 : 0) >= goal) {
      setFinished(true)
      return
    }
    if (next >= total) {
      setFinished(true)
      setIndex(next)
      return
    }
    setIndex(next)
  }

  const currentItem = items[index]

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <strong className="text-lg">Score: {score}</strong>
          <div className="text-sm text-gray-600">Progress: {Math.min(index, total)}/{total}</div>
        </div>
        <div className="text-sm text-gray-500">Goal: {goal} points</div>
      </div>

      {finished ? (
        <div className="p-6 bg-green-50 border border-green-200 rounded">
          <h2 className="text-2xl font-bold mb-2">Finished</h2>
          <p className="mb-3">Your final score: <strong>{score}</strong></p>
          <details className="text-sm text-gray-700">
            <summary className="cursor-pointer">Review guesses</summary>
            <ul className="mt-2 space-y-2">
              {history.map((h, i) => (
                <li key={i} className={h.correct ? 'text-green-700' : 'text-red-700'}>
                  {h.title} — guessed {h.guessed ?? '—'}, actual {h.actual}
                </li>
              ))}
            </ul>
          </details>
        </div>
      ) : (
        currentItem && (
          <div className="p-4 border rounded-md">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="w-full md:w-1/2 h-64 bg-gray-50 rounded overflow-hidden relative">
                {currentItem.previewImage ? (
                  <SafeImage src={currentItem.previewImage} alt={currentItem.title || ''} fill sizes="(max-width: 640px) 100vw, 50vw" className="object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">🎨</div>
                )}
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-semibold mb-2">{currentItem.title}</h3>
                <form onSubmit={submit} className="space-y-3">
                  <label className="block text-sm">Your estimate (numbers only):</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9,\.\s]*"
                    value={guess}
                    onChange={(e) => setGuess(e.target.value)}
                    className="w-full border rounded px-3 py-2"
                    aria-label="Your estimate"
                  />
                  <div className="flex gap-2">
                    <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded">Submit</button>
                    <button type="button" onClick={() => { setGuess(String(currentItem.estimate)); }} className="px-3 py-2 border rounded">Show answer</button>
                  </div>
                </form>
                <div className="mt-3 text-sm text-gray-600">Hint: a guess within ±{Math.round(tolerance * 100)}% counts as correct.</div>
              </div>
            </div>
          </div>
        )
      )}

      {/* Small history summary */}
      {history.length > 0 && (
        <div className="mt-6">
          <h4 className="font-semibold mb-2">Recent guesses</h4>
          <ul className="space-y-2 text-sm">
            {history.slice(-5).reverse().map((h, i) => (
              <li key={i} className={h.correct ? 'text-green-600' : 'text-red-600'}>
                {h.title} — guessed {h.guessed ?? '—'} — {h.correct ? '✓' : '✕'}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
