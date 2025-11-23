import { GoogleGenerativeAI } from '@google/generative-ai'
import { NextResponse } from 'next/server'

// ЭТА СТРОКА ОБЯЗАТЕЛЬНА ДЛЯ VERCEL + GOOGLE SDK
export const runtime = 'nodejs'

const apiKey = process.env.GOOGLE_API_KEY || ""
const genAI = new GoogleGenerativeAI(apiKey)

export async function POST(req: Request) {
  try {
    if (!apiKey) {
      return NextResponse.json({ error: 'API Key missing' }, { status: 500 })
    }

    const body = await req.json()
    const { answers, language } = body

    // ИСПОЛЬЗУЕМ АКТУАЛЬНУЮ МОДЕЛЬ ИЗ ТВОЕГО СПИСКА (2025 год)
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })

    const langInstruction = language === 'ru' 
      ? 'ANSWER STRICTLY IN RUSSIAN.' 
      : 'ANSWER STRICTLY IN ENGLISH.'

    const prompt = `
      ROLE: You are THE MERKUROV ANALYZER. Strategic advisor.
      TONE: Cold, Clinical, Brutally Honest.
      TASK: Analyze the user based on these 10 answers.
      
      USER ANSWERS:
      ${answers.map((a: string, i: number) => `${i + 1}. ${a}`).join('\n')}

      INSTRUCTION: ${langInstruction}
      
      OUTPUT FORMAT (Markdown):
      # SUBJECT ANALYSIS
      
      ## I. EXECUTIVE SUMMARY
      [Who is this person? 2 sentences deep psychoanalysis]
      
      ## II. STRUCTURAL INTEGRITY
      [Analysis of their trauma and past]
      
      ## III. DIGITAL FOOTPRINT
      [Analysis of their vanity and lies]
      
      ## IV. STRATEGIC DIRECTIVE
      [One imperative command for their life]
    `

    const result = await model.generateContent(prompt)
    const response = await result.response
    const text = response.text()

    return NextResponse.json({ analysis: text })

  } catch (error) {
    console.error('GEMINI API ERROR:', error)
    return NextResponse.json(
      { error: 'Internal Server Error', details: String(error) },
      { status: 500 }
    )
  }
}