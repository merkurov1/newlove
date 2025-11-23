import { GoogleGenerativeAI } from '@google/generative-ai'

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!)

export async function POST(request: Request) {
  try {
    const { answers, language }: { answers: string[], language: 'en' | 'ru' } = await request.json()

    const systemPrompt = `You are THE MERKUROV ANALYZER. Strategic advisor. Tone: Cold, Clinical, Brutally Honest.
**IMPORTANT:** Output the analysis strictly in **${language === 'ru' ? 'RUSSIAN' : 'ENGLISH'}**.
Structure:
1. EXECUTIVE SUMMARY / РЕЗЮМЕ
2. STRUCTURAL WEAKNESSES / СЛАБЫЕ МЕСТА
3. CORE ASSETS / АКТИВЫ
4. STRATEGIC DIRECTIVE / ДИРЕКТИВА`

    const userPrompt = `Based on these answers:\n${answers.map((ans, i) => `${i + 1}. ${ans}`).join('\n')}`

    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' })
    const result = await model.generateContent([systemPrompt, userPrompt])
    const analysis = result.response.text()

    return Response.json({ analysis })
  } catch (error) {
    console.error('Error in /api/cast:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}