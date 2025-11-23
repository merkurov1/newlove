import { GoogleGenerativeAI } from '@google/generative-ai'
import { NextResponse } from 'next/server'

// Инициализация (проверка ключа)
const apiKey = process.env.GOOGLE_API_KEY
const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null

export async function POST(req: Request) {
  try {
    // 1. Проверка ключа
    if (!genAI) {
      console.error('SERVER ERROR: GOOGLE_API_KEY is missing in env variables')
      return NextResponse.json(
        { error: 'Server misconfiguration: API Key missing' },
        { status: 500 }
      )
    }

    // 2. Разбор запроса
    const body = await req.json()
    const { answers, language } = body

    if (!answers || !Array.isArray(answers)) {
      return NextResponse.json({ error: 'Invalid data format' }, { status: 400 })
    }

    // 3. Формирование промпта
    const model = genAI.getGenerativeModel({ model: 'gemini-pro' })
    
    const langInstruction = language === 'ru' 
      ? 'ANSWER STRICTLY IN RUSSIAN.' 
      : 'ANSWER STRICTLY IN ENGLISH.'

    const prompt = `
      ROLE: You are THE MERKUROV ANALYZER. A strategic digital advisor.
      TONE: Cold, Clinical, Brutally Honest, Intellectual. NO fluff, NO apologies.
      TASK: Analyze the human based on these 10 answers.
      
      USER ANSWERS:
      ${answers.map((a, i) => `${i + 1}. ${a}`).join('\n')}

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

    // 4. Запрос к AI
    const result = await model.generateContent(prompt)
    const response = await result.response
    const text = response.text()

    // 5. Успешный ответ
    return NextResponse.json({ analysis: text })

  } catch (error) {
    console.error('GEMINI API ERROR:', error)
    return NextResponse.json(
      { error: 'Internal Server Error', details: String(error) },
      { status: 500 }
    )
  }
}